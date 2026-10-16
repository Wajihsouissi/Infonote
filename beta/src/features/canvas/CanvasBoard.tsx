import { memo, useRef, useCallback, useMemo, useState } from 'react';
import {
    ReactFlow,
    Controls,
    SelectionMode,
    Background,
    BackgroundVariant,
    Panel,
    type Connection,
    type Edge,
} from '@xyflow/react';
import { NoteCard } from '../card/NoteCard';
import { BlockNode } from '../block/BlockNode';
import { FusedNoteNode } from '../card/FusedNoteNode';
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { SaveState } from '../ui/SaveState';
import { AIPanelMount } from '../ai/AIPanelMount';
import { BottomMenu } from '../ui/BottomMenu';
import { SidePanel } from '../ui/SidePanel';
import { FullscreenModal } from '../ui/FullscreenModal';
import { CenterModal } from '../ui/CenterModal';
import { TableOfContentsPanel } from '../ui/TableOfContentsPanel';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { KeyboardShortcutsPanel } from '../ui/KeyboardShortcutsPanel';
import { HistoryControls } from '../ui/HistoryControls';
import { ModifierKeyIndicator } from '../ui/ModifierKeyIndicator';
import { ListCollapse, Keyboard, Home, User } from '../../components/icons';
import { DuotoneIcon } from '../../components/ui/DuotoneIcon';
import { ChunkItPanel } from '../card/ChunkItPanel';
import { CanvasSlashMenu } from './CanvasSlashMenu';
import { DragChip } from './DragChip';
import { CanvasContextMenu } from './CanvasContextMenu';
import { BranchDeleteConfirmation } from './BranchDeleteConfirmation';
import { CenteredEdge } from './CenteredEdge';
import { CustomConnectionLine } from './CustomConnectionLine';
import { CanvasMiniMap } from './CanvasMiniMap';
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from './canvasConstants';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import type { AppNode } from '../../types';
import { useModifierKeys } from '../ui/hooks/useModifierKeys';
import { useCanvasViewport } from './hooks/useCanvasViewport';
import { useCanvasDrop } from './hooks/useCanvasDrop';
import { useCanvasNodeDrag } from './hooks/useCanvasNodeDrag';
import { useViewportStreaming } from './hooks/useViewportStreaming';
import { useEditableFocus } from './hooks/useEditableFocus';
import { usePointerPosition } from './hooks/usePointerPosition';
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard';
import { useFocusShortcut } from './hooks/useFocusShortcut';
import { useEnterCreatesBlock } from './hooks/useEnterCreatesBlock';
import { useCanvasClipboard } from './hooks/useCanvasClipboard';
import { useNestedCanvasMap } from './hooks/useNestedCanvasMap';
import { useCanvasNavigation } from './hooks/useCanvasNavigation';
import { useCanvasContextMenu } from './hooks/useCanvasContextMenu';
import { useOrganizationNotice } from './hooks/useOrganizationNotice';
import { useSelectionSync } from './hooks/useSelectionSync';
import { useRenderedGraph } from './hooks/useRenderedGraph';
import { useIsHoveringEditor } from './hooks/useIsHoveringEditor';
import styles from './CanvasBoard.module.css';

/* Everything on the canvas that is not the canvas. A drag re-renders this
   component every frame; none of these can look different because a card
   moved 4px, so they are memoised here, where that re-render originates.
   They still update from their own store subscriptions. */
const ThemeSwitcherM = memo(ThemeSwitcher);
const HistoryControlsM = memo(HistoryControls);
const BreadcrumbsM = memo(Breadcrumbs);
const ModifierKeyIndicatorM = memo(ModifierKeyIndicator);
const TableOfContentsPanelM = memo(TableOfContentsPanel);
const KeyboardShortcutsPanelM = memo(KeyboardShortcutsPanel);
const ChunkItPanelM = memo(ChunkItPanel);
const BottomMenuM = memo(BottomMenu);
const SidePanelM = memo(SidePanel);
const FullscreenModalM = memo(FullscreenModal);
const CenterModalM = memo(CenterModal);
const CanvasSlashMenuM = memo(CanvasSlashMenu);
const DragChipM = memo(DragChip);

