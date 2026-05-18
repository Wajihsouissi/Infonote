import { useMemo, useEffect, Suspense, lazy, useRef, useCallback } from 'react';
import {
    ReactFlow,
    Controls,
    MiniMap,
    SelectionMode,
    useReactFlow,
    Panel,
} from '@xyflow/react';
import { NoteCard } from '../card/NoteCard';
import { BlockNode } from '../block/BlockNode';
import { FusedNoteNode } from '../card/FusedNoteNode';
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { BottomMenu } from '../ui/BottomMenu';
import { SidePanel } from '../ui/SidePanel';
import { FullscreenModal } from '../ui/FullscreenModal';
import { CenterModal } from '../ui/CenterModal';
import { MetadataPanel } from '../ui/MetadataPanel';
import { TableOfContentsPanel } from '../ui/TableOfContentsPanel';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { StorageControls } from '../ui/StorageControls';
import { SlidersHorizontal, ListCollapse } from 'lucide-react';
import { HomeButton } from '../ui/HomeButton';
import { HistoryControls } from '../ui/HistoryControls';
import { KanbanNodeComponent } from '../kanban/KanbanNode';
import { CanvasSlashMenu } from './CanvasSlashMenu';
import { CloudSyncControls } from './CloudSyncControls';
import { CenteredEdge } from './CenteredEdge';
import { CustomConnectionLine } from './CustomConnectionLine';
import { AuthModal } from '../auth/AuthModal';
import { useStore } from '../../store/useStore';
import { v4 as uuidv4 } from 'uuid';
import { isUrl } from '../editor/pasteUtils';

// Hooks
import {
    useCanvasStoreSelectors,
    useCanvasViewport,
    useCanvasDrop,
    useCanvasNodeDrag,
} from './hooks';
import { useRecentlyViewed } from '../landing/hooks/useDashboardData';

// Lazy load KanbanConfigModal
const KanbanConfigModal = lazy(() =>
    import('../kanban/KanbanConfigModal').then(module => ({ default: module.KanbanConfigModal }))
);

import styles from "./CanvasBoard.module.css";

// Debug flag
const DEBUG = import.meta.env.DEV;

