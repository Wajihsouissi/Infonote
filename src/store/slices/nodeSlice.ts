import type { StateCreator } from 'zustand';
import {
    type Edge,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../../types';
import { MIN_FUSED_SIZE, BASE_UNIT, snapToGridValue, ICON_SIZE } from '../../config/layout';
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
        const detailedChanges = changes.map(c => {
            const detail: any = {
                type: c.type,
                id: (c as any).id
            };

            if (c.type === 'remove') {
                detail.removing = (c as any).id;
            } else if (c.type === 'position') {
                detail.position = (c as any).position;
                detail.dragging = (c as any).dragging;
            } else if (c.type === 'select') {
                detail.selected = (c as any).selected;
            } else if (c.type === 'dimensions') {
                detail.dimensions = (c as any).dimensions;
            }

            return detail;
        });

        if (DEBUG) {
            console.log("[onNodesChange] Received changes (detailed):");
            detailedChanges.forEach(c => console.log("  ", c));
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
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },

    onConnect: (connection) => {
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
    },

    addNode: (type, position, initialData, style, parentId, customId) => {
        const { currentParentId } = get();
        const targetParentId = parentId !== undefined ? parentId : (currentParentId || undefined);

        const newNode: AppNode = {
            id: customId || uuidv4(),
            type,
            position,
            style: style || { width: 432, height: 432 },
            data: {
                label: initialData?.label || 'New Note',
                content: '',
                viewMode: 'expanded',
                icon: 'FileText',
                ...initialData
            },
            parentId: targetParentId,
        };

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

        if (targetParentId) {
            if (DEBUG) console.log("[addNode] Scheduling syncParentContent for:", targetParentId);
            scheduleParentSync(targetParentId, () => get().syncParentContent(targetParentId));
        }
    },

    updateNodeData: (id, data) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, ...data } } : node
            ),
        });

        const { currentParentId } = get();
        
        // Sync parent content if we're updating a child node
        if (currentParentId) {
            scheduleParentSync(currentParentId, () => get().syncParentContent(currentParentId));
        }

        // BIDIRECTIONAL SYNC: If updating a parent note's content, sync down to child nodes
        if (data.content && Array.isArray(data.content)) {
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
                                        const matchingIndex = data.content.findIndex((b: any) => b.id === firstBlockId);
                                        
                                        if (matchingIndex !== -1) {
                                            // Extract the corresponding blocks from parent
                                            const updatedBlocks = data.content.slice(
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
    },

    splitNode: (nodeId, splitBlockId, currentBlocks) => {
        const { nodes, edges } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);

        if (!sourceNode || !('content' in sourceNode.data) || !Array.isArray((sourceNode.data as any).content)) return;

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
                height: MIN_FUSED_SIZE
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

        // Sync parent content if we are splitInside a child canvas
        if (sourceNode.parentId) {
            const pid = sourceNode.parentId;
            scheduleParentSync(pid, () => get().syncParentContent(pid));
        }
    },

    extractPageFromBlock: (block, position, sourceNodeId) => {
        const { nodes, currentParentId } = get();
        const linkedNodeId = block.metadata?.nodeId;

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
        } else {
            const newNode: AppNode = {
                id: uuidv4(),
                type: 'note',
                position: centeredPos,
                style: iconStyle,
                data: {
                    label: block.content || 'Untitled Page',
                    content: [],
                    viewMode: iconViewMode,
                    icon: 'FileText',
                    date: new Date().toISOString()
                },
                parentId: currentParentId || undefined,
            };

            set({
                nodes: [...nodesToUpdate, newNode]
            });
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

        return newId;
    },

    savePageContent: (parentId, content, transientNodeIds) => {
        set((state) => ({
            nodes: state.nodes
                .map((node) => node.id === parentId ? { ...node, data: { ...node.data, content } } : node)
                .filter((node) => !transientNodeIds.includes(node.id))
        }) as Partial<AppState>);
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

    bulkDeleteNodes: (nodeIds: string[]) => {
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

        const OFFSET = 50; // Offset for duplicated nodes to avoid overlap
        const newNodes: AppNode[] = [];

        nodesToDuplicate.forEach(node => {
            if (DEBUG) console.log("[bulkDuplicateNodes] Duplicating node:", node.id, "type:", node.type);
            const newNode = {
                ...node,
                id: uuidv4(),
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

        set((state) => ({ nodes: [...state.nodes, ...newNodes] }));

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

        if (DEBUG) console.log("[bulkApplyColor] Completed");
    },

    fuseNodes: (nodeIds: string[]) => {
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
                height: MIN_FUSED_SIZE
            },
            parentId: currentParentId || undefined
        };

        // Remove original nodes and add fused node
        const newNodes = nodes.filter(n => !nodeIds.includes(n.id));
        if (DEBUG) console.log("[fuseNodes] Nodes after filtering:", newNodes.length, "removed:", nodes.length - newNodes.length);

        newNodes.push(fusedNode);
        if (DEBUG) console.log("[fuseNodes] Nodes after adding fused:", newNodes.length);

        // Check for duplicates
        const nodeIdSet = new Set(newNodes.map(n => n.id));
        if (nodeIdSet.size !== newNodes.length) {
            if (DEBUG) {
                console.error("[fuseNodes] ERROR: Duplicate node IDs detected!");
                const idCounts = new Map<string, number>();
                newNodes.forEach(n => {
                    idCounts.set(n.id, (idCounts.get(n.id) || 0) + 1);
                });
                idCounts.forEach((count, id) => {
                    if (count > 1) {
                        console.error("[fuseNodes] Duplicate ID:", id, "count:", count);
                    }
                });
            }
        }

        // Remove edges connected to deleted nodes
        const newEdges = edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target));

        set({ nodes: newNodes, edges: newEdges });

        if (DEBUG) console.log("[fuseNodes] Completed - Final node count:", newNodes.length);
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

        // Build sections from orphans, split by headings and dividers
        const orphanIdSet = new Set(orphanBlocks.map(b => b.id));
        const isSectionBoundary = (b: any) =>
            b.type === 'heading1' ||
            b.type === 'heading2' ||
            b.type === 'heading3' ||
            b.type === 'divider';

        const sections: any[][] = [];
        let currentSection: any[] = [];

        parentContent.forEach((block: any) => {
            if (!orphanIdSet.has(block.id)) {
                return;
            }

            if (isSectionBoundary(block)) {
                if (currentSection.length > 0) {
                    sections.push(currentSection);
                }
                currentSection = [block];
            } else {
                if (currentSection.length === 0) {
                    currentSection = [block];
                } else {
                    currentSection.push(block);
                }
            }
        });

        if (currentSection.length > 0) {
            sections.push(currentSection);
        }

        if (sections.length === 0) {
            if (DEBUG) console.log("[hydrateCanvas] Orphans exist but no sections were formed.");
            return;
        }

        // Calculate base position: below existing children or default
        const margin = BASE_UNIT;
        let startY = margin;
        const startX = margin;
        
        // Use a more generous grid for fused nodes
        const gridColumnWidth = BASE_UNIT * 10;  // 560px (allows for gap between 432px cards)
        const gridRowHeight = BASE_UNIT * 10;    // 560px
        const maxColumns = 4;         // Max 4 per row for better visibility

        if (children.length > 0) {
            const maxY = Math.max(
                ...children.map(c => c.position.y + ((c.style?.height as number) || MIN_FUSED_SIZE))
            );
            startY = snapToGridValue(maxY + BASE_UNIT * 2);
        }

        const newNodes: AppNode[] = sections.map((sectionBlocks, index) => {
            const newNodeId = uuidv4();
            
            // Calculate grid position
            const row = Math.floor(index / maxColumns);
            const col = index % maxColumns;
            
            const x = startX + (col * gridColumnWidth);
            const y = startY + (row * gridRowHeight);

            return {
                id: newNodeId,
                type: 'fused-note',
                position: { x, y },
                style: { width: MIN_FUSED_SIZE, height: MIN_FUSED_SIZE },
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

        if (DEBUG) console.log("[hydrateCanvas] Created fused nodes for sections:", newNodes.map(n => n.id));
    }
});
