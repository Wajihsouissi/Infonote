import {
    type Edge,
    type NodeChange,
    type EdgeChange,
    type Connection,
} from '@xyflow/react';
import type { AppNode } from '../types';
import type { LimitViolation } from './nodeLimits';
import type { AIAssistantMessage, AIContextType, AIIntent, AIMessage, AIMode, AIStep } from '../features/ai/aiTypes';
import type { AIEffort } from '../config/aiEffort';
import type { CloudLoadProgress } from '../services/cloudSync';

export interface Breadcrumb {
    id: string | null;
    label: string;
}

export interface NodeSlice {
    nodes: AppNode[];
    edges: Edge[];
    /** A destructive branch action waiting for an explicit user decision. */
    pendingNodeDeletion: {
        nodeIds: string[];
        selectedCount: number;
        nestedCount: number;
        totalCount: number;
    } | null;
    /** In-memory, one-click recovery for the most recent confirmed deletion. */
    lastNodeDeletion: {
        beforeNodes: AppNode[];
        beforeEdges: Edge[];
        afterNodes: AppNode[];
        afterEdges: Edge[];
        message: string;
    } | null;
    onNodesChange: (changes: NodeChange[]) => void;
    setNodes: (nodes: AppNode[] | ((nodes: AppNode[]) => AppNode[])) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    onReconnect: (oldEdge: Edge, newConnection: Connection) => void;
    addNode: (type: 'note' | 'block' | 'fused-note' | 'kanban' | 'youtube', position: { x: number; y: number }, initialData?: Record<string, unknown>, style?: React.CSSProperties, parentId?: string, customId?: string) => void;
    updateNodeData: (id: string, data: Record<string, unknown>) => void;
    updateNode: (id: string, updates: Partial<AppNode>) => void;
    splitNode: (nodeId: string, splitBlockId: string, currentBlocks?: unknown[], skipConfirm?: boolean) => void;
    releaseNodeContentToBlocks: (nodeId: string, centerPosition?: { x: number; y: number }, skipConfirm?: boolean) => void;
    extractPageFromBlock: (block: Record<string, unknown>, position: { x: number; y: number }, sourceNodeId?: string) => void;
    createPageFromText: (text: string, position?: { x: number; y: number }) => string;
    savePageContent: (parentId: string, content: unknown[], transientNodeIds: string[]) => void;
    syncParentContent: (parentId: string) => void;
    requestNodeDeletion: (nodeIds: string[]) => void;
    cancelNodeDeletion: () => void;
    confirmNodeDeletion: () => void;
    undoLastNodeDeletion: () => void;
    dismissLastNodeDeletion: () => void;
    bulkDeleteNodes: (nodeIds: string[], skipConfirm?: boolean) => void;
    bulkDuplicateNodes: (nodeIds: string[]) => void;
    pasteClipboardNodes: (payload: import('../features/clipboard/clipboardPayload').NodesPayload, origin: { x: number; y: number }) => string[];
    bulkApplyColor: (nodeIds: string[], color: string) => void;
    fuseNodes: (nodeIds: string[], skipConfirm?: boolean) => void;
    hydrateCanvasFromContent: (nodeId: string) => void;
    /** Converts a saved centre-topic map into the current top-to-bottom document tree. */
    migrateTopicMapToDocumentTree: (nodeId: string) => boolean;
    linkSelectedNodes: (mainNodeId: string, targetNodeIds: string[]) => void;
    updateEdge: (id: string, updates: Partial<Edge>) => void;
    deleteEdge: (id: string) => void;
    duplicateEdge: (id: string) => void;
    bringEdgeToFront: (id: string) => void;
    arrangeNodes: (nodeIds: string[], mode: 'grid' | 'circle' | 'flow' | 'horizontal-row' | 'vertical-column' | 'mindmap-horizontal' | 'mindmap-vertical' | 'related-clusters') => void;
    /** Compact and align every node on the active canvas; returns the number moved. */
    organizeCanvas: () => number;
    /** Apply a reviewed AI canvas arrangement. This never changes card content. */
    applyCanvasOrganization: (operation: {
        positions: Record<string, { x: number; y: number }>;
        removeEdgeIds: string[];
        connections: Array<{ source: string; target: string; label?: string }>;
    }) => {
        positions: Record<string, { x: number; y: number }>;
        edges: Edge[];
    };
    /** Restore the exact positions and connectors captured before an AI arrangement. */
    restoreCanvasOrganization: (snapshot: {
        positions: Record<string, { x: number; y: number }>;
        edges: Edge[];
    }) => void;
    applyRemoteNodeUpdate: (id: string, updates: Partial<AppNode>) => void;
    applyRemoteEdgeUpdate: (id: string, updates: Partial<Edge>) => void;
}

