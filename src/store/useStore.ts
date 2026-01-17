import { create } from 'zustand';
import { temporal } from 'zundo';
import {
    type Edge,
    type NodeChange,
    type EdgeChange,
    type Connection,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../types';
import { computeParentContentUpdate } from './contentSync';

interface Breadcrumb {
    id: string | null; // null represents Root for UI logic
    label: string;
}

interface AppState {
    // State
    nodes: AppNode[];
    edges: Edge[];
    currentParentId: string | null; // null = root
    breadcrumbs: Breadcrumb[];
    fullscreenId: string | null;
    sidePanelId: string | null;
    centerPanelId: string | null;
    activeIconMenuId: string | null;
    isKanbanModalOpen: boolean;

    // Interaction State (Shared for Drag & Drop)
    interactionState: {
        draggingKanbanNodeId: string | null;
        hoveredKanbanColumn: { kanbanId: string; columnId: string } | null;
    };
    editingKanbanId: string | null;

    // Actions
    setActiveIconMenuId: (id: string | null) => void;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    addNode: (type: 'note' | 'block', position: { x: number; y: number }, initialData?: any, style?: React.CSSProperties, parentId?: string) => void;
    navigateToNode: (nodeId: string | null) => void;
    updateNodeData: (id: string, data: any) => void;
    updateNode: (id: string, updates: Partial<AppNode>) => void;
    setFullscreenId: (id: string | null) => void;
    setSidePanelId: (id: string | null) => void;
    setCenterPanelId: (id: string | null) => void;
    setKanbanModalOpen: (isOpen: boolean) => void;
    setEditingKanbanId: (id: string | null) => void;
    setInteractionState: (state: Partial<AppState['interactionState']>) => void;

    // Storage Actions
    storage: {
        isConnected: boolean;
        directoryName: string | null;
        lastSaved: string | null;
    };
    setStorageStatus: (isConnected: boolean, directoryName: string | null) => void;
    setLastSaved: (date: string | null) => void;
    loadGraph: (nodes: AppNode[], edges: Edge[]) => void;
    splitNode: (nodeId: string, splitBlockId: string, currentBlocks?: any[]) => void;
    extractPageFromBlock: (block: any, position: { x: number; y: number }, sourceNodeId?: string) => void;
    createPageFromText: (text: string, position?: { x: number; y: number }) => string;
    savePageContent: (parentId: string, content: any[], transientNodeIds: string[]) => void;
    syncParentContent: (parentId: string) => void;
}

const initialNodes: AppNode[] = [
    {
        id: '1',
        type: 'note',
        position: { x: 100, y: 100 },
        data: {
            label: 'Project Goal',
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
            content: 'Atomic notes, infinite canvas, linking.',
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
            viewMode: 'icon',
            icon: 'Settings'
        },
        style: { width: 96, height: 96 },
        parentId: undefined,
    },
];

const initialEdges: Edge[] = [
    { id: 'e1-2', source: '1', target: '2', animated: true, data: { parentId: undefined } },
    { id: 'e2-3', source: '2', target: '3', data: { parentId: undefined } },
];

export const useStore = create<AppState>()(temporal((set, get) => ({
    nodes: initialNodes,
    edges: initialEdges,
    currentParentId: null,
    breadcrumbs: [{ id: null, label: 'Home' }],
    fullscreenId: null,
    sidePanelId: null,
    centerPanelId: null,
    activeIconMenuId: null,
    isKanbanModalOpen: false,
    editingKanbanId: null,
    interactionState: {
        draggingKanbanNodeId: null,
        hoveredKanbanColumn: null
    },

    setActiveIconMenuId: (id) => set({ activeIconMenuId: id }),
    setFullscreenId: (id) => set({ fullscreenId: id, sidePanelId: null, centerPanelId: null }),
    setSidePanelId: (id) => set({ sidePanelId: id, fullscreenId: null, centerPanelId: null }),
    setCenterPanelId: (id) => set({ centerPanelId: id, fullscreenId: null, sidePanelId: null }),
    setKanbanModalOpen: (isOpen) => set({ isKanbanModalOpen: isOpen, editingKanbanId: isOpen ? get().editingKanbanId : null }),
    setEditingKanbanId: (id) => set({ editingKanbanId: id }),
    setInteractionState: (newState) => set((state) => ({
        interactionState: { ...state.interactionState, ...newState }
    })),

    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes) as AppNode[],
        });
        const { currentParentId } = get();
        if (currentParentId) {
            get().syncParentContent(currentParentId);
        }
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },

    onConnect: (connection) => {
        const { currentParentId } = get();
        // Use undefined for root to match strict constraints if needed, or stick to null if handled.
        // For generic Edge data, we can cast or just ensure consistent type.
        const parentIdData = currentParentId === null ? undefined : currentParentId;

        const newEdge = { ...connection, data: { parentId: parentIdData }, id: uuidv4() } as Edge;
        set({
            edges: addEdge(newEdge, get().edges),
        });
    },

    addNode: (type, position, initialData, style, parentId) => {
        const { currentParentId } = get();
        // If parentId is explicitly passed (e.g. from Kanban), use it.
        // Otherwise use the current navigation context (currentParentId)
        // If both are null/undefined, it goes to root.
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

    navigateToNode: (nodeId) => {
        const { nodes, breadcrumbs } = get();

        if (nodeId === null) {
            // Go to root
            set({ currentParentId: null, breadcrumbs: [{ id: null, label: 'Home' }] });
            return;
        }

        // Find the target node to get its label
        const targetNode = nodes.find((n) => n.id === nodeId);
        if (!targetNode) return;

        // Check if we are navigating "up" (clicking a breadcrumb)
        const existingIndex = breadcrumbs.findIndex((b) => b.id === nodeId);
        if (existingIndex !== -1) {
            set({
                currentParentId: nodeId,
                breadcrumbs: breadcrumbs.slice(0, existingIndex + 1),
            });
        } else {
            // Navigating "down" (entering a node)
            set({
                currentParentId: nodeId,
                breadcrumbs: [...breadcrumbs, { id: nodeId, label: targetNode.type === 'note' ? (targetNode.data.label || 'Note') : 'Block' }],
            });
        }
    },

    updateNodeData: (id, data) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, ...data } } : node
            ),
        });

        // 1. Upward Sync (Child -> Parent)
        // If we are INSIDE a parent, any change to a child should sync UP to the parent.
        const { currentParentId } = get();
        // console.log("updateNodeData called:", { id, data, currentParentId });
        if (currentParentId) {
            get().syncParentContent(currentParentId);
        }

        // 2. Downstream Sync (Parent -> Child)
        // If we are modifying the CONTENT of a node (e.g. typing in Expanded View),
        // we must check if any "Page Blocks" inside that content refer to Linked Child Nodes.
        // If so, we must sync the label downwards.
        if (data.content && Array.isArray(data.content)) {
            // We need a helper for this too. Let's reuse computeParentContentUpdate logic?
            // Actually, we can just call a lightweight sync helper or inline it.
            // Since we have 'contentSync.ts', let's stick to doing it here for now or add a helper.
            // Let's iterate the new content and update linked nodes directly.

            const linkedUpdates: { id: string, label: string }[] = [];
            data.content.forEach((b: any) => {
                if (b.type === 'page' && b.metadata?.nodeId) {
                    linkedUpdates.push({ id: b.metadata.nodeId, label: b.content });
                }
            });

            if (linkedUpdates.length > 0) {
                set((state) => {
                    // Filter only if actual change needed?
                    const nodesToUpdate = state.nodes.filter(n => {
                        const update = linkedUpdates.find(u => u.id === n.id);
                        return update && (n.data as any).label !== update.label;
                    });

                    if (nodesToUpdate.length === 0) return state;

                    console.log("Downstream Sync (Parent -> Child):", nodesToUpdate.length);

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

    // Storage Support
    storage: {
        isConnected: false,
        directoryName: null,
        lastSaved: null
    },
    setStorageStatus: (isConnected, directoryName) => set((state) => ({
        storage: { ...state.storage, isConnected, directoryName }
    })),
    setLastSaved: (date) => set((state) => ({
        storage: { ...state.storage, lastSaved: date }
    })),

    loadGraph: (nodes, edges) => {
        set({
            nodes,
            edges,
            // Reset history when loading a new graph? Maybe.
            // For now, simplify.
        });
    },

    splitNode: (nodeId, splitBlockId) => {
        const { nodes, edges } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);

        // Safety check for content
        if (!sourceNode || !('content' in sourceNode.data) || !Array.isArray((sourceNode.data as any).content)) return;

        const blocks = (sourceNode.data as any).content as any[];
        const splitIndex = blocks.findIndex(b => b.id === splitBlockId);

        if (splitIndex === -1 || splitIndex === 0) return; // Not found or splitting at start (no op?)

        // Split Logic
        const blocksToStay = blocks.slice(0, splitIndex);
        const blocksToMove = blocks.slice(splitIndex);

        if (blocksToMove.length === 0) return;

        // Create New Node
        // Position it below the current one? Or to the right?
        // Let's go with "Below" + 20px gap
        const currentHeight = sourceNode.style?.height && typeof sourceNode.style.height === 'number'
            ? sourceNode.style.height
            : 400; // rough estimate if auto

        const newPostion = {
            x: sourceNode.position.x,
            y: sourceNode.position.y + Number(currentHeight) + 50
        };

        const newNodeId = uuidv4();

        // Determine Label for new node
        // const firstBlock = blocksToMove[0];
        // let newLabel = "New Note";
        // if (['heading1', 'heading2', 'heading3'].includes(firstBlock.type)) {
        //     newLabel = firstBlock.content || "Untitled Section";
        // } else if (firstBlock.type === 'toggle') {
        //     newLabel = firstBlock.content || "Toggle Section";
        // }

        // Handle viewMode safely
        // const sourceViewMode = 'viewMode' in sourceNode.data ? (sourceNode.data as any).viewMode : 'medium';

        const newNode: AppNode = {
            id: newNodeId,
            type: 'fused-note', // CHANGED: Create FusedNoteNode
            position: newPostion,
            data: {
                content: blocksToMove,
                // Fused notes don't need all the note metadata initially
            } as any,
            style: {
                width: 350, // Standard width for fused note
                height: 'auto'
            },
            parentId: sourceNode.parentId
        };

        // Create Edge connecting source -> new node (User "Nested" intent usually implies link)
        const newEdge: Edge = {
            id: `e-${nodeId}-${newNodeId}`,
            source: nodeId,
            target: newNodeId,
            data: { parentId: sourceNode.parentId }
        };

        // Update Source Node (Remove moved blocks)
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

        console.log("Extracting Page:", { block, position, sourceNodeId, linkedNodeId });

        // 1. Remove from source (if sourceNodeId provided)
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

        // 2. Add or Update Target Node
        // Target Logic: Icon Card (112x112)
        const iconStyle = { width: 112, height: 112 };
        const iconViewMode = 'icon';
        const centeredPos = { x: position.x - 56, y: position.y - 56 };

        const existingNode = linkedNodeId ? nodesToUpdate.find(n => n.id === linkedNodeId) : null;

        if (existingNode) {
            // Move Existing Node
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
            // Create New Icon Note
            const newNode: AppNode = {
                id: uuidv4(),
                type: 'note',
                position: centeredPos,
                style: iconStyle,
                data: {
                    label: block.content || 'Untitled Page',
                    content: [],
                    viewMode: iconViewMode,
                    icon: 'FileText', // Default icon
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

        // Default position if not provided: Center of screen or relative to something
        // For now, let's dump it at 100, 100 or rely on the caller to provide pos
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
                icon: 'FileText', // Default icon
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
                    // Update Parent
                    if (n.id === parentId) {
                        return { ...n, data: { ...n.data, content: result.parentContent } };
                    }
                    // Update Ejected Children
                    const update = result.nodesToUpdate.find(u => u.id === n.id);
                    if (update) {
                        return { ...n, data: update.data };
                    }
                    return n;
                })
            }));
        }
    },

}), {
    // Configure zundo
    limit: 50, // Limit history stack size
    partialize: (state) => {
        const {
            nodes,
            edges,
            // Track navigation state? Usually better to NOT track it for undo/redo of "content", but some users expect it.
            // Let's track structural changes (nodes/edges) mainly.
            // Excluding UI state:
        } = state;
        return { nodes, edges };
    },
    // Exclude actions that are just transient
    equality: (a, b) => {
        // Simple equality check to avoid duplicates if needed, or rely on default
        return JSON.stringify(a) === JSON.stringify(b);
    }
}));

