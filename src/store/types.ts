import {
    type Edge,
    type NodeChange,
    type EdgeChange,
    type Connection,
} from '@xyflow/react';
import type { AppNode } from '../types';

export interface Breadcrumb {
    id: string | null;
    label: string;
}

export interface NodeSlice {
    nodes: AppNode[];
    edges: Edge[];
    onNodesChange: (changes: NodeChange[]) => void;
    setNodes: (nodes: AppNode[] | ((nodes: AppNode[]) => AppNode[])) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    addNode: (type: 'note' | 'block' | 'fused-note' | 'kanban', position: { x: number; y: number }, initialData?: Record<string, unknown>, style?: React.CSSProperties, parentId?: string, customId?: string) => void;
    updateNodeData: (id: string, data: Record<string, unknown>) => void;
    updateNode: (id: string, updates: Partial<AppNode>) => void;
    splitNode: (nodeId: string, splitBlockId: string, currentBlocks?: unknown[], skipConfirm?: boolean) => void;
    releaseNodeContentToBlocks: (nodeId: string, centerPosition?: { x: number; y: number }, skipConfirm?: boolean) => void;
    extractPageFromBlock: (block: Record<string, unknown>, position: { x: number; y: number }, sourceNodeId?: string) => void;
    createPageFromText: (text: string, position?: { x: number; y: number }) => string;
    savePageContent: (parentId: string, content: unknown[], transientNodeIds: string[]) => void;
    syncParentContent: (parentId: string) => void;
    bulkDeleteNodes: (nodeIds: string[], skipConfirm?: boolean) => void;
    bulkDuplicateNodes: (nodeIds: string[]) => void;
    bulkApplyColor: (nodeIds: string[], color: string) => void;
    fuseNodes: (nodeIds: string[], skipConfirm?: boolean) => void;
    hydrateCanvasFromContent: (nodeId: string) => void;
    linkSelectedNodes: (mainNodeId: string, targetNodeIds: string[]) => void;
    updateEdge: (id: string, updates: Partial<Edge>) => void;
    deleteEdge: (id: string) => void;
    duplicateEdge: (id: string) => void;
    bringEdgeToFront: (id: string) => void;
    arrangeNodes: (nodeIds: string[], mode: 'grid' | 'circle' | 'flow' | 'horizontal-row' | 'vertical-column' | 'mindmap-horizontal' | 'mindmap-vertical') => void;
}

export interface NavigationSlice {
    currentParentId: string | null;
    breadcrumbs: Breadcrumb[];
    fullscreenId: string | null;
    rightSidePanelId: string | null;
    leftSidePanelId: string | null;
    centerPanelId: string | null;
    navigateToNode: (nodeId: string | null) => void;
    setFullscreenId: (id: string | null) => void;
    setSidePanelId: (id: string | null) => void; // Deprecated, aliases to setRightSidePanelId
    setRightSidePanelId: (id: string | null) => void;
    setLeftSidePanelId: (id: string | null) => void;
    setCenterPanelId: (id: string | null) => void;
    reconstructBreadcrumbs: () => void;
}

export interface StorageSlice {
    storage: {
        isConnected: boolean;
        directoryName: string | null;
        lastSaved: string | null;
        isSaving: boolean;
        
        // Dynamic Save States:
        localLastSaved: string | null;
        cloudLastSaved: string | null;
        isLocalDirty: boolean;
        isCloudDirty: boolean;
        localError: string | null;
        cloudError: string | null;

        // Backup — saved before loadGraph overwrites current state
        backupNodes: AppNode[];
        backupEdges: Edge[];
    };
    setStorageStatus: (isConnected: boolean, directoryName: string | null) => void;
    setLastSaved: (date: string | null) => void;
    setIsSaving: (isSaving: boolean) => void;
    loadGraph: (nodes: AppNode[], edges: Edge[]) => void;

    // Setters for Dynamic States:
    setLocalLastSaved: (date: string | null) => void;
    setCloudLastSaved: (date: string | null) => void;
    setLocalDirty: (dirty: boolean) => void;
    setCloudDirty: (dirty: boolean) => void;
    setLocalError: (err: string | null) => void;
    setCloudError: (err: string | null) => void;

    /** Restore the snapshot taken before the last loadGraph call. */
    restoreFromBackup: () => void;
}

export type AppView = 'landing' | 'canvas' | 'marketplace' | 'login' | 'signup' | 'wajihadmin' | 'profile' | 'marketing';

export interface AuthUser {
    id: string;
    email: string | null;
    displayName?: string | null;
}

export interface AuthState {
    userId: string | null;
    email: string | null;
    displayName: string | null;
    isAuthenticated: boolean;
    isAuthLoading: boolean;
}

export interface AuthSlice {
    auth: AuthState;
    isAuthModalOpen: boolean;
    setAuthUser: (user: AuthUser | null) => void;
    setAuthLoading: (isLoading: boolean) => void;
    setAuthModalOpen: (isOpen: boolean) => void;
    /** Reset auth slice back to its unauthenticated default. */
    resetAuth: () => void;
}

export interface UISlice {
    activeIconMenuId: string | null;
    isKanbanModalOpen: boolean;
    theme: 'light' | 'dark';
    currentView: AppView;
    hasEnteredApp: boolean;
    interactionState: {
        draggingKanbanNodeId: string | null;
        hoveredKanbanColumn: { kanbanId: string; columnId: string } | null;
        draggedNodeId: string | null;
        dropTarget: {
            id: string;
            type: 'fusion' | 'nesting' | 'kanban-column';
        } | null;
    };
    editingKanbanId: string | null;
    lastCreatedCanvasNodeId: string | null;
    selectedCanvasNodeIds: Set<string>;
    isMetadataOpen: boolean;
    isTOCOpen: boolean;
    isShortcutsPanelOpen: boolean;
    isLinkingMode: boolean;
    setActiveIconMenuId: (id: string | null) => void;
    setKanbanModalOpen: (isOpen: boolean) => void;
    setEditingKanbanId: (id: string | null) => void;
    setMetadataOpen: (isOpen: boolean) => void;
    setTOCOpen: (isOpen: boolean) => void;
    setShortcutsPanelOpen: (isOpen: boolean) => void;
    setInteractionState: (state: Partial<UISlice['interactionState']>) => void;
    toggleTheme: () => void;
    setSelectedCanvasNodeIds: (ids: Set<string>) => void;
    toggleCanvasNodeSelection: (id: string) => void;
    setIsLinkingMode: (isLinking: boolean) => void;
    clearCanvasSelection: () => void;
    selectConnectedCanvasNodes: (nodeId: string) => void;
    setLastCreatedCanvasNodeId: (id: string | null) => void;
    setCurrentView: (view: AppView) => void;
    setHasEnteredApp: (val: boolean) => void;
    selectedEdgeId: string | null;
    setSelectedEdgeId: (id: string | null) => void;
    selectedEdgeIds: Set<string>;
    setSelectedEdgeIds: (ids: Set<string>) => void;
    toggleCanvasEdgeSelection: (id: string) => void;
    showWelcomeModal: boolean;
    setShowWelcomeModal: (v: boolean) => void;
}

export type AppState = NodeSlice & NavigationSlice & StorageSlice & UISlice & AuthSlice;