export interface NavigationSlice {
    currentParentId: string | null;
    lastExitedNodeId: string | null;
    clearLastExitedNodeId: () => void;
    breadcrumbs: Breadcrumb[];
    fullscreenId: string | null;
    rightSidePanelId: string | null;
    leftSidePanelId: string | null;
    centerPanelId: string | null;
    /**
     * The card whose task list is open, if any.
     *
     * Deliberately independent of the panel ids above, which close one another:
     * this opens *over* whatever you were looking at — a board, a calendar —
     * and closing it must put you back there rather than on a bare canvas.
     */
    tasksCardId: string | null;
    navigateToNode: (nodeId: string | null) => void;
    setFullscreenId: (id: string | null) => void;
    setTasksCardId: (id: string | null) => void;
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
        isRestoringGraph: boolean;
        
        // Dynamic Save States:
        localLastSaved: string | null;
        /** Set ONLY by a real write to the cloud — never by a load. */
        cloudLastSaved: string | null;
        cloudLastSaveTimeMs?: number | null;
        /** Set ONLY by a successful read from the cloud — never by a save. */
        cloudLastLoaded: string | null;
        isLocalDirty: boolean;
        isCloudDirty: boolean;
        localError: string | null;
        cloudError: string | null;

        // Backup — saved before loadGraph overwrites current state
        backupNodes: AppNode[];
        backupEdges: Edge[];

        /* Single source of truth for "a cloud load is happening right now".
           Both the loader UI and the cloud status icon read this, so they can
           never disagree about whether data is still arriving.
             blocking   — first open of an empty canvas; the shell is frozen.
             background — any later refresh; the canvas stays interactive. */
        cloudLoad: {
            phase: 'idle' | 'blocking' | 'background';
            progress: CloudLoadProgress | null;
        };

        // Delta Tracking
        dirtyNodeIds: Set<string>;
        dirtyEdgeIds: Set<string>;
        deletedNodeIds: Set<string>;
        deletedEdgeIds: Set<string>;
    };
    setStorageStatus: (isConnected: boolean, directoryName: string | null) => void;
    setLastSaved: (date: string | null) => void;
    setIsSaving: (isSaving: boolean) => void;
    loadGraph: (nodes: AppNode[], edges: Edge[]) => void;

    // Setters for Dynamic States:
    setLocalLastSaved: (date: string | null) => void;
    setCloudLastSaved: (date: string | null) => void;
    setCloudLastLoaded: (date: string | null) => void;
    setLocalDirty: (dirty: boolean) => void;
    setCloudDirty: (dirty: boolean) => void;
    setLocalError: (err: string | null) => void;
    setCloudError: (err: string | null) => void;
    setCloudLoad: (
        phase: 'idle' | 'blocking' | 'background',
        progress?: CloudLoadProgress | null,
    ) => void;

    /** Delta Tracking */
    markNodesDirty: (ids: string[]) => void;
    markEdgesDirty: (ids: string[]) => void;
    markNodesDeleted: (ids: string[]) => void;
    markEdgesDeleted: (ids: string[]) => void;
    clearSyncTracking: (syncedNodes: Set<string>, syncedEdges: Set<string>, deletedNodes: Set<string>, deletedEdges: Set<string>) => void;

    /** Restore the snapshot taken before the last loadGraph call. */
    restoreFromBackup: () => void;
}

export type AppView = 'landing' | 'canvas' | 'marketplace' | 'login' | 'signup' | 'wajihadmin' | 'profile' | 'marketing' | 'update-password' | 'features' | 'not-found';

export interface AuthUser {
    id: string;
    email: string | null;
    displayName?: string | null;
}

export interface AuthState {
    userId: string | null;
    email: string | null;
    displayName: string | null;
    activeWorkspaceId: string | null;
    isAuthenticated: boolean;
    isAuthLoading: boolean;
}

export interface AuthSlice {
    auth: AuthState;
    isAuthModalOpen: boolean;
    setAuthUser: (user: AuthUser | null) => void;
    setAuthWorkspace: (workspaceId: string | null) => void;
    setAuthLoading: (isLoading: boolean) => void;
    setAuthModalOpen: (isOpen: boolean) => void;
    /** Reset auth slice back to its unauthenticated default. */
    resetAuth: () => void;
}

