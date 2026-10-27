import type { AIAssistantMessage, AIContextType, AIIntent, AIMessage, AIMode, AIStep } from '../features/ai/aiTypes';
import type { AIScopeSource } from '../features/ai/aiScope';
import type { AIEffort } from '../config/aiEffort';
import type { AIChatSummary } from '../services/storage/chat/AIChatStore';
import type { AppView } from '../app/routes';
import type {
    Edge,
    NodeChange,
    EdgeChange,
    Connection,
} from '@xyflow/react';
import type { AppNode, AppNodeType } from '../types';
import type { LimitViolation } from './nodeLimits';
import type { NodesPayload } from '../features/clipboard/clipboardPayload';

export interface Breadcrumb {
    id: string | null;
    label: string;
}

export type ArrangeMode =
    | 'grid'
    | 'circle'
    | 'flow'
    | 'horizontal-row'
    | 'vertical-column'
    | 'mindmap-horizontal'
    | 'mindmap-vertical'
    | 'related-clusters';

/** Core graph state and the React Flow handlers that drive it. */
export interface NodeCoreSlice {
    nodes: AppNode[];
    edges: Edge[];
    onNodesChange: (changes: NodeChange[]) => void;
    setNodes: (nodes: AppNode[] | ((nodes: AppNode[]) => AppNode[])) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    onReconnect: (oldEdge: Edge, newConnection: Connection) => void;
    addNode: (type: AppNodeType, position: { x: number; y: number }, initialData?: Record<string, unknown>, style?: React.CSSProperties, parentId?: string, customId?: string) => void;
    updateNodeData: (id: string, data: Record<string, unknown>) => void;
    updateNode: (id: string, updates: Partial<AppNode>) => void;
}

/** Moving content between nodes (see slices/nodeContentSlice.ts). */
export interface NodeContentSlice {
    splitNode: (nodeId: string, splitBlockId: string, currentBlocks?: unknown[], skipConfirm?: boolean) => void;
    releaseNodeContentToBlocks: (nodeId: string, centerPosition?: { x: number; y: number }, skipConfirm?: boolean) => void;
    extractPageFromBlock: (block: Record<string, unknown>, position: { x: number; y: number }, sourceNodeId?: string) => void;
    createPageFromText: (text: string, position?: { x: number; y: number }) => string;
    savePageContent: (parentId: string, content: unknown[], transientNodeIds: string[]) => void;
    syncParentContent: (parentId: string) => void;
    fuseNodes: (nodeIds: string[], skipConfirm?: boolean) => void;
}

/** Actions on many nodes at once (see slices/nodeBulkSlice.ts). */
export interface NodeBulkSlice {
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
    requestNodeDeletion: (nodeIds: string[]) => void;
    cancelNodeDeletion: () => void;
    confirmNodeDeletion: () => void;
    undoLastNodeDeletion: () => void;
    dismissLastNodeDeletion: () => void;
    bulkDeleteNodes: (nodeIds: string[], skipConfirm?: boolean) => void;
    bulkDuplicateNodes: (nodeIds: string[]) => void;
    pasteClipboardNodes: (payload: NodesPayload, origin: { x: number; y: number }) => string[];
    bulkApplyColor: (nodeIds: string[], color: string) => void;
}

export interface EdgeSlice {
    linkSelectedNodes: (mainNodeId: string, targetNodeIds: string[]) => void;
    updateEdge: (id: string, updates: Partial<Edge>) => void;
    deleteEdge: (id: string) => void;
    duplicateEdge: (id: string) => void;
    bringEdgeToFront: (id: string) => void;
}

/** The auto mind map (see slices/nestedCanvasSlice.ts). */
export interface NestedCanvasSlice {
    hydrateCanvasFromContent: (nodeId: string) => void;
    /** Converts a saved centre-topic map into the current top-to-bottom document tree. */
    migrateTopicMapToDocumentTree: (nodeId: string) => boolean;
}

export interface LayoutSlice {
    arrangeNodes: (nodeIds: string[], mode: ArrangeMode) => void;
    /** Compact and align every node on the active canvas; returns the number moved. */
    organizeCanvas: () => number;
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
    navigateToNode: (nodeId: string | null) => void;
    setFullscreenId: (id: string | null) => void;
    setRightSidePanelId: (id: string | null) => void;
    setLeftSidePanelId: (id: string | null) => void;
    setCenterPanelId: (id: string | null) => void;
    reconstructBreadcrumbs: () => void;
}

