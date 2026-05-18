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
import { MetadataPanel } from '../ui/MetadataPanel';
import { TableOfContentsPanel } from '../ui/TableOfContentsPanel';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { StorageControls } from '../ui/StorageControls';
import { SlidersHorizontal, ListCollapse } from 'lucide-react';
import { HomeButton } from '../ui/HomeButton';
import { HistoryControls } from '../ui/HistoryControls';
import { KanbanNodeComponent } from '../kanban/KanbanNode';
import { CanvasSlashMenu } from './CanvasSlashMenu';
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
        setInteractionState,
        setNodes,
        updateNodeData,
        syncParentContent,
        selectedCanvasNodeIds,
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
                    edgesFocusable={false}
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
                    deleteKeyCode={null}
                >
                    <CanvasSlashMenu />
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
            <Suspense fallback={null}>
                <KanbanConfigModal />
            </Suspense>
        </div>
    );
}
