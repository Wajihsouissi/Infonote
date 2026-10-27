import { memo, useMemo, useRef, useCallback, useState } from 'react';
import {
    ReactFlow,
    SelectionMode,
    Background,
    BackgroundVariant,
    Panel,
    type Connection,
    type Edge,
} from '@xyflow/react';
import { CanvasNoteNode, CanvasBlockNode, CanvasFusedNode } from '../nodes/CanvasNodeRenderer';
import { Breadcrumbs } from '../../../app/shell/navigation/breadcrumbs/Breadcrumbs';
import { SaveState } from '../../../app/shell/feedback/save-state/SaveState';
import { AIPanelMount } from '../../ai/ui/panel/AIPanelMount';
import { BottomMenu } from '../../../app/shell/navigation/menus/BottomMenu';
import { SidePanel } from '../../../app/shell/panels/containers/SidePanel';
import { FullscreenModal } from '../../../app/shell/panels/fullscreen/FullscreenModal';
import { CenterModal } from '../../../app/shell/panels/containers/CenterModal';
import { TableOfContentsPanel } from '../../../app/shell/panels/outline/TableOfContentsPanel';
import { ThemeSwitcher } from '../../../app/shell/preferences/theme/ThemeSwitcher';
import { KeyboardShortcutsPanel } from '../../../app/shell/preferences/keyboard/KeyboardShortcutsPanel';
import { HistoryControls } from '../../../app/shell/toolbars/history/HistoryControls';
import { ModifierKeyIndicator } from '../../../app/shell/input/modifiers/ModifierKeyIndicator';
import { ListCollapse, Keyboard, Home, User } from '../../../shared/icons';
import { DuotoneIcon } from '../../../shared/ui/graphics/DuotoneIcon';
import { ChunkItPanel } from '../../card/ui/chunking/ChunkItPanel';
import { CanvasSlashMenu } from '../ui/menus/slash/CanvasSlashMenu';
import { CanvasContextMenu } from '../ui/menus/context/CanvasContextMenu';
import { BranchDeleteConfirmation } from '../ui/dialogs/branch-delete/BranchDeleteConfirmation';
import { CenteredEdge } from '../edges/CenteredEdge';
import { CustomConnectionLine } from '../edges/CustomConnectionLine';
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from '../canvasConstants';
import { useStore } from '../../../store/useStore';
import { getNodeById } from '../../../store/nodeIndex';
import type { AppNode } from '../../../types';
import { useModifierKeys } from '../../../app/shell/input/modifiers/useModifierKeys';
import { useCanvasViewport } from '../hooks/viewport/useCanvasViewport';
import { useCanvasDrop } from '../hooks/interaction/useCanvasDrop';
import { useCanvasNodeDrag } from '../hooks/interaction/useCanvasNodeDrag';
import { useViewportStreaming } from '../hooks/viewport/useViewportStreaming';
import { useEditableFocus } from '../hooks/editing/useEditableFocus';
import { usePointerPosition } from '../hooks/interaction/usePointerPosition';
import { useCanvasKeyboard } from '../hooks/interaction/useCanvasKeyboard';
import { useFocusShortcut } from '../hooks/interaction/useFocusShortcut';
import { useEnterCreatesBlock } from '../hooks/interaction/useEnterCreatesBlock';
import { useCanvasClipboard } from '../hooks/interaction/useCanvasClipboard';
import { useNestedCanvasMap } from '../hooks/navigation/useNestedCanvasMap';
import { useCanvasNavigation } from '../hooks/navigation/useCanvasNavigation';
import { useCanvasContextMenu } from '../hooks/interaction/useCanvasContextMenu';
import { useOrganizationNotice } from '../hooks/navigation/useOrganizationNotice';
import { useSelectionSync } from '../hooks/interaction/useSelectionSync';
import { useRenderedGraph } from '../hooks/viewport/useRenderedGraph';
import { useIsHoveringEditor } from '../hooks/editing/useIsHoveringEditor';
import styles from './CanvasBoard.module.css';
import { canvasEntryViewport } from './entryViewport';

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

const NODE_TYPES = { note: CanvasNoteNode, block: CanvasBlockNode, 'fused-note': CanvasFusedNode };
// `default` too, so edges saved without a type still render centred.
const EDGE_TYPES = { centered: CenteredEdge, default: CenteredEdge };
const DEFAULT_EDGE_OPTIONS = { type: 'centered', focusable: true, selectable: true, deletable: true };
// No self-loops: a node cannot connect to itself.
const isValidConnection = (connection: Edge | Connection) => connection.source !== connection.target;

export function CanvasBoard() {
    const edges = useStore(s => s.edges);
    const currentParentId = useStore(s => s.currentParentId);
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
    const isCanvasCovered = useStore(s => Boolean(s.fullscreenId));
    const activeParentNode = useStore(s => getNodeById(s.nodes, currentParentId ?? undefined));
    const entryViewport = useMemo(() => canvasEntryViewport(useStore.getState().nodes, currentParentId,
        window.innerWidth, window.innerHeight), [currentParentId]);

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
    const clipboard = useCanvasClipboard(isInEditableFieldRef);
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
                                aria-expanded={isShortcutsPanelOpen}
                                aria-controls="keyboard-shortcuts-panel"
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
                            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0,
                                contentVisibility: isCanvasCovered ? 'hidden' : undefined }}
                            /* A card open in fullscreen or the centre peek stays mounted
                               on the canvas underneath, with its own live editor. `inert`
                               takes the whole canvas out of focus and pointer reach
                               while it is covered (and blurs anything focused there),
                               so keystrokes can never land in the hidden copy. */
                            inert={isCanvasObscured || undefined}
                        >
                            <ReactFlow
                                defaultViewport={entryViewport}
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
                                // Wheel and trackpad scrolling move the canvas; pinch still zooms.
                                panOnScroll={true}
                                zoomOnScroll={false}
                                zoomOnPinch={true}
                                zoomOnDoubleClick={false}
                                // Keep wheel gestures inside this canvas rather than scrolling the page.
                                // Scrollable note bodies opt out in their own onWheelCapture.
                                preventScrolling={true}
                                autoPanOnConnect={false}
                                autoPanOnNodeDrag={false}
                                connectOnClick={false}
                                nodeDragThreshold={3}
                                // Deletion goes through the branch warning (useCanvasNavigation).
                                deleteKeyCode={null}
                                onEdgesDelete={handleEdgesDelete}
                            >
                                <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--dot)" />
                                <Panel position="top-left" className={styles.breadcrumbPanel}>
                                    <nav className={`${styles.crumbSlot} nodrag nopan nowheel`} aria-label="Canvas location">
                                        <BreadcrumbsM />
                                    </nav>
                                </Panel>
                                <CanvasSlashMenuM />
                                {(organization.notice || clipboard.clipboardNotice) && (
                                    <Panel position="top-center" className={styles.organizationNoticePanel}>
                                        <div className={styles.organizationNotice} data-app-menu="canvas-notice">
                                            <span role="status" aria-live="polite">
                                                {clipboard.clipboardNotice
                                                    ? 'Pasted the last selection copied in this app.'
                                                    : `${organization.notice!.count} nodes organized`}
                                            </span>
                                            <button type="button" onClick={clipboard.clipboardNotice ? clipboard.dismissClipboardNotice : organization.undo}>
                                                {clipboard.clipboardNotice ? 'Dismiss' : 'Undo'}
                                            </button>
                                        </div>
                                    </Panel>
                                )}
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