const NODE_TYPES = { note: NoteCard, block: BlockNode, 'fused-note': FusedNoteNode };
// `default` too, so edges saved without a type still render centred.
const EDGE_TYPES = { centered: CenteredEdge, default: CenteredEdge };
const DEFAULT_EDGE_OPTIONS = { type: 'centered', focusable: true, selectable: true, deletable: true };
// No self-loops: a node cannot connect to itself.
const isValidConnection = (connection: Edge | Connection) => connection.source !== connection.target;
// Framing a saved board on load never magnifies it past 100%.
const FIT_ON_LOAD = { maxZoom: 1 };

export function CanvasBoard() {
    const edges = useStore(s => s.edges);
    const currentParentId = useStore(s => s.currentParentId);
    /* Frame the saved board on first paint, but only if there is one. With no
       nodes at mount, React Flow's fitView waits for the first ones instead,
       so on an empty canvas the first card created was zoomed to 200% in the
       middle of the task. Read once per canvas: the flow is keyed on it. */
    const fitOnLoad = useMemo(
        () => !currentParentId && useStore.getState().nodes.some((n) => !n.parentId),
        [currentParentId],
    );
    const theme = useStore(s => s.theme);
    const onNodesChange = useStore(s => s.onNodesChange);
    const onConnect = useStore(s => s.onConnect);
    const onReconnect = useStore(s => s.onReconnect);
    const setNodes = useStore(s => s.setNodes);
    const updateNodeData = useStore(s => s.updateNodeData);
    const setInteractionState = useStore(s => s.setInteractionState);
    const extractPageFromBlock = useStore(s => s.extractPageFromBlock);
    const syncParentContent = useStore(s => s.syncParentContent);
    const rightSidePanelId = useStore(s => s.rightSidePanelId);
    const leftSidePanelId = useStore(s => s.leftSidePanelId);
    const setRightSidePanelId = useStore(s => s.setRightSidePanelId);
    const setLeftSidePanelId = useStore(s => s.setLeftSidePanelId);
    const toggleCanvasNodeSelection = useStore(s => s.toggleCanvasNodeSelection);
    const setSelectedCanvasNodeIds = useStore(s => s.setSelectedCanvasNodeIds);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);
    const setSelectedEdgeId = useStore(s => s.setSelectedEdgeId);
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const isTOCOpen = useStore(s => s.isTOCOpen);
    const setView = useStore(s => s.setView);
    const isAuthenticated = useStore(s => s.auth.isAuthenticated);
    const setTOCOpen = useStore(s => s.setTOCOpen);
    const isShortcutsPanelOpen = useStore(s => s.isShortcutsPanelOpen);
    const setShortcutsPanelOpen = useStore(s => s.setShortcutsPanelOpen);
    // A card open in fullscreen or the centre peek covers the canvas.
    const isCanvasObscured = useStore(s => Boolean(s.fullscreenId || s.centerPanelId));
    const activeParentNode = useStore(s => getNodeById(s.nodes, currentParentId ?? undefined));

    const canvasAreaRef = useRef<HTMLDivElement | null>(null);
    const tocBtnRef = useRef<HTMLButtonElement | null>(null);
    const shortcutsBtnRef = useRef<HTMLButtonElement | null>(null);
    const [canvasAnnouncement, setCanvasAnnouncement] = useState('');

    const modifierKeys = useModifierKeys();
    const isHoveringEditor = useIsHoveringEditor();
    const pointerRef = usePointerPosition();
    const { isInEditableField, isInEditableFieldRef, blurActiveEditable } = useEditableFocus();
    const { isFocusArmed, justFocused, hoveredNodeRef, focusOnArmedClick, disarm } = useFocusShortcut(isInEditableFieldRef);
    const [contextMenu, setContextMenu] = useCanvasContextMenu();
    const organization = useOrganizationNotice();
    const selectionSync = useSelectionSync();

    const { visibleNodes, handleViewportChange, flushViewportChange } = useCanvasViewport({ currentParentId });
    const rendered = useRenderedGraph(visibleNodes, edges, currentParentId, isLinkingMode);
    const viewport = useViewportStreaming({
        canvasAreaRef,
        movingClassName: styles.viewportMoving,
        currentParentId,
        handleViewportChange,
        flushViewportChange,
    });

    useCanvasKeyboard({ isInEditableFieldRef, pointerRef });
    useEnterCreatesBlock(pointerRef);
    useCanvasClipboard(isInEditableFieldRef);
    useNestedCanvasMap({ currentParentId, activeParentNode, visibleNodes, canvasAreaRef, announce: setCanvasAnnouncement });
    useCanvasNavigation({ currentParentId, activeParentNode, visibleNodes, canvasAreaRef, isCanvasObscured, announce: setCanvasAnnouncement });

    const { onDragOver, onDrop } = useCanvasDrop({ updateNodeData, extractPageFromBlock });
    const { onNodeDragStart, onNodeDrag, onNodeDragStop } = useCanvasNodeDrag({
        currentParentId,
        setInteractionState,
        setNodes,
        updateNodeData,
        syncParentContent,
    });

    const handleNodeClick = useCallback((e: React.MouseEvent, node: AppNode) => {
        e.stopPropagation();
        setContextMenu(null);
        if (isLinkingMode) {
            // In linking mode, the clicked node becomes the one the others link to.
            const { linkSelectedNodes, selectedCanvasNodeIds, setIsLinkingMode } = useStore.getState();
            linkSelectedNodes(node.id, Array.from(selectedCanvasNodeIds));
            setIsLinkingMode(false);
            clearCanvasSelection();
            return;
        }
        focusOnArmedClick(node);
        if (e.shiftKey) toggleCanvasNodeSelection(node.id);
        else setSelectedCanvasNodeIds(new Set([node.id]));
    }, [clearCanvasSelection, focusOnArmedClick, isLinkingMode, setContextMenu, setSelectedCanvasNodeIds, toggleCanvasNodeSelection]);

    const handlePaneClick = useCallback(() => {
        if (isLinkingMode) return;
        setContextMenu(null);
        blurActiveEditable();
        disarm();
        clearCanvasSelection();
    }, [blurActiveEditable, clearCanvasSelection, disarm, isLinkingMode, setContextMenu]);

    const handleEdgeClick = useCallback((e: React.MouseEvent, edge: Edge) => {
        e.stopPropagation();
        if (e.shiftKey) useStore.getState().toggleCanvasEdgeSelection(edge.id);
        else setSelectedEdgeId(edge.id);
    }, [setSelectedEdgeId]);

    const handleEdgesDelete = useCallback((deleted: Edge[]) => {
        const { deleteEdge } = useStore.getState();
        deleted.forEach((edge) => deleteEdge(edge.id));
    }, []);

    // Stable handlers keep the memoised panels above from re-rendering.
    const closeTOC = useCallback(() => setTOCOpen(false), [setTOCOpen]);
    const closeShortcuts = useCallback(() => setShortcutsPanelOpen(false), [setShortcutsPanelOpen]);
    const closeRightPanel = useCallback(() => setRightSidePanelId(null), [setRightSidePanelId]);
    const closeLeftPanel = useCallback(() => setLeftSidePanelId(null), [setLeftSidePanelId]);
    const closeContextMenu = useCallback(() => setContextMenu(null), [setContextMenu]);
    const onMoveEnd = useCallback(() => viewport.onMoveEnd(), [viewport]);

    return (
        <div className={styles.container}>
            {/* Shell = top bar + framed canvas; the side panels below are its
                in-flow siblings and share the container's row. */}
            <div className={styles.shell}>
                <header className={styles.topBar} aria-label="Canvas workspace controls">
                    <div className={styles.topBarLeft}>
                        <div className={styles.navGroup} aria-label="Workspace navigation">
                            <HistoryControlsM />
                        </div>
                        <nav className={styles.crumbSlot} aria-label="Canvas location">
                            <BreadcrumbsM />
                        </nav>
                    </div>
                    <div className={styles.topBarRight}>
                        <SaveState />
                        <div className={styles.utilityGroup} aria-label="Canvas utilities">
                            <button
                                className={styles.toolbarBtn}
                                onClick={() => setView(isAuthenticated ? 'home' : 'marketing')}
                                data-tooltip={isAuthenticated ? 'Your dashboard' : 'Back to the home page'}
                                aria-label={isAuthenticated ? 'Your dashboard' : 'Back to the home page'}
                            >
                                <DuotoneIcon icon={Home} size={18} />
                            </button>
                            <button
                                className={styles.toolbarBtn}
                                onClick={() => setView('profile')}
                                data-tooltip={isAuthenticated ? 'Account and backup' : 'Backup and sign-in'}
                                aria-label={isAuthenticated ? 'Account and backup' : 'Backup and sign-in'}
                            >
                                <DuotoneIcon icon={User} size={18} />
                            </button>
                            <ThemeSwitcherM />
                            <button
                                ref={tocBtnRef}
                                className={`${styles.toolbarBtn} ${isTOCOpen ? styles.toolbarBtnActive : ''}`}
                                onClick={() => setTOCOpen(!isTOCOpen)}
                                data-tooltip={isTOCOpen ? 'Close Outline' : 'Open Outline'}
                                aria-label={isTOCOpen ? 'Close Outline' : 'Open Outline'}
                            >
                                <DuotoneIcon icon={ListCollapse} size={18} />
                            </button>
                            <button
                                ref={shortcutsBtnRef}
                                className={`${styles.toolbarBtn} ${isShortcutsPanelOpen ? styles.toolbarBtnActive : ''}`}
                                onClick={() => setShortcutsPanelOpen(!isShortcutsPanelOpen)}
                                data-tooltip={isShortcutsPanelOpen ? 'Close Shortcuts' : 'Keyboard Shortcuts (K)'}
                                aria-label={isShortcutsPanelOpen ? 'Close Keyboard Shortcuts' : 'Open Keyboard Shortcuts'}
                            >
                                <DuotoneIcon icon={Keyboard} size={18} />
                            </button>
                        </div>
                    </div>
                </header>

                <div className={styles.canvasFrame}>
                    <div
                        ref={canvasAreaRef}
                        className={styles.canvasArea}
                        role="region"
                        aria-label={currentParentId ? 'Nested canvas' : 'Home canvas'}
                        aria-describedby="canvas-keyboard-guidance"
                        tabIndex={-1}
                    >
                        <p id="canvas-keyboard-guidance" className={styles.canvasScreenReaderHelp}>
                            Use Tab to focus a card. Press Enter to enter a card's nested canvas, Alt plus Up Arrow to return, and Delete to review a card deletion.
                        </p>
                        <div className={styles.canvasAnnouncement} role="status" aria-live="polite" aria-atomic="true">
                            {canvasAnnouncement}
                        </div>
                        <ModifierKeyIndicatorM
                            showCtrl={modifierKeys.ctrl}
                            showShift={modifierKeys.shift}
                            showFocus={isFocusArmed}
                            showSuccess={justFocused}
                            suppress={isInEditableField}
                            top={20}
                        />
                        <div
                            key={currentParentId || 'root'}
                            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
                            /* A card open in fullscreen or the centre peek stays mounted
                               on the canvas underneath, with its own live editor. `inert`
                               takes the whole canvas out of focus and pointer reach
                               while it is covered (and blurs anything focused there),
                               so keystrokes can never land in the hidden copy. */
                            inert={isCanvasObscured || undefined}
                        >
                            <ReactFlow
                                className={isLinkingMode ? 'is-linking-mode' : ''}
                                nodes={rendered.nodes}
                                edges={rendered.edges}
                                onNodesChange={onNodesChange}
                                onConnect={onConnect}
                                onReconnect={onReconnect}
                                isValidConnection={isValidConnection}
                                nodeTypes={NODE_TYPES}
                                edgeTypes={EDGE_TYPES}
                                defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
                                connectionLineComponent={CustomConnectionLine}
                                connectionRadius={150}
                                onNodeMouseEnter={(_, node) => { hoveredNodeRef.current = node; }}
                                onNodeMouseLeave={() => { hoveredNodeRef.current = null; }}
                                onPaneClick={handlePaneClick}
                                onNodeClick={handleNodeClick}
                                onEdgeClick={handleEdgeClick}
                                fitView={fitOnLoad}
                                fitViewOptions={FIT_ON_LOAD}
                                colorMode={theme}
                                minZoom={MIN_CANVAS_ZOOM}
                                maxZoom={MAX_CANVAS_ZOOM}
                                snapToGrid={false}
                                onDragOver={onDragOver}
                                onDrop={onDrop}
                                onNodeDragStart={onNodeDragStart}
                                onNodeDrag={onNodeDrag}
                                onNodeDragStop={onNodeDragStop}
                                onMove={viewport.onMove}
                                onMoveStart={viewport.onMoveStart}
                                onMoveEnd={onMoveEnd}
                                onSelectionStart={selectionSync.onSelectionStart}
                                onSelectionEnd={selectionSync.onSelectionEnd}
                                onSelectionChange={selectionSync.onSelectionChange}
                                selectionOnDrag={true}
                                panOnDrag={true}
                                // React Flow's default no-pan class is `nodrag`, which also
                                // blocks node drags; the no-pan boundary must be distinct.
                                noPanClassName="nopan"
                                selectionKeyCode={isHoveringEditor ? null : 'Control'}
                                multiSelectionKeyCode="Shift"
                                selectionMode={SelectionMode.Partial}
                                // Unmount off-camera nodes; their data stays in the store.
                                onlyRenderVisibleElements
                                nodesDraggable={!isLinkingMode}
                                nodesConnectable={!isLinkingMode}
                                nodesFocusable={true}
                                edgesFocusable={!isLinkingMode}
                                elementsSelectable={!isLinkingMode}
                                selectNodesOnDrag={false}
                                // The wheel zooms. With scroll-panning on, React Flow gives it
                                // precedence and a trackpad scroll drifts the camera.
                                panOnScroll={false}
                                zoomOnScroll={true}
                                zoomOnPinch={true}
                                zoomOnDoubleClick={false}
                                // Must stay on: off, React Flow zooms only on a Ctrl+wheel.
                                // Scrollable note bodies opt out in their own onWheelCapture.
                                preventScrolling={true}
                                autoPanOnConnect={false}
                                autoPanOnNodeDrag={false}
                                connectOnClick={false}
                                nodeDragThreshold={0}
                                // Deletion goes through the branch warning (useCanvasNavigation).
                                deleteKeyCode={null}
                                onEdgesDelete={handleEdgesDelete}
                            >
                                <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--dot)" />
                                <CanvasSlashMenuM />
                                <DragChipM />
                                {organization.notice && (
                                    <Panel position="top-center" className={styles.organizationNoticePanel}>
                                        <div className={styles.organizationNotice}>
                                            <span role="status" aria-live="polite">
                                                {organization.notice.count} nodes organized
                                            </span>
                                            <button type="button" onClick={organization.undo}>Undo</button>
                                        </div>
                                    </Panel>
                                )}
                                <Panel position="bottom-right" className={styles.bottomRightControls}>
                                    {/* Minimap colours come from CSS (.react-flow__minimap-*),
                                        where `fill` resolves tokens, so it follows the theme. */}
                                    <CanvasMiniMap className={styles.canvasMiniMap} nodes={rendered.nodes} />
                                    <Controls className={styles.canvasControls} />
                                </Panel>
                            </ReactFlow>
                        </div>
                    </div>

                    {/* Inside the frame: the menu docks against the canvas's own
                        edges, so an open side panel narrows the box it centres in. */}
                    <BottomMenuM />
                </div>
            </div>

            <TableOfContentsPanelM isOpen={isTOCOpen} onClose={closeTOC} buttonRef={tocBtnRef} />
            <KeyboardShortcutsPanelM isOpen={isShortcutsPanelOpen} onClose={closeShortcuts} buttonRef={shortcutsBtnRef} />
            <ChunkItPanelM />

            {/* Only when both side panels are open. */}
            {rightSidePanelId && leftSidePanelId && <div className={styles.dualPanelBackdrop} />}

            {contextMenu && <CanvasContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu} />}
            <SidePanelM side="right" nodeId={rightSidePanelId} onClose={closeRightPanel} />
            <SidePanelM side="left" nodeId={leftSidePanelId} onClose={closeLeftPanel} />
            <FullscreenModalM onCanvasDragOver={onDragOver} onCanvasDrop={onDrop} />
            <CenterModalM onCanvasDragOver={onDragOver} onCanvasDrop={onDrop} />
            <BranchDeleteConfirmation />
            <AIPanelMount />
        </div>
    );
}