export function CanvasBoard() {
    // Store selectors and actions
    const {
        nodes,
        edges,
        currentParentId,
        selectedCanvasNodeIds,
        theme,
        onNodesChange,
        onEdgesChange,
        onConnect,
        setNodes,
        updateNodeData,
        setInteractionState,
        extractPageFromBlock,
        syncParentContent,
        rightSidePanelId,
        leftSidePanelId,
        setRightSidePanelId,
        setLeftSidePanelId,
        setSelectedCanvasNodeIds,
    } = useCanvasStoreSelectors();

    // Throttling Ref for drag cleanup
    const lastDragCheck = useRef(0);

    // Metadata Panel UI State
    const isMetadataOpen = useStore(s => s.isMetadataOpen);
    const setMetadataOpen = useStore(s => s.setMetadataOpen);
    const metadataBtnRef = useRef<HTMLButtonElement | null>(null);

    // TOC Panel UI State
    const isTOCOpen = useStore(s => s.isTOCOpen);
    const setTOCOpen = useStore(s => s.setTOCOpen);
    const tocBtnRef = useRef<HTMLButtonElement | null>(null);
    const setSelectedEdgeId = useStore(s => s.setSelectedEdgeId);

    // Viewport culling and visible nodes
    const { visibleNodes, handleViewportChange } = useCanvasViewport({
        nodes,
        currentParentId,
    });

    // Debug logging for visible nodes
    useEffect(() => {
        if (currentParentId && DEBUG) {
            console.log("CanvasBoard Visible Nodes:", visibleNodes.map(n => ({
                id: n.id,
                type: n.type,
                parentId: n.parentId,
                realParentId: nodes.find(og => og.id === n.id)?.parentId,
                pos: n.position
            })));
        }
    }, [currentParentId, visibleNodes, nodes]);

    const addNode = useStore(s => s.addNode);

    // Focus viewport when parent changes
    const { fitView, screenToFlowPosition } = useReactFlow();

    // Track mouse coordinates on window
    const mousePosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    // Create Text Block on pressing Enter on canvas
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Enter') return;

            const target = e.target as HTMLElement;
            const isEditable = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                target.closest('[contenteditable]') ||
                target.closest('[class*="BlockEditor"]') ||
                target.closest('[class*="editor"]');

            if (isEditable) return;

            // Prevent creation if typing in active overlays/modals
            const isModal = target.closest('[class*="modal"]') || target.closest('[class*="Modal"]');
            if (isModal) return;

            e.preventDefault();

            // Transform coordinates to canvas space
            const flowPos = screenToFlowPosition({
                x: mousePosRef.current.x,
                y: mousePosRef.current.y
            });

            // Create new Text Block
            const nodeId = uuidv4();
            const newBlock = {
                id: uuidv4(),
                type: 'text' as const,
                content: ''
            };

            addNode(
                'block',
                flowPos,
                { content: [newBlock], isStandaloneBlock: true },
                { width: 300, height: 100 },
                currentParentId || undefined,
                nodeId
            );

            // Automatically highlight and select the newly created text block node
            setSelectedCanvasNodeIds(new Set([nodeId]));
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [addNode, currentParentId, screenToFlowPosition, setSelectedCanvasNodeIds]);

    // Canvas-Level Direct URL Pasting
    const handleCanvasPaste = (e: React.ClipboardEvent) => {
        // Intercept paste only when not typing inside text inputs, textareas, contenteditables or code blocks
        const target = e.target as HTMLElement;
        const isEditable = target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            target.closest('[contenteditable]') ||
            target.closest('[class*="BlockEditor"]') ||
            target.closest('[class*="editor"]');

        if (isEditable) return;

        const text = e.clipboardData.getData('text/plain')?.trim();
        if (!text) return;

        // If the pasted text is a single URL
        if (isUrl(text)) {
            e.preventDefault();
            const flowPos = screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            });

            const newBlock = {
                id: uuidv4(),
                type: 'link' as const,
                content: text.startsWith('http') ? text : 'https://' + text,
                metadata: {
                    displayMode: 'bookmark',
                    isLoading: true
                }
            };

            addNode('block', flowPos, { 
                content: [newBlock], 
                isStandaloneBlock: true 
            }, { width: 320, height: 120 }, currentParentId || undefined);
            return;
        }

        // If pasting multiple URLs (one per line)
        if (text.includes('\n')) {
            const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
            const allUrls = lines.every(l => isUrl(l));
            if (allUrls) {
                e.preventDefault();
                lines.forEach((line, index) => {
                    const flowPos = screenToFlowPosition({
                        x: window.innerWidth / 2 + index * 40,
                        y: window.innerHeight / 2 + index * 40
                    });

                    const newBlock = {
                        id: uuidv4(),
                        type: 'link' as const,
                        content: line.startsWith('http') ? line : 'https://' + line,
                        metadata: {
                            displayMode: 'bookmark',
                            isLoading: true
                        }
                    };

                    addNode('block', flowPos, { 
                        content: [newBlock], 
                        isStandaloneBlock: true 
                    }, { width: 320, height: 120 }, currentParentId || undefined);
                });
            }
        }
    };

    useEffect(() => {
        if (visibleNodes.length > 0) {
            // Wait a frame for ReactFlow to finish rendering nodes
            const timer = setTimeout(() => {
                fitView({ duration: 400, padding: 0.2, minZoom: 0.5, maxZoom: 1 });
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [currentParentId, fitView, visibleNodes.length]);

    // Visible edges:
    //  1. Endpoints must be in the visible (current parent context) node set.
    //  2. Edge.data.parentId must match the active currentParentId so connections
    //     made inside a drilled-down canvas don't bleed into the root view.
    const visibleEdges = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
        const activeParent = currentParentId ?? null;
        return edges.filter(e => {
            if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)) return false;
            const edgeParent = (e.data as { parentId?: string | null } | undefined)?.parentId ?? null;
            return edgeParent === activeParent;
        });
    }, [edges, visibleNodes, currentParentId]);

    // Node types registration
    const nodeTypes = useMemo(() => ({
        note: NoteCard,
        block: BlockNode,
        'fused-note': FusedNoteNode,
        kanban: KanbanNodeComponent
    }), []);

    // Custom edge types — register both `centered` and `default` so legacy or
    // imported edges that omit a `type` field still render with center anchoring.
    const edgeTypes = useMemo(() => ({
        centered: CenteredEdge,
        default: CenteredEdge,
    }), []);

    // Default edge options: every new connection uses our centered renderer
    // and is fully selectable/deletable.
    const defaultEdgeOptions = useMemo(() => ({
        type: 'centered',
        focusable: true,
        selectable: true,
        deletable: true,
    }), []);

    // Prevent self-loop connections (a node cannot connect to itself)
    const isValidConnection = useCallback((connection: any) => {
        return connection.source !== connection.target;
    }, []);

    // Active parent node for metadata display
    const activeParentNode = useMemo(() =>
        currentParentId ? nodes.find(n => n.id === currentParentId) : null,
        [nodes, currentParentId]
    );

    // Recently viewed tracking
    const activeWorkspaceId = typeof window !== 'undefined' 
        ? localStorage.getItem('infonote.activeWorkspaceId') || '' 
        : '';
    const { trackNoteView } = useRecentlyViewed(activeWorkspaceId);

    useEffect(() => {
        if (currentParentId && activeParentNode && activeWorkspaceId) {
            const data = activeParentNode.data as Record<string, any>;
            trackNoteView(
                activeParentNode.id, 
                (data?.title as string) || 'Untitled', 
                activeParentNode.type || 'unknown', 
                activeWorkspaceId
            );
        }
    }, [currentParentId, activeParentNode, activeWorkspaceId, trackNoteView]);

    // Drop handlers
    const { onDragOver, onDrop } = useCanvasDrop({
        updateNodeData,
        setNodes,
        extractPageFromBlock,
    });

    // Node drag handlers
    const { onNodeDragStart, onNodeDrag, onNodeDragStop } = useCanvasNodeDrag({
        nodes,
        currentParentId,
        setInteractionState,
        setNodes,
        updateNodeData,
        syncParentContent,
        selectedCanvasNodeIds,
    });


    // Cleanup ref on unmount
    useEffect(() => {
        return () => {
            lastDragCheck.current = 0;
        };
    }, []);

    return (
        <div className={styles.container} onPaste={handleCanvasPaste}>
            <div className={styles.canvasArea}>
                <div className={styles.topRightToolbar}>
                    <StorageControls />
                    <div className={styles.topRightSeparator} />
                    <ThemeSwitcher />
                    <button
                        ref={tocBtnRef}
                        className={`${styles.toolbarBtn} ${isTOCOpen ? styles.toolbarBtnActive : ''}`}
                        onClick={() => setTOCOpen(!isTOCOpen)}
                        title={isTOCOpen ? "Close Outline" : "Open Outline"}
                        style={{ marginLeft: 6 }}
                    >
                        <ListCollapse size={18} />
                    </button>
                    {activeParentNode && (
                        <button
                            ref={metadataBtnRef}
                            className={`${styles.toolbarBtn} ${isMetadataOpen ? styles.toolbarBtnActive : ''}`}
                            onClick={() => setMetadataOpen(!isMetadataOpen)}
                            title={isMetadataOpen ? "Close Metadata" : "Open Metadata"}
                            style={{ marginLeft: 6 }}
                        >
                            <SlidersHorizontal size={18} />
                        </button>
                    )}
                </div>
                <div className={styles.topLeftToolbar}>
                    <HomeButton />
                    <HistoryControls />
                    <Breadcrumbs />
                </div>


                <ReactFlow
                    nodes={visibleNodes}
                    edges={visibleEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    isValidConnection={isValidConnection}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={defaultEdgeOptions}
                    connectionLineComponent={CustomConnectionLine}
                    connectionRadius={150}
                    onPaneClick={() => {
                        setSelectedEdgeId(null);
                    }}
                    onEdgeClick={(e, edge) => {
                        e.stopPropagation();
                        if (e.shiftKey) {
                            useStore.getState().toggleCanvasEdgeSelection(edge.id);
                        } else {
                            setSelectedEdgeId(edge.id);
                        }
                    }}
                    fitView={!currentParentId}
                    colorMode={theme}
                    minZoom={0.05}
                    maxZoom={2}
                    snapToGrid={false}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onMove={handleViewportChange}
                    onSelectionChange={({ nodes: selectedNodes }) => {
                        const newIds = selectedNodes.map(n => n.id);
                        const isSame = newIds.length === selectedCanvasNodeIds.size && newIds.every(id => selectedCanvasNodeIds.has(id));
                        if (!isSame) {
                            setSelectedCanvasNodeIds(new Set(newIds));
                        }
                    }}
                    selectionOnDrag={false}
                    panOnDrag={true}
                    selectionKeyCode="Control"
                    multiSelectionKeyCode="Shift"
                    selectionMode={SelectionMode.Partial}
                    // Performance optimizations
                    nodesDraggable={true}
                    nodesConnectable={true}
                    nodesFocusable={false}
                    edgesFocusable={true}
                    elementsSelectable={true}
                    selectNodesOnDrag={true}
                    panOnScroll={true}
                    zoomOnScroll={true}
                    zoomOnPinch={true}
                    zoomOnDoubleClick={false}
                    preventScrolling={false}
                    autoPanOnConnect={false}
                    autoPanOnNodeDrag={false}
                    connectOnClick={false}
                    deleteKeyCode={['Delete', 'Backspace']}
                >
                    <CanvasSlashMenu />
                    <Panel position="top-center">
                        <CloudSyncControls />
                    </Panel>
                    <Panel position="bottom-right" className={styles.bottomRightControls}>
                        <MiniMap
                            nodeColor="var(--color-primary)"
                            maskColor="var(--glass-bg)"
                            className={styles.canvasMiniMap}
                            style={{ width: 160, height: 116 }}
                        />
                        <Controls className={styles.canvasControls} />
                    </Panel>
                </ReactFlow>
            </div>

            <MetadataPanel
                nodeId={activeParentNode?.id}
                isOpen={isMetadataOpen}
                onClose={() => setMetadataOpen(false)}
                buttonRef={metadataBtnRef}
            />

            <TableOfContentsPanel
                isOpen={isTOCOpen}
                onClose={() => setTOCOpen(false)}
                buttonRef={tocBtnRef}
            />

            {/* Dual Panel Backdrop (only when both sides are open) */}
            {rightSidePanelId && leftSidePanelId && (
                <div className={styles.dualPanelBackdrop} />
            )}

            <BottomMenu />
            <SidePanel
                side="right"
                nodeId={rightSidePanelId}
                onClose={() => setRightSidePanelId(null)}
            />
            <SidePanel
                side="left"
                nodeId={leftSidePanelId}
                onClose={() => setLeftSidePanelId(null)}
            />
            <FullscreenModal />
            <CenterModal />
            <AuthModal />
            <Suspense fallback={null}>
                <KanbanConfigModal />
            </Suspense>
        </div>
    );
}