export interface UISlice {
    activeIconMenuId: string | null;
    theme: 'light' | 'dark';
    currentView: AppView;
    hasEnteredApp: boolean;
    interactionState: {
        draggedNodeId: string | null;
        // True while a multi-node drag is active (>1 selected nodes being moved).
        // Lets cards opt out of single-drag visuals in favor of a unified group lift.
        isMultiDragging: boolean;
        dropTarget: {
            id: string;
            // `gallery` is fusion's media-only sibling: the drop merges both
            // sides into one bento board instead of stacking their blocks.
            // `kanban` adopts the card into a board lane — see kanbanTypes.ts.
            type: 'fusion' | 'nesting' | 'gallery' | 'kanban';
        } | null;
        /**
         * Lane under the cursor while a card is dragged over a board. Held
         * separately from `dropTarget` because the lane, not the board, is what
         * highlights and what decides the metadata value the drop writes.
         */
        hoveredKanbanLane: { boardId: string; value: string } | null;
    };
    lastCreatedCanvasNodeId: string | null;
    selectedCanvasNodeIds: Set<string>;
    isMetadataOpen: boolean;
    isTOCOpen: boolean;
    isShortcutsPanelOpen: boolean;
    isLinkingMode: boolean;
    chunkItNodeId: string | null;
    setActiveIconMenuId: (id: string | null) => void;
    setMetadataOpen: (isOpen: boolean) => void;
    setTOCOpen: (isOpen: boolean) => void;
    setShortcutsPanelOpen: (isOpen: boolean) => void;
    setInteractionState: (state: Partial<UISlice['interactionState']>) => void;
    toggleTheme: (origin?: { x: number; y: number }) => void;
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
    setChunkItNodeId: (id: string | null) => void;
    /** Set when node creation was blocked by a beta limit (see BETA_SCOPE.md). */
    limitNotice: LimitViolation | null;
    setLimitNotice: (notice: LimitViolation | null) => void;
}

export interface AISlice {
    isAIPanelOpen: boolean;
    /** Visual treatment only. The live chat remains one instance in all modes. */
    aiPresentation: 'side' | 'center' | 'fullscreen';
    setAIPresentation: (presentation: 'side' | 'center' | 'fullscreen') => void;
    /** Fullscreen only: whether its reusable history rail is expanded. */
    aiHistoryRailOpen: boolean;
    setAIHistoryRailOpen: (isOpen: boolean) => void;
    aiMode: AIMode;
    /** Image generation is a variant of Create, not a third mode. */
    aiImageMode: boolean;
    aiMessages: AIMessage[];
    aiIsRunning: boolean;
    /** Requested gateway model; null means "let the server choose". */
    aiModel: string | null;
    setAIModel: (model: string | null) => void;
    /** How deep and richly formatted the output should be. */
    aiEffort: AIEffort;
    setAIEffort: (effort: AIEffort) => void;
    /** User-resized panel width in px. Independent of the model/effort prefs. */
    aiPanelWidth: number;
    setAIPanelWidth: (width: number) => void;
    setAIPanelOpen: (isOpen: boolean) => void;
    openAIPanel: (mode?: AIMode) => void;
    toggleAIPanel: () => void;
    setAIMode: (mode: AIMode) => void;
    setAIImageMode: (on: boolean) => void;
    setAIRunning: (running: boolean) => void;
    aiWebSearch: boolean;
    setAIWebSearch: (on: boolean) => void;
    /** Content types the user has explicitly selected for the next create turn. Empty = AI chooses freely. */
    aiSelectedContexts: AIContextType[];
    toggleAIContext: (type: AIContextType) => void;
    clearAIContexts: () => void;
    /**
     * Canvas sources the user attached with `@` for the next turn (ai-Plan.md §5.3).
     *
     * Holds only explicit attachments — cards, a canvas level, or a subtree.
     * A visual selection does not grant context access; attach it through
     * `@Selection` first. AIPanel clears this after each sent turn.
     */
    aiScope: import('../features/ai/aiScope').AIScopeSource[];
    addAIScopeSource: (source: import('../features/ai/aiScope').AIScopeSource) => void;
    removeAIScopeSource: (key: string) => void;
    clearAIScope: () => void;
    /** Mark a clarifying form answered or skipped, in place (ai-Plan.md §5.2). */
    settleAIForm: (
        id: string,
        status: 'answered' | 'skipped',
        answers?: Record<string, string[]>,
    ) => void;
    appendAIMessage: (message: AIMessage) => void;
    /** Opens an assistant turn and returns its id for the streaming updates. */
    startAITurn: (intent: AIIntent) => string;
    updateAITurn: (id: string, patch: Partial<AIAssistantMessage>) => void;
    pushAIStep: (id: string, step: AIStep) => void;
    appendAIText: (id: string, delta: string) => void;
    newAIChat: () => void;
    removeAIMessages: (ids: string[]) => void;
    aiChatId: string | null;
    aiChats: import('../services/storage/AIChatStore').AIChatSummary[];
    aiChatsLoading: boolean;
    refreshAIChats: () => Promise<void>;
    /** Save against the workspace; a board id is retained only for legacy callers. */
    persistAIChat: (boardId?: string | null) => Promise<void>;
    openAIChat: (id: string) => Promise<void>;
    duplicateAIChat: (id: string) => Promise<void>;
    regenerateAIChat: (id: string) => Promise<string | null>;
    deleteAIChat: (id: string) => Promise<void>;
}

export type AppState = NodeSlice & NavigationSlice & StorageSlice & UISlice & AuthSlice & AISlice;
