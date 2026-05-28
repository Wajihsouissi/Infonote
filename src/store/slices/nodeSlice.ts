import type { StateCreator } from 'zustand';
import {
    type Edge,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../../types';
import { MIN_FUSED_SIZE, BASE_UNIT, snapToGridValue, ICON_SIZE, GRID_GAP } from '../../config/layout';
import { computeParentContentUpdate } from '../contentSync';
import type { AppState, NodeSlice } from '../types';

// Debug flag - set to false in production
const DEBUG = import.meta.env.DEV;

// Debounce map for parent content sync to prevent thrashing
const pendingSyncTimers = new Map<string, number>();

// Helper to schedule debounced sync
function scheduleParentSync(parentId: string, syncFn: () => void, delayMs: number = 250) {
    // Clear existing timer for this parent
    const existingTimer = pendingSyncTimers.get(parentId);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }
    
    // Schedule new sync
    const timerId = window.setTimeout(() => {
        pendingSyncTimers.delete(parentId);
        syncFn();
    }, delayMs);
    
    pendingSyncTimers.set(parentId, timerId);
}

// Default initial state (will be replaced by loadGraph if storage has data)
const getInitialNodes = (): AppNode[] => {
    // Check if we should skip defaults (storage will load)
    return [
        {
            id: '1',
            type: 'note',
            position: { x: 100, y: 100 },
            data: {
                label: 'Project Goal',
                content: [],
                viewMode: 'expanded',
                icon: 'Target',
                description: 'A comprehensive note-taking application with infinite canvas capabilities',
                category: 'Planning',
                date: new Date().toISOString()
            },
            style: { width: 432, height: 432 },
            parentId: undefined,
        },
        {
            id: '2',
            type: 'note',
            position: { x: 600, y: 100 },
            data: {
                label: 'Features',
                content: [{ id: 'b1', type: 'text', content: 'Atomic notes, infinite canvas, linking.' }],
                viewMode: 'medium',
                icon: 'Sparkles',
                description: 'Core features include atomic notes, infinite canvas, and smart linking between notes',
                category: 'Features'
            },
            style: { width: 208, height: 208 },
            parentId: undefined,
        },
        {
            id: '3',
            type: 'note',
            position: { x: 600, y: 300 },
            data: {
                label: 'Tech Stack',
                content: [],
                viewMode: 'icon',
                icon: 'Settings'
            },
            style: { width: 96, height: 96 },
            parentId: undefined,
        },
    ];
};

const initialEdges: Edge[] = [];

