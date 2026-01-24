import { useMemo, useEffect, Suspense, lazy, useRef } from 'react';
import {
    ReactFlow,
    Controls,
    MiniMap,
    SelectionMode,
} from '@xyflow/react';
import { NoteCard } from '../card/NoteCard';
import { BlockNode } from '../block/BlockNode';
import { FusedNoteNode } from '../card/FusedNoteNode';
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { CustomGrid } from './CustomGrid';
import { BottomMenu } from '../ui/BottomMenu';
import { SidePanel } from '../ui/SidePanel';
import { FullscreenModal } from '../ui/FullscreenModal';
import { CenterModal } from '../ui/CenterModal';
import { MetadataMenu } from '../ui/MetadataMenu';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { KanbanNodeComponent } from '../kanban/KanbanNode';
import { CanvasOverlay } from './CanvasOverlay';

// Hooks
import {
    useCanvasStoreSelectors,
    useCanvasViewport,
    useCanvasDrop,
    useCanvasNodeDrag,
    useCanvasBoxSelection,
} from './hooks';

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
        toggleCanvasNodeSelection,
        setSelectedCanvasNodeIds,
        clearCanvasSelection,
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
    });

    // Box selection handlers
    const {
        isCtrlPressed,
        nodesUnderSelection,
        selectionBoxStyle,
        onNodeClick,
        handlePaneClick,
        handleSelectionStart,
        handleSelectionMove,
        handleSelectionEnd,
    } = useCanvasBoxSelection({
        visibleNodes,
        selectedCanvasNodeIds,
        setSelectedCanvasNodeIds,
        clearCanvasSelection,
        toggleCanvasNodeSelection,
    });

    // Grid configuration
    const snapGrid: [number, number] = [56, 56];

    // Cleanup ref on unmount
    useEffect(() => {
        return () => {
            lastDragCheck.current = 0;
        };
    }, []);

    return (
        <div
            className={`${styles.container} ${isCtrlPressed ? styles.selectMode : ''}`}
            onMouseDown={handleSelectionStart}
            onMouseMove={handleSelectionMove}
            onMouseUp={handleSelectionEnd}
            onMouseLeave={handleSelectionEnd}
        >
            <div className={styles.canvasArea}>
                <ThemeSwitcher />
                <div style={{ position: 'absolute', top: 20, left: 30, zIndex: 100 }}>
                    <Breadcrumbs />
                </div>
                {activeParentNode && (
                    <MetadataMenu nodeId={activeParentNode.id} />
                )}

                {/* Selection overlay */}
                <CanvasOverlay
                    isCtrlPressed={isCtrlPressed}
                    selectionBoxStyle={selectionBoxStyle}
                    nodesUnderSelectionCount={nodesUnderSelection.size}
                />

                <ReactFlow
                    nodes={visibleNodes.map(node => ({
                        ...node,
                        className: nodesUnderSelection.has(node.id) ? 'box-selection-preview' : '',
                    }))}
                    edges={visibleEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView={!currentParentId}
                    colorMode={theme}
                    minZoom={0.05}
                    maxZoom={2}
                    snapToGrid={true}
                    snapGrid={snapGrid}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onNodeClick={onNodeClick}
                    onPaneClick={handlePaneClick}
                    onMove={handleViewportChange}
                    selectionOnDrag={false}
                    panOnDrag={!isCtrlPressed}
                    selectionMode={SelectionMode.Partial}
                    // Performance optimizations
                    nodesDraggable={true}
                    nodesConnectable={true}
                    nodesFocusable={true}
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
                    <CustomGrid />
                    <Controls className={styles.canvasControls} />
                    <MiniMap
                        position="bottom-right"
                        nodeColor="var(--color-primary)"
                        maskColor="var(--glass-bg)"
                        className={styles.canvasMiniMap}
                    />
                </ReactFlow>
            </div>

            <BottomMenu />
            <SidePanel />
            <FullscreenModal />
            <CenterModal />
            <Suspense fallback={null}>
                <KanbanConfigModal />
            </Suspense>
        </div>
    );
}
