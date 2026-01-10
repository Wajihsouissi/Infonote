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
        style: { width: 448, height: 448 },
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
        style: { width: 224, height: 224 },
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
        style: { width: 112, height: 112 },
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
    interactionState: {
        draggingKanbanNodeId: null,
        hoveredKanbanColumn: null
    },

    setActiveIconMenuId: (id) => set({ activeIconMenuId: id }),
    setFullscreenId: (id) => set({ fullscreenId: id, sidePanelId: null, centerPanelId: null }),
    setSidePanelId: (id) => set({ sidePanelId: id, fullscreenId: null, centerPanelId: null }),
    setCenterPanelId: (id) => set({ centerPanelId: id, fullscreenId: null, sidePanelId: null }),
    setKanbanModalOpen: (isOpen) => set({ isKanbanModalOpen: isOpen }),
    setInteractionState: (newState) => set((state) => ({
        interactionState: { ...state.interactionState, ...newState }
    })),

    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes) as AppNode[],
        });
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
            style: style || { width: 112, height: 112 },
            data: {
                label: initialData?.label || 'New Note',
                content: '',
                viewMode: 'icon',
                icon: 'FileText',
                ...initialData
            },
            parentId: targetParentId,
        };

        set((state) => ({ nodes: [...state.nodes, newNode] }));
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

