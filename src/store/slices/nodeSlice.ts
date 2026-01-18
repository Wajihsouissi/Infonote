import type { StateCreator } from 'zustand';
import {
    type Edge,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../../types';
import { computeParentContentUpdate } from '../contentSync';
import type { AppState, NodeSlice } from '../types';

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

const initialEdges: Edge[] = [
    { id: 'e1-2', source: '1', target: '2', animated: true, data: { parentId: undefined } },
    { id: 'e2-3', source: '2', target: '3', data: { parentId: undefined } },
];

export const createNodeSlice: StateCreator<AppState, [], [], NodeSlice> = (set, get) => ({
    nodes: getInitialNodes(),
    edges: initialEdges,

    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes) as AppNode[],
        });

        // Optimization: Only sync parent content on structural changes (add/remove/dimensions)
        // Position changes are handled in onNodeDragStop to avoid per-frame overhead
        const hasStructuralChange = changes.some(c => c.type === 'remove' || c.type === 'add' || c.type === 'dimensions');

        const { currentParentId } = get();
        if (currentParentId && hasStructuralChange) {
            get().syncParentContent(currentParentId);
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
        const parentIdData = currentParentId === null ? undefined : currentParentId;

        const newEdge = { ...connection, data: { parentId: parentIdData }, id: uuidv4() } as Edge;
        set({
            edges: addEdge(newEdge, get().edges),
        });
    },

    addNode: (type, position, initialData, style, parentId) => {
        const { currentParentId } = get();
        const targetParentId = parentId !== undefined ? parentId : (currentParentId || undefined);

        const newNode: AppNode = {
            id: uuidv4(),
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

        set((state) => ({ nodes: [...state.nodes, newNode] }));

        if (targetParentId) {
            get().syncParentContent(targetParentId);
        }
    },

    updateNodeData: (id, data) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, ...data } } : node
            ),
        });

        const { currentParentId } = get();
        if (currentParentId) {
            get().syncParentContent(currentParentId);
        }

        if (data.content && Array.isArray(data.content)) {
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

    splitNode: (nodeId, splitBlockId) => {
        const { nodes, edges } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);

        if (!sourceNode || !('content' in sourceNode.data) || !Array.isArray((sourceNode.data as any).content)) return;

        const blocks = (sourceNode.data as any).content as any[];
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
            } as any,
            style: {
                width: 350,
                height: 'auto'
            },
            parentId: sourceNode.parentId
        };

        const newEdge: Edge = {
            id: `e-${nodeId}-${newNodeId}`,
            source: nodeId,
            target: newNodeId,
            data: { parentId: sourceNode.parentId }
        };

        set({
            nodes: [
                ...nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, content: blocksToStay } } : n) as AppNode[],
                newNode
            ],
            edges: [...edges, newEdge]
        });
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

        const iconStyle = { width: 112, height: 112 };
        const iconViewMode = 'icon';
        const centeredPos = { x: position.x - 56, y: position.y - 56 };

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
        const pos = position || { x: 100, y: 100 };

        const newNode: AppNode = {
            id: newId,
            type: 'note',
            position: pos,
            style: { width: 112, height: 112 },
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
        const result = computeParentContentUpdate(parentId, nodes);

        if (result && result.shouldUpdate) {
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
        }
    },
});