export const createNodeSlice: StateCreator<AppState, [], [], NodeSlice> = (set, get) => ({
    nodes: getInitialNodes(),
    edges: initialEdges,

    onNodesChange: (changes) => {
        // Only build detailed logging for non-trivial changes to reduce console noise
        if (DEBUG) {
            const importantChanges = changes.filter(c => c.type !== 'select' && c.type !== 'dimensions');
            if (importantChanges.length > 0) {
                console.log("[onNodesChange] Received changes:", importantChanges.map(c => {
                    const detail: any = { type: c.type, id: (c as any).id };
                    if (c.type === 'remove') detail.removing = (c as any).id;
                    else if (c.type === 'position') { detail.position = (c as any).position; detail.dragging = (c as any).dragging; }
                    return detail;
                }));
            }
        }

        // CRITICAL FIX: Preserve parentId for nodes during 'replace' and other changes
        const filteredChanges = changes.map(change => {
            if (change.type === 'replace') {
                const nodeId = (change as any).id;
                const existingNode = get().nodes.find(n => n.id === nodeId);
                if (existingNode && existingNode.parentId) {
                    if (DEBUG) console.log("[onNodesChange] Preserving parentId for node during replace:", nodeId);
                    return {
                        ...change,
                        item: {
                            ...(change as any).item,
                            parentId: existingNode.parentId
                        }
                    };
                }
            }
            return change;
        }).filter(c => c !== null) as any[];

        const nodesBefore = get().nodes.length;

        set({
            nodes: applyNodeChanges(filteredChanges, get().nodes) as AppNode[],
        });

        const nodesAfter = get().nodes.length;

        if (nodesBefore !== nodesAfter) {
            if (DEBUG) {
                console.log("[onNodesChange] Nodes count changed:", {
                    before: nodesBefore,
                    after: nodesAfter
                });
            }
        }

        // Mark cloud dirty on structural or position changes (not select/dimensions)
        const hasMeaningfulChange = filteredChanges.some(
            (c: any) => c.type === 'remove' || c.type === 'add' || c.type === 'replace' ||
                (c.type === 'position' && c.dragging === false)
        );
        if (hasMeaningfulChange) {
            get().setCloudDirty?.(true);
        }

        // Optimization: Sync parent content on structural changes OR position changes (to update order)
        const hasStructuralChange = filteredChanges.some(c => c.type === 'remove' || c.type === 'add' || c.type === 'dimensions');
        const hasFinishedDragging = filteredChanges.some(c => c.type === 'position' && c.dragging === false);

        const { currentParentId } = get();
        if (currentParentId && (hasStructuralChange || hasFinishedDragging)) {
            if (DEBUG) console.log("[onNodesChange] Scheduling syncParentContent for:", currentParentId);
            scheduleParentSync(currentParentId, () => get().syncParentContent(currentParentId));
        }
    },

    setNodes: (nodesOrUpdater) => {
        const nextNodes = typeof nodesOrUpdater === 'function'
            ? nodesOrUpdater(get().nodes)
            : nodesOrUpdater;

        set({ nodes: nextNodes });
        get().setCloudDirty?.(true);
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
        // Mark dirty on edge removal/addition
        const hasMeaningfulEdgeChange = changes.some(c => c.type === 'remove' || c.type === 'add' || c.type === 'replace');
        if (hasMeaningfulEdgeChange) {
            get().setCloudDirty?.(true);
        }
    },

    onConnect: (connection) => {
        // Prevent self-connections: a node cannot connect to itself
        if (connection.source === connection.target) return;

        const { currentParentId } = get();
        // Capture the active context from navigationSlice so edges only render
        // inside the canvas where they were created (parent-scoped visibility).
        const parentIdForEdge = currentParentId ?? null;

        const newEdge: Edge = {
            ...connection,
            id: uuidv4(),
            type: 'centered',
            data: { parentId: parentIdForEdge },
        } as Edge;

        set({
            edges: addEdge(newEdge, get().edges),
        });
        get().setCloudDirty?.(true);
    },

    addNode: (type, position, initialData, style, parentId, customId) => {
        const { currentParentId } = get();
        const targetParentId = parentId !== undefined ? parentId : (currentParentId || undefined);

        const snappedPosition = {
            x: snapToGridValue(position.x),
            y: snapToGridValue(position.y)
        };

        const newNode: AppNode = {
            id: customId || uuidv4(),
            type,
            position: snappedPosition,
            style: style || (type === 'fused-note' ? { width: MIN_FUSED_SIZE } : { width: 432, height: 432 }),
            data: {
                label: (initialData?.label as string) || 'New Note',
                content: '',
                viewMode: 'expanded',
                icon: 'FileText',
                ...initialData
            } as AppNode['data'],
            parentId: targetParentId,
        } as AppNode;

        if (DEBUG) {
            console.log("[addNode] Creating node:", {
                id: newNode.id,
                type: newNode.type,
                parentId: targetParentId,
                isStandalone: (newNode.data as any).isStandaloneBlock,
                currentParentId
            });
        }

        set((state) => {
            if (state.nodes.some(n => n.id === newNode.id)) {
                if (DEBUG) console.warn(`[Store] Duplicate node ID detected: ${newNode.id}. Skipping add.`);
                return {};
            }
            return { nodes: [...state.nodes, newNode] };
        });
        get().setCloudDirty?.(true);

        if (targetParentId) {
            if (DEBUG) console.log("[addNode] Scheduling syncParentContent for:", targetParentId);
            scheduleParentSync(targetParentId, () => get().syncParentContent(targetParentId));
        }
    },

    updateNodeData: (id, data) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === id ? ({ ...node, data: { ...node.data, ...data } } as AppNode) : node
            ),
        });
        get().setCloudDirty?.(true);

        const { currentParentId } = get();
        
        // Sync parent content if we're updating a child node
        if (currentParentId) {
            scheduleParentSync(currentParentId, () => get().syncParentContent(currentParentId));
        }

        // BIDIRECTIONAL SYNC: If updating a parent note's content, sync down to child nodes
        if (data.content && Array.isArray(data.content)) {
            const parentContent = data.content as any[];
            const updatedNode = get().nodes.find(n => n.id === id);
            
            // Only sync down if this is a parent note (has children) AND we're NOT in that parent's canvas
            // This prevents sync loops and only syncs when editing from outside the child canvas
            if (updatedNode && updatedNode.type === 'note' && currentParentId !== id) {
                const children = get().nodes.filter(n => n.parentId === id);
                
                if (children.length > 0) {
                    // Update child nodes based on parent content changes
                    set((state) => ({
                        nodes: state.nodes.map(node => {
                            if (node.parentId === id) {
                                // For fused-note and block nodes, update their content from parent
                                if (node.type === 'fused-note' || node.type === 'block') {
                                    const childContent = (node.data as any).content;
                                    if (Array.isArray(childContent) && childContent.length > 0) {
                                        // Find matching blocks in parent content by ID
                                        const firstBlockId = childContent[0].id;
                                        const matchingIndex = parentContent.findIndex((b: any) => b.id === firstBlockId);
                                        
                                        if (matchingIndex !== -1) {
                                            // Extract the corresponding blocks from parent
                                            const updatedBlocks = parentContent.slice(
                                                matchingIndex,
                                                matchingIndex + childContent.length
                                            );
                                            
                                            // Only update if blocks actually changed
                                            const hasChanged = JSON.stringify(childContent) !== JSON.stringify(updatedBlocks);
                                            if (hasChanged && updatedBlocks.length === childContent.length) {
                                                return {
                                                    ...node,
                                                    data: {
                                                        ...node.data,
                                                        content: updatedBlocks
                                                    }
                                                };
                                            }
                                        }
                                    }
                                }
                            }
                            return node;
                        })
                    }));
                }
            }

            // Update linked page block labels
            const linkedUpdates: { id: string, label: string }[] = [];
            data.content.forEach((b: any) => {
                if (b.type === 'page' && b.metadata?.nodeId) {
                    linkedUpdates.push({ id: b.metadata.nodeId, label: b.content });
                }
            });

            if (linkedUpdates.length > 0) {
                set((state) => {
                    const nodesToUpdate = state.nodes.filter(n => {
                        const update = linkedUpdates.find(u => u.id === n.id);
                        return update && (n.data as any).label !== update.label;
                    });

                    if (nodesToUpdate.length === 0) return state;

                    return {
                        nodes: state.nodes.map(n => {
                            const update = linkedUpdates.find(u => u.id === n.id);
                            if (update && (n.data as any).label !== update.label) {
                                return { ...n, data: { ...n.data, label: update.label } };
                            }
                            return n;
                        }) as AppNode[]
                    };
                });
            }
        }
    },

    updateNode: (id, updates) => {
        set((state) => ({
            nodes: state.nodes.map((node) =>
                node.id === id ? { ...node, ...updates } as AppNode : node
            ),
        }));
        get().setCloudDirty?.(true);
    },

    releaseNodeContentToBlocks: (nodeId: string, centerPosition?: { x: number; y: number }, skipConfirm?: boolean) => {
        if (!skipConfirm && !window.confirm(
            'Release this node\'s content as individual blocks? The source node will be replaced.'
        )) return;

        const { nodes, edges, currentParentId } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);
        if (!sourceNode) return;

        const rawContent = (sourceNode.data as any).content;
        const normalizeText = (value: unknown) => {
            if (typeof value !== 'string') return '';
            return value.trim().replace(/[\n\u200B\u00A0\u200C\uFEFF]/g, '');
        };
        const isEmptyBlock = (b: any) => {
            if (!b) return true;
            if (b.type === 'divider') return true;
            if (b.type === 'table') {
                const rows = b.metadata?.rows;
                if (!Array.isArray(rows) || rows.length === 0) return true;
                return rows.every((row: any) =>
                    Array.isArray(row) && row.every((cell: any) => normalizeText(String(cell)).length === 0)
                );
            }
            if (b.type === 'columns') {
                const cols = b.metadata?.columns;
                return !Array.isArray(cols) || cols.length === 0;
            }
            return normalizeText(b.content).length === 0;
        };
        const blocks = Array.isArray(rawContent)
            ? rawContent.filter((b: any) => !isEmptyBlock(b))
            : (typeof rawContent === 'string' && rawContent.trim().length > 0)
                ? [{ id: uuidv4(), type: 'text', content: rawContent }]
                : [];

        if (blocks.length === 0) return;

        const parentId = currentParentId || undefined;
        const parentIdForEdge = currentParentId ?? null;

        const resolvedCenterX = centerPosition?.x ?? sourceNode.position.x;
        const resolvedCenterY = centerPosition?.y ?? sourceNode.position.y;
        const baseCenter = { x: snapToGridValue(resolvedCenterX), y: snapToGridValue(resolvedCenterY) };

        // --- Split into sections by heading boundaries ---
        const headingTypes = new Set(['heading1', 'heading2', 'heading3']);
        const isHeadingBlock = (b: any) => b && headingTypes.has(b.type);
        interface Section { heading: any | null; blocks: any[] }
        const sections: Section[] = [];

        const headingIndices = blocks
            .map((b: any, i: number) => (isHeadingBlock(b) ? i : -1))
            .filter((i: number) => i >= 0);

        if (headingIndices.length === 0) {
            sections.push({ heading: null, blocks });
        } else {
            // Capture content before the first heading
            if (headingIndices[0] > 0) {
                sections.push({ heading: null, blocks: blocks.slice(0, headingIndices[0]) });
            }
            for (let i = 0; i < headingIndices.length; i++) {
                const startIdx = headingIndices[i];
                const endIdx = i + 1 < headingIndices.length ? headingIndices[i + 1] : blocks.length;
                sections.push({
                    heading: blocks[startIdx],
                    blocks: blocks.slice(startIdx + 1, endIdx)
                });
            }
        }

        // --- Smart node sizing ---
        const getNodeStyle = (block: any, isHeading: boolean) => {
            if (isHeading) return { width: 220, height: 80 };
            switch (block.type) {
                case 'image':
                case 'video':
                case 'file':
                    return { width: 200, height: 200 };
                case 'code':
                    return { width: 340, height: 160 };
                case 'table':
                    return { width: 360, height: 180 };
                case 'callout':
                    return { width: 280, height: 100 };
                case 'todo':
                case 'bullet':
                case 'numbered':
                    return { width: 260, height: 70 };
                default:
                    const len = normalizeText(block.content).length;
                    if (len < 50) return { width: 260, height: 70 };
                    if (len < 200) return { width: 300, height: 100 };
                    return { width: 340, height: 140 };
            }
        };

        const createBlockNode = (block: any, position: { x: number; y: number }, style: { width: number; height: number }) => ({
            id: uuidv4(),
            type: 'block',
            position,
            style,
            data: { content: [block], isStandaloneBlock: true } as any,
            parentId
        } as AppNode);

        // --- Build a radial cluster from a center node + outer blocks ---
        const buildRadialCluster = (centerNode: AppNode, outerBlocks: any[], centerPos: { x: number; y: number }) => {
            const clusterNodes: AppNode[] = [centerNode];
            const clusterEdges: Edge[] = [];

            if (outerBlocks.length === 0) return { nodes: clusterNodes, edges: clusterEdges, radius: 0 };

            const outerStyles = outerBlocks.map(b => getNodeStyle(b, false));
            const maxOuterWidth = Math.max(...outerStyles.map(s => s.width));
            const minRadius = BASE_UNIT * 4;
            const estimatedRadius = outerBlocks.length <= 1
                ? minRadius
                : (maxOuterWidth * 1.5) / (2 * Math.sin(Math.PI / outerBlocks.length));
            const r = snapToGridValue(Math.max(minRadius, estimatedRadius));
            const angleStep = (2 * Math.PI) / outerBlocks.length;
            const angleOffset = -Math.PI / 2;

            outerBlocks.forEach((block, idx) => {
                const angle = angleOffset + angleStep * idx;
                const x = snapToGridValue(centerPos.x + r * Math.cos(angle));
                const y = snapToGridValue(centerPos.y + r * Math.sin(angle));
                const node = createBlockNode(block, { x, y }, outerStyles[idx]);
                clusterNodes.push(node);
                clusterEdges.push({
                    id: uuidv4(),
                    source: centerNode.id,
                    target: node.id,
                    type: 'centered',
                    data: { parentId: parentIdForEdge }
                } as Edge);
            });

            return { nodes: clusterNodes, edges: clusterEdges, radius: r + maxOuterWidth / 2 };
        };

        const newNodes: AppNode[] = [];
        const newEdges: Edge[] = [];

        if (sections.length === 1) {
            const section = sections[0];
            if (section.heading) {
                const headingStyle = getNodeStyle(section.heading, true);
                const centerNode = createBlockNode(section.heading, baseCenter, headingStyle);
                const cluster = buildRadialCluster(centerNode, section.blocks, baseCenter);
                newNodes.push(...cluster.nodes);
                newEdges.push(...cluster.edges);
            } else if (section.blocks.length > 0) {
                const centerBlock = section.blocks[0];
                const centerStyle = getNodeStyle(centerBlock, false);
                const centerNode = createBlockNode(centerBlock, baseCenter, centerStyle);
                const cluster = buildRadialCluster(centerNode, section.blocks.slice(1), baseCenter);
                newNodes.push(...cluster.nodes);
                newEdges.push(...cluster.edges);
            }
        } else {
            // Multiple sections → each section is a separate radial cluster arranged horizontally
            const clusters: { nodes: AppNode[]; edges: Edge[]; radius: number }[] = [];

            for (const section of sections) {
                let centerNode: AppNode;
                if (section.heading) {
                    const headingStyle = getNodeStyle(section.heading, true);
                    centerNode = createBlockNode(section.heading, { x: 0, y: 0 }, headingStyle);
                } else if (section.blocks.length > 0) {
                    const centerStyle = getNodeStyle(section.blocks[0], false);
                    centerNode = createBlockNode(section.blocks[0], { x: 0, y: 0 }, centerStyle);
                    section.blocks = section.blocks.slice(1);
                } else {
                    continue;
                }
                const cluster = buildRadialCluster(centerNode, section.blocks, { x: 0, y: 0 });
                clusters.push(cluster);
            }

            let offsetX = baseCenter.x;
            for (let ci = 0; ci < clusters.length; ci++) {
                const cluster = clusters[ci];
                for (const node of cluster.nodes) {
                    node.position.x += offsetX;
                    node.position.y += baseCenter.y;
                }
                newNodes.push(...cluster.nodes);
                newEdges.push(...cluster.edges);

                if (ci > 0) {
                    const prevCenterId = clusters[ci - 1].nodes[0].id;
                    const currCenterId = cluster.nodes[0].id;
                    newEdges.push({
                        id: uuidv4(),
                        source: prevCenterId,
                        target: currCenterId,
                        type: 'centered',
                        data: { parentId: parentIdForEdge }
                    } as Edge);
                }

                const clusterSpan = cluster.radius > 0 ? cluster.radius * 2 : BASE_UNIT * 4;
                offsetX += clusterSpan + BASE_UNIT * 3;
            }
        }

        const newEdgesBase = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
        const newNodesBase = nodes.filter(n => n.id !== nodeId);

        set({
            nodes: [...newNodesBase, ...newNodes],
            edges: [...newEdgesBase, ...newEdges]
        });
        get().setCloudDirty?.(true);

        if (currentParentId) {
            scheduleParentSync(currentParentId, () => get().syncParentContent(currentParentId));
        }
    },

    splitNode: (nodeId, splitBlockId, currentBlocks, skipConfirm) => {
        const { nodes, edges } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);

        if (!sourceNode || !('content' in sourceNode.data) || !Array.isArray((sourceNode.data as any).content)) return;

        if (!skipConfirm && !window.confirm(
            'Split this node at the selected block? Content will be moved to a new fused note.'
        )) return;

        // Use caller-provided blocks if available (avoids stale store state from debounce),
        // otherwise fall back to store data
        const blocks = (currentBlocks && currentBlocks.length > 0)
            ? currentBlocks
            : (sourceNode.data as any).content as any[];
        const splitIndex = blocks.findIndex(b => b.id === splitBlockId);

        if (splitIndex === -1 || splitIndex === 0) return;

        const blocksToStay = blocks.slice(0, splitIndex);
        const blocksToMove = blocks.slice(splitIndex);

        if (blocksToMove.length === 0) return;

        const currentHeight = sourceNode.style?.height && typeof sourceNode.style.height === 'number'
            ? sourceNode.style.height
            : 400;

        const newPostion = {
            x: sourceNode.position.x,
            y: sourceNode.position.y + Number(currentHeight) + 50
        };

        const newNodeId = uuidv4();

        const newNode: AppNode = {
            id: newNodeId,
            type: 'fused-note',
            position: newPostion,
            data: {
                content: blocksToMove,
                isStandaloneBlock: true
            } as any,
            style: {
                width: MIN_FUSED_SIZE,
                height: 208
            },
            parentId: sourceNode.parentId
        };

        const newEdge: Edge = {
            id: `e-${nodeId}-${newNodeId}`,
            source: nodeId,
            target: newNodeId,
            type: 'centered',
            data: { parentId: sourceNode.parentId ?? null }
        };

        set({
            nodes: [
                ...nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, content: blocksToStay } } : n) as AppNode[],
                newNode
            ],
            edges: [...edges, newEdge]
        });
        get().setCloudDirty?.(true);

        // Sync parent content if we are splitInside a child canvas
        if (sourceNode.parentId) {
            const pid = sourceNode.parentId;
            scheduleParentSync(pid, () => get().syncParentContent(pid));
        }
    },

    extractPageFromBlock: (block, position, sourceNodeId) => {
        const { nodes, currentParentId } = get();
        const linkedNodeId = (block.metadata as { nodeId?: string } | undefined)?.nodeId;

        let nodesToUpdate = nodes;
        if (sourceNodeId) {
            nodesToUpdate = nodesToUpdate.map(n => {
                if (n.id === sourceNodeId && Array.isArray((n.data as any).content)) {
                    const newContent = (n.data as any).content.filter((b: any) => b.id !== block.id);
                    return { ...n, data: { ...n.data, content: newContent } };
                }
                return n;
            }) as AppNode[];
        }

        const iconStyle = { width: ICON_SIZE, height: ICON_SIZE };
        const iconViewMode = 'icon';
        const centeredPos = { 
            x: snapToGridValue(position.x - ICON_SIZE / 2), 
            y: snapToGridValue(position.y - ICON_SIZE / 2) 
        };

        const existingNode = linkedNodeId ? nodesToUpdate.find(n => n.id === linkedNodeId) : null;

        if (existingNode) {
            set({
                nodes: nodesToUpdate.map(n => {
                    if (n.id === linkedNodeId) {
                        return {
                            ...n,
                            parentId: currentParentId || undefined,
                            position: centeredPos,
                            extent: undefined,
                            zIndex: 10,
                            style: { ...n.style, ...iconStyle },
                            data: { ...n.data, viewMode: iconViewMode }
                        };
                    }
                    return n;
                }) as AppNode[]
            });
            get().setCloudDirty?.(true);
        } else {
            const newNode: AppNode = {
                id: uuidv4(),
                type: 'note',
                position: centeredPos,
                style: iconStyle,
                data: {
                    label: (block.content as string) || 'Untitled Page',
                    content: [],
                    viewMode: iconViewMode,
                    icon: 'FileText',
                    date: new Date().toISOString()
                } as AppNode['data'],
                parentId: currentParentId || undefined,
            } as AppNode;

            set({
                nodes: [...nodesToUpdate, newNode]
            });
            get().setCloudDirty?.(true);
        }
    },

    createPageFromText: (text, position) => {
        const { nodes, currentParentId } = get();
        const newId = uuidv4();
        const pos = position ? {
            x: snapToGridValue(position.x),
            y: snapToGridValue(position.y)
        } : { x: 112, y: 112 };

        const newNode: AppNode = {
            id: newId,
            type: 'note',
            position: pos,
            style: { width: ICON_SIZE, height: ICON_SIZE },
            data: {
                label: text || 'Untitled Page',
                content: [],
                viewMode: 'icon',
                icon: 'FileText',
                date: new Date().toISOString()
            },
            parentId: currentParentId || undefined,
        };

        set({
            nodes: [...nodes, newNode]
        });
        get().setCloudDirty?.(true);

        return newId;
    },

    savePageContent: (parentId, content, transientNodeIds) => {
        set((state) => ({
            nodes: state.nodes
                .map((node) => node.id === parentId ? { ...node, data: { ...node.data, content } } : node)
                .filter((node) => !transientNodeIds.includes(node.id))
        }) as Partial<AppState>);
        get().setCloudDirty?.(true);
    },

    syncParentContent: (parentId: string) => {
        const { nodes } = get();
        if (DEBUG) {
            console.log("[syncParentContent] Before sync - nodes with parentId", parentId, ":",
                nodes.filter(n => n.parentId === parentId).map(n => ({
                    id: n.id,
                    type: n.type,
                    isStandalone: (n.data as any).isStandaloneBlock
                }))
            );
        }

        const result = computeParentContentUpdate(parentId, nodes);

        if (result && result.shouldUpdate) {
            if (DEBUG) {
                console.log("[syncParentContent] Updating nodes:", {
                    parentId,
                    nodesToUpdate: result.nodesToUpdate.map(u => u.id)
                });
            }

            set((state) => ({
                nodes: state.nodes.map(n => {
                    if (n.id === parentId) {
                        return { ...n, data: { ...n.data, content: result.parentContent } };
                    }
                    const update = result.nodesToUpdate.find(u => u.id === n.id);
                    if (update) {
                        return { ...n, data: update.data };
                    }
                    return n;
                })
            }));

            if (DEBUG) {
                console.log("[syncParentContent] After sync - nodes with parentId", parentId, ":",
                    get().nodes.filter(n => n.parentId === parentId).map(n => ({
                        id: n.id,
                        type: n.type,
                        isStandalone: (n.data as any).isStandaloneBlock
                    }))
                );
            }
        } else {
            if (DEBUG) console.log("[syncParentContent] No update needed for:", parentId);
        }
    },

    bulkDeleteNodes: (nodeIds: string[], skipConfirm?: boolean) => {
        const { nodes, edges } = get();

        if (DEBUG) {
            console.log("[bulkDeleteNodes] Input nodeIds:", nodeIds);
            console.log("[bulkDeleteNodes] Total nodes before:", nodes.length);
        }

        // Filter out nodes and edges connected to deleted nodes
        const newNodes = nodes.filter(n => !nodeIds.includes(n.id));
        const newEdges = edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target));

        if (DEBUG) {
            console.log("[bulkDeleteNodes] Total nodes after:", newNodes.length);
            console.log("[bulkDeleteNodes] Deleted count:", nodes.length - newNodes.length);
        }

        set({ nodes: newNodes, edges: newEdges });
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[bulkDeleteNodes] Completed");
    },

    bulkDuplicateNodes: (nodeIds: string[]) => {
        const { nodes } = get();
        const nodesToDuplicate = nodes.filter(n => nodeIds.includes(n.id));

        if (DEBUG) {
            console.log("[bulkDuplicateNodes] Input nodeIds:", nodeIds);
            console.log("[bulkDuplicateNodes] Found nodes to duplicate:", nodesToDuplicate.length);
        }

        if (nodesToDuplicate.length === 0) {
            if (DEBUG) console.log("[bulkDuplicateNodes] No nodes found to duplicate!");
            return;
        }

        const OFFSET = BASE_UNIT; // Offset by one grid cell (56px) for duplicated nodes to keep them aligned
        const newNodes: AppNode[] = [];
        const newIds = new Set<string>();

        nodesToDuplicate.forEach(node => {
            if (DEBUG) console.log("[bulkDuplicateNodes] Duplicating node:", node.id, "type:", node.type);
            const newId = uuidv4();
            newIds.add(newId);
            const newNode = {
                ...node,
                id: newId,
                selected: true,
                position: {
                    x: node.position.x + OFFSET,
                    y: node.position.y + OFFSET
                },
                data: {
                    ...node.data,
                    // Deep clone content if it's an array
                    content: Array.isArray((node.data as any).content)
                        ? (node.data as any).content.map((block: any) => ({ ...block, id: uuidv4() }))
                        : (node.data as any).content
                }
            } as AppNode;
            newNodes.push(newNode);
        });

        if (DEBUG) console.log("[bulkDuplicateNodes] Created", newNodes.length, "new nodes");

        set((state) => ({ 
            nodes: [
                ...state.nodes.map(n => ({ ...n, selected: false })), 
                ...newNodes
            ],
            selectedCanvasNodeIds: newIds
        }));
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[bulkDuplicateNodes] Completed");
    },

    bulkApplyColor: (nodeIds: string[], color: string) => {
        if (DEBUG) {
            console.log("[bulkApplyColor] Input nodeIds:", nodeIds);
            console.log("[bulkApplyColor] Color:", color);
        }

        set((state) => ({
            nodes: state.nodes.map(n => {
                if (nodeIds.includes(n.id)) {
                    if (DEBUG) console.log("[bulkApplyColor] Applying color to node:", n.id);
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            color: color === 'transparent' ? undefined : color
                        }
                    } as AppNode;
                }
                return n;
            })
        }));
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[bulkApplyColor] Completed");
    },

    fuseNodes: (nodeIds: string[], skipConfirm?: boolean) => {
        if (!skipConfirm && !window.confirm(
            `Merge ${nodeIds.length} nodes into one fused note? The originals will be removed. This can be undone via undo (up to 200 steps).`
        )) return;

        const { nodes, edges, currentParentId } = get();
        const nodesToFuse = nodes.filter(n => nodeIds.includes(n.id));

        if (DEBUG) {
            console.log("[fuseNodes] Input nodeIds:", nodeIds);
            console.log("[fuseNodes] Found nodes to fuse:", nodesToFuse.length);
            console.log("[fuseNodes] All node IDs before:", nodes.map(n => n.id));
        }

        if (nodesToFuse.length < 2) {
            if (DEBUG) console.log("[fuseNodes] Need at least 2 nodes to fuse, got:", nodesToFuse.length);
            return;
        }

        // Calculate average position for the fused node
        const avgX = nodesToFuse.reduce((sum, n) => sum + n.position.x, 0) / nodesToFuse.length;
        const avgY = nodesToFuse.reduce((sum, n) => sum + n.position.y, 0) / nodesToFuse.length;

        if (DEBUG) console.log("[fuseNodes] Average position:", { x: avgX, y: avgY });

        // Collect all content from all nodes
        const allContent: any[] = [];
        nodesToFuse.forEach(node => {
            if (DEBUG) console.log("[fuseNodes] Processing node:", node.id, "type:", node.type);
            if (node.type === 'note') {
                // Convert note to a page block
                const pageBlock = {
                    id: uuidv4(),
                    type: 'page',
                    content: (node.data as any).label || 'Untitled',
                    metadata: { nodeId: node.id }
                };
                allContent.push(pageBlock);
            } else if (Array.isArray((node.data as any).content)) {
                allContent.push(...(node.data as any).content);
            }
        });

        if (DEBUG) console.log("[fuseNodes] Total content blocks:", allContent.length);

        // Generate NEW unique ID
        const fusedNodeId = uuidv4();
        if (DEBUG) console.log("[fuseNodes] Generated new fused node ID:", fusedNodeId);

        // Create fused node
        const fusedNode: AppNode = {
            id: fusedNodeId,
            type: 'fused-note',
            position: { x: avgX, y: avgY },
            data: {
                content: allContent,
                isStandaloneBlock: true
            },
            style: {
                width: MIN_FUSED_SIZE,
                height: 208
            },
            parentId: currentParentId || undefined
        };

        // Remove original nodes and add fused node
        const newNodes = nodes.filter(n => !nodeIds.includes(n.id));
        if (DEBUG) console.log("[fuseNodes] Nodes after filtering:", newNodes.length, "removed:", nodes.length - newNodes.length);

        newNodes.push(fusedNode);
        if (DEBUG) console.log("[fuseNodes] Nodes after adding fused:", newNodes.length);

        // Deduplicate — ensure no duplicate IDs enter the store
        const seenIds = new Set<string>();
        const dedupedNodes: AppNode[] = [];
        for (const n of newNodes) {
            if (seenIds.has(n.id)) {
                // Generate a fresh ID for the duplicate to prevent store corruption
                dedupedNodes.push({ ...n, id: uuidv4() });
                if (DEBUG) console.warn("[fuseNodes] Fixed duplicate ID:", n.id);
            } else {
                seenIds.add(n.id);
                dedupedNodes.push(n);
            }
        }

        // Remove edges connected to deleted nodes
        const newEdges = edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target));

        set({ nodes: dedupedNodes, edges: newEdges });
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[fuseNodes] Completed - Final node count:", dedupedNodes.length);
    },

    linkSelectedNodes: (mainNodeId, targetNodeIds) => {
        console.log("[linkSelectedNodes] Called with mainNodeId:", mainNodeId, "targetNodeIds:", targetNodeIds);
        const { edges, currentParentId } = get();
        const parentIdForEdge = currentParentId ?? null;
        
        const newEdges: Edge[] = [];
        targetNodeIds.forEach(targetId => {
            if (targetId === mainNodeId) return;
            
            // Check if an edge already exists from mainNodeId to targetId
            const edgeExists = edges.some(e => 
                (e.source === mainNodeId && e.target === targetId) ||
                (e.source === targetId && e.target === mainNodeId)
            );
            
            if (!edgeExists) {
                newEdges.push({
                    id: uuidv4(),
                    source: mainNodeId,
                    target: targetId,
                    type: 'centered',
                    data: { parentId: parentIdForEdge },
                } as Edge);
            }
        });
        
        if (newEdges.length > 0) {
            console.log("[linkSelectedNodes] Created new edges:", newEdges);
            set({
                edges: [...edges, ...newEdges]
            });
            get().setCloudDirty?.(true);
        } else {
            console.log("[linkSelectedNodes] No new edges created (already existed or empty targets).");
        }
    },

    hydrateCanvasFromContent: (nodeId: string) => {
        const { nodes } = get();
        
        // Build index for O(1) lookups
        const byId = new Map<string, AppNode>();
        const childrenByParent = new Map<string | undefined, AppNode[]>();
        for (const node of nodes) {
            byId.set(node.id, node);
            const parentKey = node.parentId;
            if (!childrenByParent.has(parentKey)) {
                childrenByParent.set(parentKey, []);
            }
            childrenByParent.get(parentKey)!.push(node);
        }
        
        const parentNode = byId.get(nodeId);

        if (!parentNode || !(parentNode.data as any).content || !Array.isArray((parentNode.data as any).content)) {
            return;
        }

        const parentContent = (parentNode.data as any).content as any[];
        if (parentContent.length === 0) return;

        // Get existing children using index
        const children = childrenByParent.get(nodeId) || [];

        // Collect all block IDs currently represented on the canvas
        const representedBlockIds = new Set<string>();
        children.forEach(child => {
            if (Array.isArray((child.data as any).content)) {
                (child.data as any).content.forEach((b: any) => representedBlockIds.add(b.id));
            }
            if (child.type === 'note') {
                const matchingBlock = parentContent.find(b => b.type === 'page' && b.metadata?.nodeId === child.id);
                if (matchingBlock) {
                    representedBlockIds.add(matchingBlock.id);
                }
            }
        });

        // Identify orphan blocks (not yet represented in the canvas)
        const orphanBlocks = parentContent.filter(b => !representedBlockIds.has(b.id));

        if (orphanBlocks.length === 0) {
            if (DEBUG) console.log("[hydrateCanvas] No orphan blocks found.");
            return;
        }

        if (DEBUG) console.log("[hydrateCanvas] Found orphans:", orphanBlocks.length);

        // Build sections from orphans using a smart semantic hierarchical system.
        // H1 and explicit splits create new documents/cards.
        // H2, H3, paragraphs, separators, lists, quotes, tables, etc., are owned by and grouped under their preceding H1/heading.
        const orphanIdSet = new Set(orphanBlocks.map(b => b.id));
        const orphanBlocksOrdered = parentContent.filter(b => orphanIdSet.has(b.id));

        interface TreeNode {
            type: 'document' | 'section' | 'block';
            block?: any;
            level?: number;
            title?: string;
            children: TreeNode[];
        }

        const buildHierarchy = (blocksList: any[]): TreeNode => {
            const rootNode: TreeNode = { type: 'document', children: [] };
            const stackNode: TreeNode[] = [rootNode];

            blocksList.forEach(block => {
                let level = 0;
                if (block.type === 'heading1') level = 1;
                else if (block.type === 'heading2') level = 2;
                else if (block.type === 'heading3') level = 3;

                if (level > 0) {
                    const newSection: TreeNode = {
                        type: 'section',
                        level,
                        title: block.content,
                        block,
                        children: []
                    };

                    while (stackNode.length > 1) {
                        const top = stackNode[stackNode.length - 1];
                        if (top.type === 'section' && top.level! < level) {
                            break;
                        }
                        stackNode.pop();
                    }

                    stackNode[stackNode.length - 1].children.push(newSection);
                    stackNode.push(newSection);
                } else {
                    const newBlock: TreeNode = {
                        type: 'block',
                        block,
                        children: []
                    };
                    stackNode[stackNode.length - 1].children.push(newBlock);
                }
            });

            return rootNode;
        };

        const getFlatBlocks = (node: TreeNode, targetList: any[]) => {
            if (node.block) {
                targetList.push(node.block);
            }
            node.children.forEach(child => getFlatBlocks(child, targetList));
        };

        const hierarchyRoot = buildHierarchy(orphanBlocksOrdered);
        const sections: any[][] = [];
        let currentCardBlocks: any[] = [];

        hierarchyRoot.children.forEach(child => {
            if (child.type === 'block') {
                const isDividerSplit = 
                    child.block.type === 'divider' && 
                    (child.block.metadata?.split === true || 
                     child.block.metadata?.forceSplit === true || 
                     child.block.metadata?.semantic === 'split');
                     
                if (isDividerSplit) {
                    if (currentCardBlocks.length > 0) {
                        sections.push(currentCardBlocks);
                    }
                    currentCardBlocks = [child.block];
                } else {
                    currentCardBlocks.push(child.block);
                }
            } else {
                if (currentCardBlocks.length > 0) {
                    sections.push(currentCardBlocks);
                    currentCardBlocks = [];
                }

                const sectionBlocks: any[] = [];
                getFlatBlocks(child, sectionBlocks);

                let subSections: any[][] = [];
                let currentSubSection: any[] = [];

                sectionBlocks.forEach(block => {
                    let splitHere = false;

                    if (block.type === 'divider') {
                        const hasExplicitSplit = 
                            block.metadata?.split === true || 
                            block.metadata?.forceSplit === true || 
                            block.metadata?.semantic === 'split';
                        if (hasExplicitSplit) {
                            splitHere = true;
                        }
                    } else if ((block.type === 'heading2' || block.type === 'heading3') && currentSubSection.length >= 20) {
                        splitHere = true;
                    }

                    if (splitHere) {
                        if (currentSubSection.length > 0) {
                            subSections.push(currentSubSection);
                        }
                        currentSubSection = [block];
                    } else {
                        currentSubSection.push(block);
                    }
                });

                if (currentSubSection.length > 0) {
                    subSections.push(currentSubSection);
                }

                sections.push(...subSections);
            }
        });

        if (currentCardBlocks.length > 0) {
            sections.push(currentCardBlocks);
        }

        if (sections.length === 0) {
            if (DEBUG) console.log("[hydrateCanvas] Orphans exist but no sections were formed.");
            return;
        }

        // Calculate base position: below existing children or default
        const margin = BASE_UNIT;
        let startY = margin;
        const startX = margin;
        
        // Use vertical layout for fused nodes (stacked under each other)
        const verticalGap = BASE_UNIT;  // Gap between stacked fused notes

        if (children.length > 0) {
            const maxY = Math.max(
                ...children.map(c => c.position.y + ((c.style?.height as number) || MIN_FUSED_SIZE))
            );
            startY = snapToGridValue(maxY + BASE_UNIT * 2);
        }

        const newNodes: AppNode[] = sections.map((sectionBlocks, index) => {
            const newNodeId = uuidv4();
            
            // Stack vertically: each fused note placed below the previous one
            const x = startX;
            const y = startY + (index * MIN_FUSED_SIZE) + (index * verticalGap);

            return {
                id: newNodeId,
                type: 'fused-note',
                position: { x, y },
                style: { width: MIN_FUSED_SIZE, height: 208 }, // 8x4 default
                data: {
                    content: sectionBlocks,
                    isStandaloneBlock: true
                },
                parentId: nodeId
            };
        });

        set(state => ({
            nodes: [...state.nodes, ...newNodes]
        }));
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[hydrateCanvas] Created fused nodes for sections:", newNodes.map(n => n.id));
    },

    updateEdge: (id, updates) => {
        set((state) => ({
            edges: state.edges.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        }));
        get().setCloudDirty?.(true);
    },

    deleteEdge: (id) => {
        set((state) => ({
            edges: state.edges.filter((e) => e.id !== id),
        }));
        get().setCloudDirty?.(true);
    },

    duplicateEdge: (id) => {
        const edge = get().edges.find((e) => e.id === id);
        if (edge) {
            const newEdge = {
                ...edge,
                id: `edge-${uuidv4()}`,
            };
            set((state) => ({
                edges: [...state.edges, newEdge],
            }));
            get().setCloudDirty?.(true);
        }
    },

    bringEdgeToFront: (id) => {
        const edges = get().edges;
        const edge = edges.find((e) => e.id === id);
        if (edge) {
            set({
                edges: [...edges.filter((e) => e.id !== id), edge],
            });
            get().setCloudDirty?.(true);
        }
    },

    arrangeNodes: (nodeIds, mode) => {
        const { nodes } = get();
        const selected = nodes.filter(n => nodeIds.includes(n.id));
        if (selected.length < 2) return;

        const count = selected.length;

        const getW = (n: typeof selected[0]) => n.measured?.width ?? (typeof n.style?.width === 'number' ? n.style.width : 432);
        const getH = (n: typeof selected[0]) => n.measured?.height ?? (typeof n.style?.height === 'number' ? n.style.height : 432);

        const bbox = selected.reduce((acc, n) => ({
            minX: Math.min(acc.minX, n.position.x),
            maxX: Math.max(acc.maxX, n.position.x + getW(n)),
            minY: Math.min(acc.minY, n.position.y),
            maxY: Math.max(acc.maxY, n.position.y + getH(n)),
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

        const getGridW = (n: typeof selected[0]) => Math.ceil(getW(n) / BASE_UNIT) * BASE_UNIT;
        const getGridH = (n: typeof selected[0]) => Math.ceil(getH(n) / BASE_UNIT) * BASE_UNIT;

        const centerX = (bbox.minX + bbox.maxX) / 2;
        const centerY = (bbox.minY + bbox.maxY) / 2;
        const gap = BASE_UNIT;

        const positions: Record<string, { x: number; y: number }> = {};

        switch (mode) {
            case 'grid': {
                const cols = Math.ceil(Math.sqrt(count));
                const cellW = Math.max(...selected.map(getGridW));
                const cellH = Math.max(...selected.map(getGridH));
                const rows = Math.ceil(count / cols);
                const gridW = cols * cellW + (cols - 1) * gap;
                const gridH = rows * cellH + (rows - 1) * gap;
                const ox = snapToGridValue(centerX - gridW / 2);
                const oy = snapToGridValue(centerY - gridH / 2);

                selected.forEach((node, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    positions[node.id] = {
                        x: snapToGridValue(ox + col * (cellW + gap)),
                        y: snapToGridValue(oy + row * (cellH + gap)),
                    };
                });
                break;
            }

            case 'circle': {
                const diagonals = selected.map(n => Math.sqrt(getGridW(n) ** 2 + getGridH(n) ** 2));
                const maxDiag = Math.max(...diagonals);
                const angleStep = (2 * Math.PI) / count;
                const minRadius = count <= 2
                    ? (maxDiag + gap)
                    : (maxDiag + gap) / (2 * Math.sin(angleStep / 2));
                const radius = snapToGridValue(Math.max(BASE_UNIT * 2, minRadius));

                selected.forEach((node, i) => {
                    const angle = -Math.PI / 2 + angleStep * i;
                    positions[node.id] = {
                        x: snapToGridValue(centerX + radius * Math.cos(angle) - getW(node) / 2),
                        y: snapToGridValue(centerY + radius * Math.sin(angle) - getH(node) / 2),
                    };
                });
                break;
            }

            case 'flow': {
                const sorted = [...selected].sort((a, b) => (a.position.x + getW(a) / 2) - (b.position.x + getW(b) / 2));
                const totalW = sorted.reduce((s, n) => s + getGridW(n), 0) + (count - 1) * gap;
                let cx = snapToGridValue(centerX - totalW / 2);
                sorted.forEach(node => {
                    positions[node.id] = {
                        x: snapToGridValue(cx),
                        y: snapToGridValue(centerY - getH(node) / 2),
                    };
                    cx += getGridW(node) + gap;
                });
                break;
            }

            case 'horizontal-row': {
                const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
                const totalW = sorted.reduce((s, n) => s + getGridW(n), 0) + (count - 1) * gap;
                let cx = snapToGridValue(centerX - totalW / 2);
                sorted.forEach(node => {
                    positions[node.id] = {
                        x: snapToGridValue(cx),
                        y: snapToGridValue(centerY - getH(node) / 2),
                    };
                    cx += getGridW(node) + gap;
                });
                break;
            }

            case 'vertical-column': {
                const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
                const totalH = sorted.reduce((s, n) => s + getGridH(n), 0) + (count - 1) * gap;
                let cy = snapToGridValue(centerY - totalH / 2);
                sorted.forEach(node => {
                    positions[node.id] = {
                        x: snapToGridValue(centerX - getW(node) / 2),
                        y: snapToGridValue(cy),
                    };
                    cy += getGridH(node) + gap;
                });
                break;
            }

            case 'mindmap-horizontal': {
                const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
                const root = sorted[0];
                const children = sorted.slice(1);
                const maxChildW = children.length > 0 ? Math.max(...children.map(getGridW)) : 0;
                const totalChildrenH = children.reduce((s, n) => s + getGridH(n), 0) + Math.max(0, children.length - 1) * gap;
                
                const cx = snapToGridValue(centerX - (getGridW(root) + gap + maxChildW) / 2);
                positions[root.id] = {
                    x: cx,
                    y: snapToGridValue(centerY - getH(root) / 2),
                };

                const cxChildren = cx + getGridW(root) + gap;
                let cy = snapToGridValue(centerY - totalChildrenH / 2);
                children.forEach(child => {
                    positions[child.id] = {
                        x: cxChildren,
                        y: snapToGridValue(cy),
                    };
                    cy += getGridH(child) + gap;
                });
                break;
            }

            case 'mindmap-vertical': {
                const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
                const root = sorted[0];
                const children = sorted.slice(1);
                const maxChildH = children.length > 0 ? Math.max(...children.map(getGridH)) : 0;
                const totalChildrenW = children.reduce((s, n) => s + getGridW(n), 0) + Math.max(0, children.length - 1) * gap;
                
                const cy = snapToGridValue(centerY - (getGridH(root) + gap + maxChildH) / 2);
                positions[root.id] = {
                    x: snapToGridValue(centerX - getW(root) / 2),
                    y: cy,
                };

                const cyChildren = cy + getGridH(root) + gap;
                let cx = snapToGridValue(centerX - totalChildrenW / 2);
                children.forEach(child => {
                    positions[child.id] = {
                        x: snapToGridValue(cx),
                        y: cyChildren,
                    };
                    cx += getGridW(child) + gap;
                });
                break;
            }
        }

        set({
            nodes: nodes.map(n => (positions[n.id] ? { ...n, position: positions[n.id] } : n)),
        });
        get().setCloudDirty?.(true);
    },
});