/** Local-only persistence state: the beta saves to this browser and nowhere else. */
export interface StorageSlice {
    storage: {
        /** Time of the last successful write to this browser. */
        localLastSaved: string | null;
        /** True while a change has not reached this browser's storage yet. */
        isLocalDirty: boolean;
        localError: string | null;
    };
    loadGraph: (nodes: AppNode[], edges: Edge[]) => void;
    setLocalLastSaved: (time: string | null) => void;
    setLocalDirty: (dirty: boolean) => void;
    setLocalError: (err: string | null) => void;
}

export interface AuthUser {
    id: string;
    email: string | null;
    displayName?: string | null;
    /** Session token for the AI routes; see AuthState.accessToken. */
    accessToken?: string | null;
}

export interface AuthState {
    userId: string | null;
    email: string | null;
    displayName: string | null;
    isAuthenticated: boolean;
    isAuthLoading: boolean;
    /**
     * The session token the AI routes authenticate with.
     *
     * Held here rather than fetched where it is needed: every AI request wants
     * it, and an async lookup per request is one more thing that can fail
     * between pressing send and the answer starting.
     */
    accessToken: string | null;
}

export interface AuthSlice {
    auth: AuthState;
    setAuthUser: (user: AuthUser | null) => void;
    setAuthLoading: (isLoading: boolean) => void;
}

export interface UISlice {
    /** Which page is on screen. App.tsx keeps the URL in step with it. */
    view: AppView;
    setView: (view: AppView) => void;
    activeIconMenuId: string | null;
    theme: 'light' | 'dark';
    interactionState: {
        draggedNodeId: string | null;
        // True while a multi-node drag is active (>1 selected nodes being moved).
        // Lets cards opt out of single-drag visuals in favor of a unified group lift.
        isMultiDragging: boolean;
        dropTarget: {
            id: string;
            // `gallery` is fusion's media-only sibling: the drop merges both
            // sides into one bento board instead of stacking their blocks.
            type: 'fusion' | 'nesting' | 'gallery';
        } | null;
    };
    lastCreatedCanvasNodeId: string | null;
    selectedCanvasNodeIds: Set<string>;
    isTOCOpen: boolean;
    isShortcutsPanelOpen: boolean;
    isLinkingMode: boolean;
    chunkItNodeId: string | null;
    setActiveIconMenuId: (id: string | null) => void;
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
    selectedEdgeId: string | null;
    setSelectedEdgeId: (id: string | null) => void;
    selectedEdgeIds: Set<string>;
    setSelectedEdgeIds: (ids: Set<string>) => void;
    toggleCanvasEdgeSelection: (id: string) => void;
    setChunkItNodeId: (id: string | null) => void;
    /** Set when node creation was blocked by a guest limit (see nodeLimits.ts). */
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
    setAIRunning: (running: boolean) => void;
    /** Content types explicitly selected for the next create turn. Empty = AI chooses. */
    aiSelectedContexts: AIContextType[];
    toggleAIContext: (type: AIContextType) => void;
    clearAIContexts: () => void;
    /**
     * Canvas sources the user attached with `@` for the next turn.
     *
     * Holds only explicit attachments — cards, a canvas level, or a subtree.
     * A visual selection does not grant context access; attach it through
     * `@Selection` first. AIPanel clears this after each sent turn.
     */
    aiScope: AIScopeSource[];
    addAIScopeSource: (source: AIScopeSource) => void;
    removeAIScopeSource: (key: string) => void;
    clearAIScope: () => void;
    /** Mark a clarifying form answered or skipped, in place. */
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
    aiChats: AIChatSummary[];
    aiChatsLoading: boolean;
    refreshAIChats: () => Promise<void>;
    persistAIChat: () => Promise<void>;
    openAIChat: (id: string) => Promise<void>;
    duplicateAIChat: (id: string) => Promise<void>;
    regenerateAIChat: (id: string) => Promise<string | null>;
    deleteAIChat: (id: string) => Promise<void>;
}

export type AppState = NodeCoreSlice & NodeContentSlice & NodeBulkSlice & EdgeSlice & NestedCanvasSlice & LayoutSlice
    & NavigationSlice & StorageSlice & UISlice & AuthSlice & AISlice;
