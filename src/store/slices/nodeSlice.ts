import type { StateCreator } from 'zustand';
import {
    type Edge,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    reconnectEdge,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { type AppNode, type AppNodeData, getNodeBlocks, getNodeLabel } from '../../types';
import type { Block } from '../../features/editor/types';
import { MIN_FUSED_SIZE, BASE_UNIT, snapToGridValue, ICON_SIZE } from '../../config/layout';
import { computeParentContentUpdate } from '../contentSync';
import { planHydration, layoutChunks, computeSmartHierarchy, type HydrationChunk } from '../contentHydration';
import { withoutHistory } from '../temporalControl';
import { checkNodeCreationLimits } from '../nodeLimits';
import {
    normalizeText,
    blockText,
    getBlockNodeStyle,
    createBlockNode as createStandaloneBlockNode,
    buildRadialCluster as buildRadialClusterFromCenter,
    RELEASE_SIZE_PROFILE,
    HYDRATE_SIZE_PROFILE,
} from '../blockNodeStyle';
import type { AppState, NodeSlice } from '../types';

// Debug flag - set to false in production
const DEBUG = import.meta.env.DEV;

// DEBUG-log helper: standalone flag only exists on block/fused-note payloads
const isStandalone = (data: AppNodeData): boolean | undefined =>
    'isStandaloneBlock' in data ? data.isStandaloneBlock : undefined;

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
            /* Live drag frames are excluded on purpose. React Flow emits a
               position change per node per frame while dragging, and building
               + logging that object every frame is itself enough to make the
               drag stutter in dev — the console was measuring the thing it was
               supposed to be observing. Only the final, settled position and
               genuine structural changes are worth a line. */
            const importantChanges = changes.filter(c =>
                c.type !== 'select' && c.type !== 'dimensions' &&
                !(c.type === 'position' && c.dragging)
            );
            if (importantChanges.length > 0) {
                console.log("[onNodesChange] Received changes:", importantChanges.map(c => {
                    const detail: Record<string, unknown> = { type: c.type, id: 'id' in c ? c.id : undefined };
                    if (c.type === 'remove') detail.removing = c.id;
                    else if (c.type === 'position') { detail.position = c.position; detail.dragging = c.dragging; }
                    return detail;
                }));
            }
        }

        // CRITICAL FIX: Preserve parentId for nodes during 'replace' and other changes
        const filteredChanges = changes.map(change => {
            if (change.type === 'replace') {
                const existingNode = get().nodes.find(n => n.id === change.id);
                if (existingNode && existingNode.parentId) {
                    if (DEBUG) console.log("[onNodesChange] Preserving parentId for node during replace:", change.id);
                    return {
                        ...change,
                        item: {
                            ...change.item,
                            parentId: existingNode.parentId
                        }
                    };
                }
            }
            return change;
        });
        /* Position changes are NOT filtered while dragging, however tempting
           that is. React Flow runs as a controlled component here: it does not
           keep its own copy of the nodes, so a change it emits and we drop is a
           frame the card does not move. Dropping them left the card pinned in
           place until some unrelated re-render happened to flush the mutated
           position through — which is the trailing, lurching drag this was
           meant to cure. The cost it was avoiding is real, but it lives
           downstream (culling, persistence, sync), and that is where it is
           now held back: see useCanvasViewport and StorageManager. */

        if (filteredChanges.length === 0) return;

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
            (c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace' ||
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

    onReconnect: (oldEdge, newConnection) => {
        set({
            edges: reconnectEdge(oldEdge, newConnection, get().edges),
        });
        get().setCloudDirty?.(true);
    },

    addNode: (type, position, initialData, style, parentId, customId) => {
        const { currentParentId } = get();
        const targetParentId = parentId !== undefined ? parentId : (currentParentId || undefined);

        // Beta creation limits (BETA_SCOPE.md). Creation-only — loads are never trimmed.
        const violation = checkNodeCreationLimits({
            nodes: get().nodes,
            targetParentId,
            newNodeType: type,
            isAuthenticated: get().auth.isAuthenticated,
        });
        if (violation) {
            get().setLimitNotice(violation);
            return;
        }

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
                isStandalone: isStandalone(newNode.data),
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
            const parentContent = data.content as Block[];
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
                                    const childContent = getNodeBlocks(node.data);
                                    if (childContent && childContent.length > 0) {
                                        // Find matching blocks in parent content by ID
                                        const firstBlockId = childContent[0].id;
                                        const matchingIndex = parentContent.findIndex((b) => b.id === firstBlockId);
                                        
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
            parentContent.forEach((b) => {
                if (b.type === 'page' && b.metadata?.nodeId) {
                    linkedUpdates.push({ id: b.metadata.nodeId, label: b.content });
                }
            });

            if (linkedUpdates.length > 0) {
                set((state) => {
                    const nodesToUpdate = state.nodes.filter(n => {
                        const update = linkedUpdates.find(u => u.id === n.id);
                        return update && getNodeLabel(n.data) !== update.label;
                    });

                    if (nodesToUpdate.length === 0) return state;

                    return {
                        nodes: state.nodes.map(n => {
                            const update = linkedUpdates.find(u => u.id === n.id);
                            if (update && getNodeLabel(n.data) !== update.label) {
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

    applyRemoteNodeUpdate: (id, updates) => {
        // Remote (collaborator) changes must not enter THIS user's undo stack.
        withoutHistory(() => {
            set((state) => ({
                nodes: state.nodes.map((node) =>
                    node.id === id ? { ...node, ...updates } as AppNode : node
                ),
            }));
        });
        // DO NOT setCloudDirty(true) to avoid infinite sync loops
    },

    applyRemoteEdgeUpdate: (id, updates) => {
        withoutHistory(() => {
            set((state) => ({
                edges: state.edges.map((edge) =>
                    edge.id === id ? { ...edge, ...updates } as Edge : edge
                ),
            }));
        });
        // DO NOT setCloudDirty(true)
    },

    releaseNodeContentToBlocks: (nodeId: string, centerPosition?: { x: number; y: number }, skipConfirm?: boolean) => {

        const { nodes, edges, currentParentId } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);
        if (!sourceNode) return;

        const rawContent = 'content' in sourceNode.data ? sourceNode.data.content : undefined;
        const isEmptyBlock = (b: Block | null | undefined) => {
            if (!b) return true;
            if (b.type === 'divider') return true;
            if (b.type === 'table') {
                const rows = b.metadata?.rows;
                if (!Array.isArray(rows) || rows.length === 0) return true;
                return rows.every((row) =>
                    Array.isArray(row) && row.every((cell) => normalizeText(String(cell)).length === 0)
                );
            }
            if (b.type === 'columns') {
                const cols = b.metadata?.columns;
                return !Array.isArray(cols) || cols.length === 0;
            }
            // A board's content is its title, which is usually blank — judge it
            // by its pictures, or every gallery would be released as empty.
            if (b.type === 'gallery') {
                const items = b.metadata?.items;
                return !Array.isArray(items) || items.length === 0;
            }
            return normalizeText(b.content).length === 0;
        };
        const blocks: Block[] = Array.isArray(rawContent)
            ? rawContent.filter((b) => !isEmptyBlock(b))
            : (typeof rawContent === 'string' && rawContent.trim().length > 0)
                ? [{ id: uuidv4(), type: 'text', content: rawContent }]
                : [];

        if (blocks.length === 0) return;

        if (!skipConfirm && !window.confirm(
            'Release this note\'s content into separate blocks? The original note will be removed. This can be undone via undo.'
        )) return;

        const parentId = currentParentId || undefined;
        const parentIdForEdge = currentParentId ?? null;

        const resolvedCenterX = centerPosition?.x ?? sourceNode.position.x;
        const resolvedCenterY = centerPosition?.y ?? sourceNode.position.y;
        const baseCenter = { x: snapToGridValue(resolvedCenterX), y: snapToGridValue(resolvedCenterY) };

        // --- Split into sections by heading boundaries ---
        const headingTypes = new Set(['heading1', 'heading2', 'heading3']);
        const isHeadingBlock = (b: Block | null | undefined) => !!b && headingTypes.has(b.type);
        interface Section { heading: Block | null; blocks: Block[] }
        const sections: Section[] = [];

        const headingIndices = blocks
            .map((b, i) => (isHeadingBlock(b) ? i : -1))
            .filter((i) => i >= 0);

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

        // --- Smart node sizing & cluster builders (shared: blockNodeStyle.ts) ---
        const getNodeStyle = (block: Block, isHeading: boolean) =>
            getBlockNodeStyle(block, RELEASE_SIZE_PROFILE, isHeading);
        const createBlockNode = (block: Block, position: { x: number; y: number }, style: { width: number; height: number }) =>
            createStandaloneBlockNode(block, position, style, parentId);
        const buildRadialCluster = (centerNode: AppNode, outerBlocks: Block[], centerPos: { x: number; y: number }) =>
            buildRadialClusterFromCenter(centerNode, outerBlocks, centerPos, { parentId, parentIdForEdge });

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
        const sourceBlocks = sourceNode ? getNodeBlocks(sourceNode.data) : undefined;

        if (!sourceNode || !sourceBlocks) return;

        if (!skipConfirm && !window.confirm(
            'Split this node at the selected block? Content will be moved to a new fused note.'
        )) return;

        // Use caller-provided blocks if available (avoids stale store state from debounce),
        // otherwise fall back to store data
        const blocks = (currentBlocks && currentBlocks.length > 0)
            ? currentBlocks as Block[]
            : sourceBlocks;
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
            },
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
                const nBlocks = getNodeBlocks(n.data);
                if (n.id === sourceNodeId && nBlocks) {
                    const newContent = nBlocks.filter((b) => b.id !== block.id);
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
                    isStandalone: isStandalone(n.data)
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

            // Derived reconciliation that rides along with the user action that
            // triggered it — not a standalone undo step.
            withoutHistory(() => {
                set((state) => ({
                    nodes: state.nodes.map(n => {
                        if (n.id === parentId) {
                            return { ...n, data: { ...n.data, content: result.parentContent } } as AppNode;
                        }
                        const update = result.nodesToUpdate.find(u => u.id === n.id);
                        if (update) {
                            return { ...n, data: update.data } as AppNode;
                        }
                        return n;
                    })
                }));
            });

            if (DEBUG) {
                console.log("[syncParentContent] After sync - nodes with parentId", parentId, ":",
                    get().nodes.filter(n => n.parentId === parentId).map(n => ({
                        id: n.id,
                        type: n.type,
                        isStandalone: isStandalone(n.data)
                    }))
                );
            }
        } else {
            if (DEBUG) console.log("[syncParentContent] No update needed for:", parentId);
        }
    },

    bulkDeleteNodes: (nodeIds: string[], skipConfirm?: boolean) => {
        if (nodeIds.length === 0) return;
        if (!skipConfirm && !window.confirm(
            `Delete ${nodeIds.length} node${nodeIds.length === 1 ? '' : 's'}? This can be undone via undo (up to 200 steps).`
        )) return;

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
                    content: (() => {
                        const blocks = getNodeBlocks(node.data);
                        if (blocks) return blocks.map((block) => ({ ...block, id: uuidv4() }));
                        return 'content' in node.data ? node.data.content : undefined;
                    })()
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
        const allContent: Block[] = [];
        nodesToFuse.forEach(node => {
            if (DEBUG) console.log("[fuseNodes] Processing node:", node.id, "type:", node.type);
            const nodeBlocks = getNodeBlocks(node.data);
            if (node.type === 'note') {
                // Convert note to a page block
                const pageBlock: Block = {
                    id: uuidv4(),
                    type: 'page',
                    content: getNodeLabel(node.data) || 'Untitled',
                    metadata: { nodeId: node.id }
                };
                allContent.push(pageBlock);
            } else if (nodeBlocks) {
                allContent.push(...nodeBlocks);
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

        const parentContent = parentNode ? getNodeBlocks(parentNode.data) : undefined;
        if (!parentNode || !parentContent || parentContent.length === 0) {
            return;
        }

        // Get existing children using index
        const children = childrenByParent.get(nodeId) || [];

        // Collect all block IDs currently represented on the canvas
        const representedBlockIds = new Set<string>();
        children.forEach(child => {
            getNodeBlocks(child.data)?.forEach((b) => representedBlockIds.add(b.id));
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

        const orphanIdSet = new Set(orphanBlocks.map(b => b.id));
        const orphanBlocksOrdered = parentContent.filter(b => orphanIdSet.has(b.id));

        // --- Relatedness-based semantic grouping ---
        // Group blocks by content relatedness (not just heading/divider markers),
        // producing a semantic hierarchy tree + cross-topic "related" edges.
        // See contentHydration.ts.
        type Chunk = HydrationChunk;

        const plan = planHydration(orphanBlocksOrdered);
        const validChunks: Chunk[] = plan.chunks;

        if (validChunks.length === 0) return;

        // --- Layout (Horizontal Mind-Map / Flow) ---
        const getNodeStyle = (block: Block) => getBlockNodeStyle(block, HYDRATE_SIZE_PROFILE);

        const getFusedNoteStyle = (blocks: Block[]) => {
            let estimatedHeight = 40; // Base padding/margin (reduced to exactly fit)
            blocks.forEach(b => {
                if (b.type === 'heading1') estimatedHeight += 50;
                else if (b.type === 'heading2') estimatedHeight += 40;
                else if (b.type === 'heading3') estimatedHeight += 30;
                else if (b.type === 'divider') estimatedHeight += 20;
                else {
                    const len = normalizeText(blockText(b.content)).length;

                    if (len === 0) {
                        estimatedHeight += 24; // Empty line
                    } else {
                        // Assuming ~50 characters per line for MIN_FUSED_SIZE width
                        const lines = Math.ceil(len / 50);
                        estimatedHeight += lines * 24 + 10; // 24px per line + 10px paragraph spacing
                    }
                }
            });
            
            // Snap to grid and do not force 208 height, just a small minimum of 80
            const finalHeight = Math.max(80, Math.ceil(estimatedHeight / BASE_UNIT) * BASE_UNIT);
            return { width: MIN_FUSED_SIZE, height: finalHeight };
        };

        // --- Cluster-aware compact layout ---
        // Related groups are packed together (short, local connectors); unrelated
        // clusters are separated into a tidy wrapping grid. See contentHydration.
        const sizeOf = (chunk: Chunk): { width: number; height: number } =>
            chunk.type === 'block' ? getNodeStyle(chunk.blocks[0]) : getFusedNoteStyle(chunk.blocks);

        const margin = BASE_UNIT;
        let startY = margin;
        const startX = margin;

        if (children.length > 0) {
            const maxY = Math.max(
                ...children.map(c => c.position.y + ((c.style?.height as number) || 208))
            );
            startY = snapToGridValue(maxY + BASE_UNIT * 3);
        }

        const positions = layoutChunks(validChunks, plan.relatedEdges, sizeOf, {
            originX: startX,
            originY: startY,
            gridStep: BASE_UNIT,
        });

        // --- Creation of Nodes and Edges ---
        const newNodes: AppNode[] = validChunks.map(chunk => {
            const pos = positions.get(chunk.id) || { x: startX, y: startY };
            const style = chunk.type === 'block' ? getNodeStyle(chunk.blocks[0]) : getFusedNoteStyle(chunk.blocks);
            
            return {
                id: chunk.id,
                type: chunk.type,
                position: pos,
                style: style,
                data: {
                    content: chunk.blocks,
                    isStandaloneBlock: true
                },
                parentId: nodeId
            } as AppNode;
        });

        const chunkIds = new Set(validChunks.map(c => c.id));
        const newEdges: Edge[] = [];

        // Connect ONLY groups that are genuinely related to each other (default
        // edge style). The hierarchy/relatedness tree is used purely for layout
        // positioning above — it is intentionally NOT drawn, to avoid connecting
        // every node on the canvas.
        plan.relatedEdges.forEach(rel => {
            if (chunkIds.has(rel.source) && chunkIds.has(rel.target)) {
                newEdges.push({
                    id: uuidv4(),
                    source: rel.source,
                    target: rel.target,
                    type: 'centered',
                    data: { parentId: nodeId } // Scope edge to this canvas
                } as Edge);
            }
        });

        // Beta creation limits (BETA_SCOPE.md) — the whole batch counts.
        const violation = checkNodeCreationLimits({
            nodes: get().nodes,
            targetParentId: nodeId,
            isAuthenticated: get().auth.isAuthenticated,
            addedCount: newNodes.length,
        });
        if (violation) {
            get().setLimitNotice(violation);
            return;
        }

        set(state => ({
            nodes: [...state.nodes, ...newNodes],
            edges: [...state.edges, ...newEdges]
        }));
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[hydrateCanvas] Created semantic chunks and edges:", newNodes.length, newEdges.length);
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
        const { nodes, edges, currentParentId } = get();
        const selected = nodes.filter(n => nodeIds.includes(n.id));
        if (selected.length < 2) return;

        const count = selected.length;

        // Smart mode may also rebuild the connectors between the selected nodes.
        let rebuiltEdges: Edge[] | null = null;

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

            case 'related-clusters': {
                // Group selected nodes by content relatedness and pack each cluster
                // compactly, so related cards sit together and connectors stay short.
                const items = selected.map(n => {
                    const blocks = getNodeBlocks(n.data);
                    return {
                        id: n.id,
                        blocks: blocks && blocks.length > 0
                            ? blocks
                            : [{ type: 'text', content: getNodeLabel(n.data) || '' }],
                    };
                });
                const forest = computeSmartHierarchy(items);
                const layoutInputs = selected.map(n => ({
                    id: n.id,
                    type: (n.type === 'block' ? 'block' : 'fused-note') as 'block' | 'fused-note',
                    sourceId: forest.parent.get(n.id),
                }));
                const sizeMap = new Map(selected.map(n => [n.id, { width: getGridW(n), height: getGridH(n) }]));
                const computed = layoutChunks(
                    layoutInputs,
                    forest.edges,
                    (node) => sizeMap.get(node.id) || { width: 432, height: 200 },
                    {
                        originX: snapToGridValue(bbox.minX),
                        originY: snapToGridValue(bbox.minY),
                        gridStep: BASE_UNIT,
                    }
                );
                computed.forEach((p, id) => { positions[id] = p; });

                // Rebuild connectors: drop existing edges that link two selected
                // nodes, then draw the clean relatedness tree (default style).
                const selectedSet = new Set(nodeIds);
                const edgeParentId = currentParentId ?? null;
                const keptEdges = edges.filter(
                    e => !(selectedSet.has(e.source) && selectedSet.has(e.target))
                );
                const forestEdges = forest.edges.map(e => ({
                    id: uuidv4(),
                    source: e.source,
                    target: e.target,
                    type: 'centered',
                    data: { parentId: edgeParentId },
                }) as Edge);
                rebuiltEdges = [...keptEdges, ...forestEdges];
                break;
            }
        }

        set({
            nodes: nodes.map(n => (positions[n.id] ? { ...n, position: positions[n.id] } : n)),
            ...(rebuiltEdges ? { edges: rebuiltEdges } : {}),
        });
        get().setCloudDirty?.(true);
    },
});
