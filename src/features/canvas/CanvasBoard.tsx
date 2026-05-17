import { useMemo, useEffect, Suspense, lazy, useRef } from 'react';
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
import { MetadataMenu } from '../ui/MetadataMenu';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { HomeButton } from '../ui/HomeButton';
import { HistoryControls } from '../ui/HistoryControls';
import { KanbanNodeComponent } from '../kanban/KanbanNode';
import { CanvasSlashMenu } from './CanvasSlashMenu';
import { CloudSyncControls } from './CloudSyncControls';
import { AuthButton } from '../auth/AuthButton';
import { AuthModal } from '../auth/AuthModal';

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
        interactionState,
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

    // Focus viewport when parent changes
    const { fitView } = useReactFlow();
    useEffect(() => {
        if (visibleNodes.length > 0) {
            // Wait a frame for ReactFlow to finish rendering nodes
            const timer = setTimeout(() => {
                fitView({ duration: 400, padding: 0.2, minZoom: 0.5, maxZoom: 1 });
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [currentParentId, fitView, visibleNodes.length]);

    // Visible edges (filtered to visible nodes)
    const visibleEdges = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
        return edges.filter(e =>
            visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
        );
    }, [edges, visibleNodes]);

    // Node types registration
    const nodeTypes = useMemo(() => ({
        note: NoteCard,
        block: BlockNode,
        'fused-note': FusedNoteNode,
        kanban: KanbanNodeComponent
    }), []);

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
        interactionState,
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
        <div className={styles.container}>
            <div className={styles.canvasArea}>
                <ThemeSwitcher />
                <AuthButton />
                <div className={styles.topLeftToolbar}>
                    <HomeButton />
                    <HistoryControls />
                    <Breadcrumbs />
                </div>
                {activeParentNode && (
                    <MetadataMenu nodeId={activeParentNode.id} />
                )}


                <ReactFlow
                    nodes={visibleNodes}
                    edges={visibleEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
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
                    multiSelectionKeyCode="Control"
                    selectionMode={SelectionMode.Partial}
                    // Performance optimizations
                    nodesDraggable={true}
                    nodesConnectable={true}
                    nodesFocusable={false}
                    edgesFocusable={false}
                    elementsSelectable={true}
                    selectNodesOnDrag={false}
                    panOnScroll={true}
                    zoomOnScroll={true}
                    zoomOnPinch={true}
                    zoomOnDoubleClick={false}
                    preventScrolling={false}
                    autoPanOnConnect={false}
                    autoPanOnNodeDrag={false}
                    connectOnClick={false}
                    deleteKeyCode={null}
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
