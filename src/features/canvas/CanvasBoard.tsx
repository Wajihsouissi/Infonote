import { memo, useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { FEATURES } from '../../config/featureFlags';
import {
    ReactFlow,
    Controls,
    SelectionMode,
    Background,
    BackgroundVariant,
    useReactFlow,
    Panel,
    type NodeChange,
    type Connection,
    type Edge,
} from '@xyflow/react';
import { NoteCard } from '../card/NoteCard';
import { BlockNode } from '../block/BlockNode';
import { FusedNoteNode } from '../card/FusedNoteNode';
import { KanbanNodeComponent } from '../kanban/KanbanNode';
import {
    YouTubeNode,
    createYouTubeStudyData,
    OPEN_YOUTUBE_STUDY_EVENT,
    parseYouTubeUrl,
    type OpenYouTubeStudyDetail,
} from '../youtube';
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { BottomMenu } from '../ui/BottomMenu';
import { SidePanel } from '../ui/SidePanel';
import { FullscreenModal } from '../ui/FullscreenModal';
import { CenterModal } from '../ui/CenterModal';
import { CardTasksModal } from '../card/tasks/CardTasksModal';
import { MetadataPanel } from '../ui/MetadataPanel';
import { TableOfContentsPanel } from '../ui/TableOfContentsPanel';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { StorageControls } from '../ui/StorageControls';
import { KeyboardShortcutsPanel } from '../ui/KeyboardShortcutsPanel';
import { AIPanel } from '../ai/AIPanel';
import { SlidersHorizontal, ListCollapse, Keyboard, Plus } from '../../components/icons';
import { DuotoneIcon } from '../../components/ui/DuotoneIcon';
import { HomeButton } from '../ui/HomeButton';
import { HistoryControls } from '../ui/HistoryControls';
import { ModifierKeyIndicator } from '../ui/ModifierKeyIndicator';

import { CanvasSlashMenu } from './CanvasSlashMenu';
import { DragChip } from './DragChip';
import { CanvasContextMenu } from './CanvasContextMenu';
import { BranchDeleteConfirmation } from './BranchDeleteConfirmation';

import { CenteredEdge } from './CenteredEdge';
import { CustomConnectionLine } from './CustomConnectionLine';
import { CanvasMiniMap } from './CanvasMiniMap';
import { ChunkItPanel } from '../card/ChunkItPanel';
import { AuthModal } from '../auth/AuthModal';
import { useStore } from '../../store/useStore';
import type { AppNode } from '../../types';
import type { Block } from '../editor/types';
import { getNodeBlocks, getNodeLabel } from '../../types';
import {
    blocksToHtml,
    blocksToPlainText,
    decodePayload,
    encodePayload,
    type NodesPayload,
} from '../clipboard/clipboardPayload';
import { v4 as uuidv4 } from 'uuid';
import { parseFiles, parseTextOrHtml } from '../editor/pasteUtils';
import { endBlockDrag } from '../editor/blockDragLock';
import { loadCanvasFromCloud, type CloudLoadProgress } from '../../services/cloudSync';
import {
    forgetWorkspace,
    hasHydrated,
    loadWorkspaceOnce,
    unsubscribeWorkspaceProgress,
} from './workspaceHydration';
import { WorkspaceLoadOverlay, WorkspaceSyncPill } from './WorkspaceLoadOverlay';
import { useDelayedFlag } from './useDelayedFlag';
import { isSupabaseConfigured, supabase } from '../../services/supabase/client';
import { isCanvasHydratableBlock } from '../../store/contentHydration';

// Hooks
import { isStreaming, setStreaming } from './hooks/lodStore';
import {
    useCanvasStoreSelectors,
    useCanvasViewport,
    useCanvasDrop,
    useCanvasNodeDrag,
} from './hooks';
import { useRecentlyViewed } from '../landing/hooks/useDashboardData';
import { useModifierKeys } from '../ui/hooks/useModifierKeys';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { LiveCursors } from './LiveCursors';


import styles from "./CanvasBoard.module.css";

// Debug flag
const DEBUG = import.meta.env.DEV;


/* Everything on the canvas that is not the canvas.
 *
 * A drag rewrites this component's node state on every frame, so every one of
 * these re-rendered on every frame too — the bottom menu, both side panels,
 * every modal — none of which can look any different because a card moved 4px.
 * Memoised at the call site rather than at each definition: the components stay
 * ordinary, and the rule that they do not depend on node positions is stated
 * once, here, where the re-render actually originates. They still update
 * normally from their own store subscriptions.
 */
const StorageControlsM = memo(StorageControls);
const ThemeSwitcherM = memo(ThemeSwitcher);
const HomeButtonM = memo(HomeButton);
const HistoryControlsM = memo(HistoryControls);
const BreadcrumbsM = memo(Breadcrumbs);
const ModifierKeyIndicatorM = memo(ModifierKeyIndicator);
const MetadataPanelM = memo(MetadataPanel);
const TableOfContentsPanelM = memo(TableOfContentsPanel);
const KeyboardShortcutsPanelM = memo(KeyboardShortcutsPanel);
const AIPanelM = memo(AIPanel);
const ChunkItPanelM = memo(ChunkItPanel);
const BottomMenuM = memo(BottomMenu);
const SidePanelM = memo(SidePanel);
const FullscreenModalM = memo(FullscreenModal);
const CenterModalM = memo(CenterModal);
const AuthModalM = memo(AuthModal);
const CanvasSlashMenuM = memo(CanvasSlashMenu);
const DragChipM = memo(DragChip);

// Trackpad and wheel zooms arrive as many tiny, separate React Flow gestures.
// Keeping the canvas in its inexpensive movement state across that small gap
// prevents an editor-detail promotion between two consecutive wheel ticks.
const VIEWPORT_SETTLE_MS = 130;
const MIN_CANVAS_ZOOM = 0.3;
const PROGRAMMATIC_SELECTION_GUARD_MS = 250;

const isDirectViewportGesture = (event?: MouseEvent | TouchEvent | null) => event instanceof WheelEvent
    || event instanceof TouchEvent
    || (event instanceof MouseEvent && event.buttons !== 0);

const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
        || Boolean(target.closest('[contenteditable], [data-chnk-it-block-editor], [class*="BlockEditor"], [class*="editor"]'));
};

export function CanvasBoard() {
    // Store selectors and actions
    const {
        edges,
        currentParentId,
        theme,
        onNodesChange,
        onConnect,
        onReconnect,
        setNodes,
        updateNodeData,
        setInteractionState,
        extractPageFromBlock,
        syncParentContent,
        rightSidePanelId,
        leftSidePanelId,
        setRightSidePanelId,
        setLeftSidePanelId,
        toggleCanvasNodeSelection,
        setSelectedCanvasNodeIds,
        clearCanvasSelection,
        setLastCreatedCanvasNodeId,
    } = useCanvasStoreSelectors();

    const canvasAreaRef = useRef<HTMLDivElement | null>(null);
    const requestNodeDeletion = useStore(s => s.requestNodeDeletion);
    const navigateToNode = useStore(s => s.navigateToNode);

    /* True while a card-level modal is covering the canvas. */
    const isCanvasObscured = useStore(useCallback(
        s => Boolean(s.fullscreenId || s.centerPanelId),
        []
    ));

    // Throttling Ref for drag cleanup
    const lastDragCheck = useRef(0);

    // Metadata Panel UI State
    const isMetadataOpen = useStore(s => s.isMetadataOpen);
    const setMetadataOpen = useStore(s => s.setMetadataOpen);
    const metadataBtnRef = useRef<HTMLButtonElement | null>(null);

    // Linking Mode
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const setIsLinkingMode = useStore(s => s.setIsLinkingMode);
    const linkSelectedNodes = useStore(s => s.linkSelectedNodes);
    const bulkDuplicateNodes = useStore(s => s.bulkDuplicateNodes);
    const pasteClipboardNodes = useStore(s => s.pasteClipboardNodes);

    // TOC Panel UI State
    const isTOCOpen = useStore(s => s.isTOCOpen);
    const setTOCOpen = useStore(s => s.setTOCOpen);
    const tocBtnRef = useRef<HTMLButtonElement | null>(null);

    // Shortcuts Panel UI State
    const isShortcutsPanelOpen = useStore(s => s.isShortcutsPanelOpen);
    const setShortcutsPanelOpen = useStore(s => s.setShortcutsPanelOpen);
    const shortcutsBtnRef = useRef<HTMLButtonElement | null>(null);
    const setSelectedEdgeId = useStore(s => s.setSelectedEdgeId);
    const isBoxSelectingRef = useRef(false);
    // Guard ref: ReactFlow fires onSelectionChange asynchronously after receiving
    // new processedNodes. We use a timestamp to prevent ReactFlow from reverting
    // our selection immediately after we set it programmatically.
    const lastProgrammaticSelectionTimeRef = useRef(0);
    const modifierKeys = useModifierKeys();
    const [isInEditableField, setIsInEditableField] = useState(false);
    /* Mirrored into a ref so the clipboard listeners — which are registered once
       and must not re-subscribe on every keystroke — can read the latest value. */
    const isInEditableFieldRef = useRef(false);
    useEffect(() => {
        isInEditableFieldRef.current = isInEditableField;
    }, [isInEditableField]);
    const [isHoveringEditor, setIsHoveringEditor] = useState(false);
    const [isFocusArmed, setIsFocusArmed] = useState(false);

    useEffect(() => {
        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target) {
                const isEditor = !!target.closest('[data-chnk-it-block-editor]');
                setIsHoveringEditor(prev => prev !== isEditor ? isEditor : prev);
            }
        };
        window.addEventListener('mouseover', handleMouseOver);
        return () => window.removeEventListener('mouseover', handleMouseOver);
    }, []);
    const isFocusArmedRef = useRef(false);
    const focusArmTimeoutRef = useRef<number | null>(null);
    
    // Key focus improvements: track hovered/clicked nodes & visual indicators
    const hoveredNodeRef = useRef<AppNode | null>(null);
    const lastInteractedNodeIdRef = useRef<string | null>(null);
    const [justFocused, setJustFocused] = useState(false);
    const justFocusedTimeoutRef = useRef<number | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [organizationNotice, setOrganizationNotice] = useState<{
        count: number;
        historyDepth: number;
    } | null>(null);
    const organizationNoticeTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const handleCanvasOrganized = (event: Event) => {
            const { count, historyDepth } = (event as CustomEvent<{
                count: number;
                historyDepth: number;
            }>).detail;
            setOrganizationNotice({ count, historyDepth });
            if (organizationNoticeTimeoutRef.current !== null) {
                window.clearTimeout(organizationNoticeTimeoutRef.current);
            }
            organizationNoticeTimeoutRef.current = window.setTimeout(() => {
                setOrganizationNotice(null);
                organizationNoticeTimeoutRef.current = null;
            }, 5000);
        };
        window.addEventListener('chnk-it:canvas-organized', handleCanvasOrganized);
        return () => {
            window.removeEventListener('chnk-it:canvas-organized', handleCanvasOrganized);
            if (organizationNoticeTimeoutRef.current !== null) {
                window.clearTimeout(organizationNoticeTimeoutRef.current);
            }
        };
    }, []);

    const undoCanvasOrganization = useCallback(() => {
        if (!organizationNotice) return;
        const temporal = useStore.temporal.getState();
        if (temporal.pastStates.length === organizationNotice.historyDepth) {
            temporal.undo();
        }
        setOrganizationNotice(null);
        if (organizationNoticeTimeoutRef.current !== null) {
            window.clearTimeout(organizationNoticeTimeoutRef.current);
            organizationNoticeTimeoutRef.current = null;
        }
    }, [organizationNotice]);
    /* Cloud load state lives in the store, not here: the cloud status icon in
       the top bar reads the same field, so the loader and the icon cannot
       disagree about whether data is still arriving.
         blocking   — first open of an empty canvas; the shell is frozen.
         background — any later refresh; the canvas stays interactive. */
    const cloudLoad = useStore(s => s.storage.cloudLoad);
    const setCloudLoad = useStore(s => s.setCloudLoad);
    const authUserId = useStore(s => s.auth.userId);
    const activeWorkspaceId = useStore(s => s.auth.activeWorkspaceId);
    const isAuthenticated = useStore(s => s.auth.isAuthenticated);
    const loadGraph = useStore(s => s.loadGraph);
    const setCloudLastLoaded = useStore(s => s.setCloudLastLoaded);
    const setCloudDirty = useStore(s => s.setCloudDirty);
    const setCloudError = useStore(s => s.setCloudError);

    // Realtime Sync Hook
    const { presenceData, updateCursor, broadcastNodeChange, currentUserId } = useRealtimeSync(currentParentId);

    // Viewport culling and visible nodes
    /* Detail streams in when the gesture stops rather than during it: promoting
       a row of cards to a richer tier mid-pan is what makes the drag stutter.
       Wheel/trackpad events can each look like a complete gesture to React
       Flow, so allow a short quiet period before restoring rich detail. */
    const viewportSettleTimerRef = useRef<number | null>(null);
    const flushViewportRef = useRef<() => void>(() => {});
    const publishZoomRef = useRef<() => void>(() => {});
    const clearViewportSettleTimer = useCallback(() => {
        if (viewportSettleTimerRef.current !== null) {
            window.clearTimeout(viewportSettleTimerRef.current);
            viewportSettleTimerRef.current = null;
        }
    }, []);
    const handleMoveStart = useCallback((event?: MouseEvent | TouchEvent | null) => {
        clearViewportSettleTimer();
        // Programmatic camera moves (fit/pan-to-new-card) pass a null event and
        // must remain clickable. Some React Flow camera paths surface a mouse
        // event with no pressed buttons, so presence alone is not enough to
        // identify a gesture. Freeze hit-testing only for an actual pressed
        // pointer, touch, or wheel interaction.
        // Do not freeze nodes on pointer-down alone: a pane click has no move
        // phase, and would otherwise make an immediate card click miss. The
        // class is added by onViewportMove after the camera actually changes.
        if (!isDirectViewportGesture(event)) canvasAreaRef.current?.classList.remove(styles.viewportMoving);
        setStreaming(true);
    }, [clearViewportSettleTimer]);
    const handleMoveEnd = useCallback((immediate = false) => {
        clearViewportSettleTimer();
        if (immediate) {
            canvasAreaRef.current?.classList.remove(styles.viewportMoving);
            setStreaming(false);
            flushViewportRef.current();
            publishZoomRef.current();
            return;
        }
        viewportSettleTimerRef.current = window.setTimeout(() => {
            viewportSettleTimerRef.current = null;
            canvasAreaRef.current?.classList.remove(styles.viewportMoving);
            setStreaming(false);
            // The movement path deliberately re-culls less often. Bring the
            // viewport fully up to date once, after it is safe to spend work.
            flushViewportRef.current();
            // Counter-scaled card controls only need the final zoom. Mutating
            // an inherited custom property on every wheel tick invalidated the
            // styles of the entire canvas and was the dominant zoom cost.
            publishZoomRef.current();
        }, VIEWPORT_SETTLE_MS);
    }, [clearViewportSettleTimer]);

    /* React Flow normally closes a viewport gesture through `onMoveEnd`. Keep a
       native release as a safety net for pointerups that land outside its pane
       (for example after a fast pan reaches the window edge). Without it the
       LOD store can remain in streaming mode and correctly-demoted editors
       would never be eligible to remount. The same settle window is used here
       so a pointer release and React Flow's `onMoveEnd` cannot cause rich
       cards to mount between consecutive wheel events. */
    useEffect(() => {
        const canvasArea = canvasAreaRef.current;
        const releaseStreaming = () => handleMoveEnd();
        const releaseImmediately = () => handleMoveEnd(true);
        window.addEventListener('pointerup', releaseStreaming);
        window.addEventListener('pointercancel', releaseStreaming);
        window.addEventListener('mouseup', releaseStreaming);
        window.addEventListener('blur', releaseImmediately);
        return () => {
            window.removeEventListener('pointerup', releaseStreaming);
            window.removeEventListener('pointercancel', releaseStreaming);
            window.removeEventListener('mouseup', releaseStreaming);
            window.removeEventListener('blur', releaseImmediately);
            clearViewportSettleTimer();
            canvasArea?.classList.remove(styles.viewportMoving);
        };
    }, [handleMoveEnd, clearViewportSettleTimer]);

    const { visibleNodes, handleViewportChange, flushViewportChange } = useCanvasViewport({
        currentParentId,
    });

    useEffect(() => {
        flushViewportRef.current = flushViewportChange;
        return () => { flushViewportRef.current = () => {}; };
    }, [flushViewportChange]);

    const processedNodes = useMemo(() => {
        return visibleNodes.map(node => {
            const isSelected = Boolean(node.selected);
            const baseClass = node.className || '';

            let nextClass = baseClass
                .replace(/\bis-selected\b/g, '')
                .replace(/\bis-linking-mode\b/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            if (isSelected) nextClass += (nextClass ? ' ' : '') + 'is-selected';
            if (isLinkingMode) nextClass += (nextClass ? ' ' : '') + 'is-linking-mode';

            if (baseClass === nextClass) {
                return node;
            }

            return {
                ...node,
                className: nextClass,
            };
        });
    }, [visibleNodes, isLinkingMode]);



    const blurActiveEditable = useCallback(() => {
        // Never blur during/just after a drag — let the editor's cleanup handler restore focus
        if (window.chnkItBlockDragging) return false;
        const el = document.activeElement as HTMLElement | null;
        if (!el) return false;
        const isEditable = el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.isContentEditable ||
            !!el.closest('[contenteditable]') ||
            !!el.closest('[class*="BlockEditor"]') ||
            !!el.closest('[class*="editor"]');
        if (!isEditable) return false;
        el.blur();
        const selection = window.getSelection();
        selection?.removeAllRanges();
        return true;
    }, []);

    // Debug logging for visible nodes
    useEffect(() => {
        if (currentParentId && DEBUG) {
            console.log("CanvasBoard Visible Nodes:", visibleNodes.map(n => ({
                id: n.id,
                type: n.type,
                parentId: n.parentId,
                realParentId: useStore.getState().nodes.find(og => og.id === n.id)?.parentId,
                position: n.position
            })));
        }
    }, [currentParentId, visibleNodes]);

    const addNode = useStore(s => s.addNode);
    const hydrateCanvasFromContent = useStore(s => s.hydrateCanvasFromContent);
    const migrateTopicMapToDocumentTree = useStore(s => s.migrateTopicMapToDocumentTree);

    // Focus viewport when parent changes
    const { fitView, screenToFlowPosition, getViewport, setViewport, setCenter } = useReactFlow();
    const fitViewRef = useRef(fitView);
    const visibleNodesRef = useRef(visibleNodes);

    useEffect(() => {
        fitViewRef.current = fitView;
        visibleNodesRef.current = visibleNodes;
    }, [fitView, visibleNodes]);

    // Existing Smart Link blocks intentionally remain ordinary links. Their
    // explicit "Study" action enters through this event so an older YouTube
    // embed can become a proper study source without re-pasting its URL.
    useEffect(() => {
        if (!FEATURES.youtubeStudy) return;

        const handleOpenYoutubeStudy = (event: Event) => {
            const { url } = (event as CustomEvent<OpenYouTubeStudyDetail>).detail || {};
            const youtube = typeof url === 'string' ? parseYouTubeUrl(url) : null;
            if (!youtube) return;

            const existing = useStore.getState().nodes.find((node) =>
                node.type === 'youtube' && node.data?.video?.videoId === youtube.videoId,
            );
            if (existing) {
                setRightSidePanelId(existing.id);
                return;
            }

            const flowPos = screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
            });
            const sourceNodeId = uuidv4();
            addNode(
                'youtube',
                { x: flowPos.x - 180, y: flowPos.y - 152 },
                createYouTubeStudyData(youtube.canonicalUrl),
                { width: 360, height: 304 },
                currentParentId || undefined,
                sourceNodeId,
            );
            setSelectedCanvasNodeIds(new Set([sourceNodeId]));
            setRightSidePanelId(sourceNodeId);
        };

        window.addEventListener(OPEN_YOUTUBE_STUDY_EVENT, handleOpenYoutubeStudy);
        return () => window.removeEventListener(OPEN_YOUTUBE_STUDY_EVENT, handleOpenYoutubeStudy);
    }, [addNode, currentParentId, screenToFlowPosition, setRightSidePanelId, setSelectedCanvasNodeIds]);

    // Focus last exited node when navigating backwards
    const lastExitedNodeId = useStore(s => s.lastExitedNodeId);
    const clearLastExitedNodeId = useStore(s => s.clearLastExitedNodeId);

    useEffect(() => {
        if (lastExitedNodeId && visibleNodes.length > 0) {
            const node = visibleNodes.find(n => n.id === lastExitedNodeId);
            if (node) {
                // Instantly center on the exact middle of the node with animation
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const { zoom } = getViewport();
                        const width = node.measured?.width || 300;
                        const height = node.measured?.height || 200;
                        setCenter(node.position.x + (width / 2), node.position.y + (height / 2), { zoom: Math.max(zoom, 1), duration: 500 });
                        clearLastExitedNodeId();
                    });
                });
            }
        }
    }, [lastExitedNodeId, visibleNodes, setCenter, getViewport, clearLastExitedNodeId]);

    const keysPressed = useRef<{ [key: string]: boolean }>({});
    const animationFrameId = useRef<number | null>(null);

    const getViewportRef = useRef(getViewport);
    const setViewportRef = useRef(setViewport);
    const screenToFlowPositionRef = useRef(screenToFlowPosition);

    useEffect(() => {
        getViewportRef.current = getViewport;
        setViewportRef.current = setViewport;
        screenToFlowPositionRef.current = screenToFlowPosition;
    }, [getViewport, setViewport, screenToFlowPosition]);

    /* Canvas zoom, published to CSS. Node chrome that has to stay a fixed size on
       screen — the card hover menus, whose 32px buttons shrink to an unclickable
       12px at 0.4x — counter-scales off this. It writes a custom property rather
       than feeding state, so zooming costs one style mutation instead of a
       re-render of every visible node. Coalesce raw wheel events to one update
       per paint: high-resolution trackpads otherwise produce several style and
       culling reads before the browser has rendered even one frame. */
    const viewportWorkFrameRef = useRef<number | null>(null);
    const lastPublishedZoomRef = useRef<number | null>(null);
    const publishZoom = useCallback(() => {
        const zoom = getViewportRef.current().zoom;
        const canvasArea = canvasAreaRef.current;
        if (!canvasArea) return;
        if (lastPublishedZoomRef.current === zoom) return;
        lastPublishedZoomRef.current = zoom;
        // This is consumed only by card chrome inside the canvas. Publishing
        // it at the root invalidates styles for the whole app on each zoom
        // frame (menus, panels, modals, and every mounted node).
        canvasArea.style.setProperty('--rf-zoom', String(zoom));
    }, []);

    const scheduleViewportWork = useCallback(() => {
        if (viewportWorkFrameRef.current !== null) return;
        viewportWorkFrameRef.current = requestAnimationFrame(() => {
            viewportWorkFrameRef.current = null;
            handleViewportChange();
        });
    }, [handleViewportChange]);

    const onViewportMove = useCallback((event?: MouseEvent | TouchEvent | null) => {
        // Some wheel devices do not emit a fresh onMoveStart for every tick.
        // Treat any transform as active movement so deferred LOD work cannot
        // be flushed in the middle of a continuous zoom.
        clearViewportSettleTimer();
        if (isDirectViewportGesture(event)) canvasAreaRef.current?.classList.add(styles.viewportMoving);
        else canvasAreaRef.current?.classList.remove(styles.viewportMoving);
        setStreaming(true);
        scheduleViewportWork();
    }, [clearViewportSettleTimer, scheduleViewportWork]);

    // fitView on mount settles the viewport without ever firing onMove.
    useEffect(() => {
        publishZoom();
        publishZoomRef.current = publishZoom;
        return () => { publishZoomRef.current = () => {}; };
    }, [publishZoom, currentParentId]);

    useEffect(() => {
        return () => {
            if (viewportWorkFrameRef.current !== null) {
                cancelAnimationFrame(viewportWorkFrameRef.current);
            }
        };
    }, []);

    /* Presence cursors ride on pointermove, which fires far faster than any
       collaborator can perceive — and during a node drag it fires on the same
       events that are already moving a card. Sample it instead: ~20/s, and not
       at all mid-drag, where the moving card is the message. */
    const lastCursorPush = useRef(0);
    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (isStreaming() || useStore.getState().interactionState.draggedNodeId) return;
        const now = performance.now();
        if (now - lastCursorPush.current < 50) return;
        lastCursorPush.current = now;
        const flowPos = screenToFlowPositionRef.current({ x: e.clientX, y: e.clientY });
        updateCursor(flowPos.x, flowPos.y);
    }, [updateCursor]);

    const onNodesChangeWrapped = useCallback((changes: NodeChange<AppNode>[]) => {
        onNodesChange(changes);
        changes.forEach(change => {
            if (change.type === 'position' && change.position) {
                // Skip flooding websockets during live drag to prevent JS thread lag (swinging)
                if (!change.dragging) {
                    broadcastNodeChange(change.id, { position: change.position });
                }
            } else if (change.type === 'replace') {
                broadcastNodeChange(change.id, change.item);
            }
        });
    }, [onNodesChange, broadcastNodeChange]);

    useEffect(() => {
        const handlePanToNode = (e: Event) => {
            const customEvent = e as CustomEvent<{ id: string }>;
            const nodeId = customEvent.detail?.id;
            if (!nodeId) return;
            const node = useStore.getState().nodes.find(n => n.id === nodeId);
            if (node) {
                const zoom = getViewportRef.current().zoom;
                setCenter(node.position.x + 150, node.position.y + 100, { zoom, duration: 400 });
            }
        };
        window.addEventListener('panToNode', handlePanToNode);
        return () => window.removeEventListener('panToNode', handlePanToNode);
    }, [setCenter]);

    useEffect(() => {
        const zoomFactorPerFrame = 1.015;
        const panSpeedPerFrame = 18;

        const tick = () => {
            const plusPressed = keysPressed.current['plus'];
            const minusPressed = keysPressed.current['minus'];
            const leftPressed = keysPressed.current['ArrowLeft'];
            const rightPressed = keysPressed.current['ArrowRight'];
            const upPressed = keysPressed.current['ArrowUp'];
            const downPressed = keysPressed.current['ArrowDown'];

            if (!plusPressed && !minusPressed && !leftPressed && !rightPressed && !upPressed && !downPressed) {
                animationFrameId.current = null;
                return;
            }

            const { x, y, zoom } = getViewportRef.current();
            let newX = x;
            let newY = y;
            let newZoom = zoom;

            if (plusPressed) {
                newZoom = Math.min(2, zoom * zoomFactorPerFrame);
            } else if (minusPressed) {
                newZoom = Math.max(MIN_CANVAS_ZOOM, zoom / zoomFactorPerFrame);
            }

            if (newZoom !== zoom) {
                const mouseX = mousePosRef.current.x;
                const mouseY = mousePosRef.current.y;
                const flowPos = screenToFlowPositionRef.current({ x: mouseX, y: mouseY });

                newX = x + flowPos.x * (zoom - newZoom);
                newY = y + flowPos.y * (zoom - newZoom);

                setViewportRef.current({ x: newX, y: newY, zoom: newZoom });
            }

            if (leftPressed) newX += panSpeedPerFrame;
            if (rightPressed) newX -= panSpeedPerFrame;
            if (upPressed) newY += panSpeedPerFrame;
            if (downPressed) newY -= panSpeedPerFrame;

            if (leftPressed || rightPressed || upPressed || downPressed) {
                setViewportRef.current({ x: newX, y: newY, zoom: newZoom });
            }

            animationFrameId.current = requestAnimationFrame(tick);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isInEditableField) return;

            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                keysPressed.current['plus'] = true;
                if (!animationFrameId.current) {
                    animationFrameId.current = requestAnimationFrame(tick);
                }
            } else if (e.key === '-') {
                e.preventDefault();
                keysPressed.current['minus'] = true;
                if (!animationFrameId.current) {
                    animationFrameId.current = requestAnimationFrame(tick);
                }
            } else if (e.key === '5') {
                e.preventDefault();
                fitView({ duration: 400 });
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                keysPressed.current[e.key] = true;
                if (!animationFrameId.current) {
                    animationFrameId.current = requestAnimationFrame(tick);
                }
            } else if (e.key === 'k') {
                e.preventDefault();
                setShortcutsPanelOpen(!isShortcutsPanelOpen);
            } else if (e.key === 'l') {
                e.preventDefault();
                if (useStore.getState().selectedCanvasNodeIds.size >= 2) {
                    setIsLinkingMode(!isLinkingMode);
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                const selectedIds = Array.from(useStore.getState().selectedCanvasNodeIds);
                if (selectedIds.length > 0) {
                    bulkDuplicateNodes(selectedIds);
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === '+' || e.key === '=') {
                keysPressed.current['plus'] = false;
            } else if (e.key === '-') {
                keysPressed.current['minus'] = false;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                keysPressed.current[e.key] = false;
            }
        };

        const handleBlur = () => {
            keysPressed.current = {};
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isInEditableField, fitView, isShortcutsPanelOpen, setShortcutsPanelOpen, setIsLinkingMode, isLinkingMode, bulkDuplicateNodes]);

    useEffect(() => {
        isFocusArmedRef.current = isFocusArmed;
    }, [isFocusArmed]);

    useEffect(() => {
        if (isInEditableField && isFocusArmedRef.current) {
            setIsFocusArmed(false);
        }
    }, [isInEditableField]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (!blurActiveEditable()) return;
            e.preventDefault();
            e.stopPropagation();
        };

        const handlePointerDown = (e: PointerEvent) => {
            // Don't blur during/just after a block drag — let the cleanup handler restore focus
            if (window.chnkItBlockDragging) return;

            const target = e.target as HTMLElement | null;
            if (target) {
                const nodeEl = target.closest('.react-flow__node');
                if (nodeEl) {
                    const nodeId = nodeEl.getAttribute('data-id');
                    if (nodeId) {
                        lastInteractedNodeIdRef.current = nodeId;
                    }
                }
            }

            if (!isInEditableField) return;
            if (!target) return;
            const isClickInsideEditable = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                !!target.closest('[contenteditable]') ||
                !!target.closest('[class*="BlockEditor"]') ||
                !!target.closest('[class*="editor"]');
            if (isClickInsideEditable) return;
            blurActiveEditable();
        };

        const handleGlobalDragEnd = () => {
            if (window.chnkItBlockDragging || document.body.classList.contains('chnk-it-block-dragging')) {
                console.log("[CanvasBoard] Global dragend fallback cleanup executed");
                endBlockDrag();
                document.body.classList.remove('chnk-it-node-dragging');
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        document.addEventListener('pointerdown', handlePointerDown, { capture: true });
        window.addEventListener('dragend', handleGlobalDragEnd, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('dragend', handleGlobalDragEnd, true);
        };
    }, [blurActiveEditable, isInEditableField]);

    const selectedCanvasNodeIdsRef = useRef(useStore.getState().selectedCanvasNodeIds);
    const nodesRef = useRef(useStore.getState().nodes);
    useEffect(() => {
        return useStore.subscribe((state, previousState) => {
            if (state.selectedCanvasNodeIds !== previousState.selectedCanvasNodeIds) {
                selectedCanvasNodeIdsRef.current = state.selectedCanvasNodeIds;
                const selectionChanged = state.selectedCanvasNodeIds.size !== previousState.selectedCanvasNodeIds.size
                    || Array.from(state.selectedCanvasNodeIds).some(id => !previousState.selectedCanvasNodeIds.has(id));
                if (selectionChanged) lastProgrammaticSelectionTimeRef.current = Date.now();
            }
            if (state.nodes !== previousState.nodes) nodesRef.current = state.nodes;
        });
    }, []);

    useEffect(() => {
        const clearArm = () => {
            if (focusArmTimeoutRef.current) {
                window.clearTimeout(focusArmTimeoutRef.current);
                focusArmTimeoutRef.current = null;
            }
            if (isFocusArmedRef.current) setIsFocusArmed(false);
        };

        const armForNextClick = () => {
            if (focusArmTimeoutRef.current) {
                window.clearTimeout(focusArmTimeoutRef.current);
                focusArmTimeoutRef.current = null;
            }
            setIsFocusArmed(true);
            focusArmTimeoutRef.current = window.setTimeout(() => {
                setIsFocusArmed(false);
                focusArmTimeoutRef.current = null;
            }, 2500);
        };

        // Shared focusing path for the F shortcut and controls outside the
        // canvas, such as an AI turn's “Locate on canvas” action.
        const focusNodes = (nodesToFocus: AppNode[], duration = 450) => {
            if (nodesToFocus.length === 0) return false;

            setSelectedCanvasNodeIds(new Set(nodesToFocus.map((node) => node.id)));
            fitView({ nodes: nodesToFocus, padding: 0.45, duration, maxZoom: 1.3 });
            clearArm();

            if (justFocusedTimeoutRef.current) {
                window.clearTimeout(justFocusedTimeoutRef.current);
            }
            setJustFocused(true);
            justFocusedTimeoutRef.current = window.setTimeout(() => {
                setJustFocused(false);
                justFocusedTimeoutRef.current = null;
            }, 1500);

            return true;
        };

        const handleFocusCanvasNodes = (e: Event) => {
            const { ids, duration } = (e as CustomEvent<{ ids?: string[]; duration?: number }>).detail ?? {};
            if (!ids?.length) return;
            focusNodes(useStore.getState().nodes.filter((node) => ids.includes(node.id)), duration);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            // Real-time active editable field verification as a robust double-lock guard
            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl) {
                const isEditable = activeEl.tagName === 'INPUT' ||
                    activeEl.tagName === 'TEXTAREA' ||
                    activeEl.isContentEditable ||
                    !!activeEl.closest('[contenteditable]') ||
                    !!activeEl.closest('[class*="BlockEditor"]') ||
                    !!activeEl.closest('[class*="editor"]');
                if (isEditable) return;
            }
            if (isInEditableField) return;

            if (e.key === 'Escape') {
                clearArm();
                return;
            }
            if (e.key !== 'f' && e.key !== 'F') return;
            e.preventDefault();

            // Intelligent priority-based node focusing:
            let nodesToFocus: AppNode[] = [];

            // Priority 1: Hovered node (immediate context)
            const hoveredNode = hoveredNodeRef.current;
            if (hoveredNode) {
                const found = nodesRef.current.find(n => n.id === hoveredNode.id);
                if (found) nodesToFocus = [found];
            }

            // Priority 2: Selected nodes
            if (nodesToFocus.length === 0) {
                const selectedIds = Array.from(selectedCanvasNodeIdsRef.current);
                if (selectedIds.length > 0) {
                    nodesToFocus = nodesRef.current.filter(n => selectedIds.includes(n.id));
                }
            }

            // Priority 3: Last interacted node (from clicks/pointers)
            if (nodesToFocus.length === 0 && lastInteractedNodeIdRef.current) {
                const found = nodesRef.current.find(n => n.id === lastInteractedNodeIdRef.current);
                if (found) nodesToFocus = [found];
            }

            if (focusNodes(nodesToFocus)) return;

            // Fallback: If no selected/hovered/clicked nodes, toggle/arm focusing for the next mouse click
            if (isFocusArmedRef.current) {
                clearArm();
                return;
            }
            armForNextClick();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('focusCanvasNodes', handleFocusCanvasNodes);
        window.addEventListener('blur', clearArm);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('focusCanvasNodes', handleFocusCanvasNodes);
            window.removeEventListener('blur', clearArm);
            if (focusArmTimeoutRef.current) {
                window.clearTimeout(focusArmTimeoutRef.current);
            }
            if (justFocusedTimeoutRef.current) {
                window.clearTimeout(justFocusedTimeoutRef.current);
            }
        };
    }, [isInEditableField, fitView, setSelectedCanvasNodeIds]);

    // Track mouse coordinates on window
    const mousePosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useEffect(() => {
        const checkEditable = () => {
            const el = document.activeElement as HTMLElement | null;
            if (!el) return false;
            return el.tagName === 'INPUT' ||
                el.tagName === 'TEXTAREA' ||
                el.isContentEditable ||
                !!el.closest('[contenteditable]') ||
                !!el.closest('[class*="BlockEditor"]') ||
                !!el.closest('[class*="editor"]');
        };

        const updateEditable = () => {
            const next = checkEditable();
            setIsInEditableField(prev => prev === next ? prev : next);
        };

        updateEditable();
        window.addEventListener('focusin', updateEditable);
        window.addEventListener('focusout', updateEditable);

        return () => {
            window.removeEventListener('focusin', updateEditable);
            window.removeEventListener('focusout', updateEditable);
        };
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

            // Prevent overstacking: add a random starting jitter and check for realistic card collisions
            const { nodes: currentNodes } = useStore.getState();
            let targetX = flowPos.x + (Math.random() - 0.5) * 120; // random offset between -60px and +60px
            let targetY = flowPos.y + (Math.random() - 0.5) * 80;  // random offset between -40px and +40px
            
            const thresholdX = 180; // check for horizontal overlap (card width ~300px)
            const thresholdY = 60;  // check for vertical overlap (card height ~100px)

            let overlap = true;
            let attempts = 0;
            const maxAttempts = 30;

            while (overlap && attempts < maxAttempts) {
                overlap = false;
                for (const node of currentNodes) {
                    const nodeParentId = node.parentId || undefined;
                    const activeParent = currentParentId || undefined;
                    if (nodeParentId !== activeParent) continue;

                    const dx = Math.abs(node.position.x - targetX);
                    const dy = Math.abs(node.position.y - targetY);

                    // If nodes overlap within the card's dimensions, disperse randomly
                    if (dx < thresholdX && dy < thresholdY) {
                        targetX += (Math.random() * 40 + 20) * (Math.random() > 0.5 ? 1 : -1);
                        targetY += (Math.random() * 40 + 20) * (Math.random() > 0.5 ? 1 : -1);
                        overlap = true;
                        attempts++;
                        break;
                    }
                }
            }

            // Create new Text Block
            const nodeId = uuidv4();
            const newBlock = {
                id: uuidv4(),
                type: 'text' as const,
                content: ''
            };

            addNode(
                'block',
                { x: targetX, y: targetY },
                { content: [newBlock], isStandaloneBlock: true },
                { width: 300, height: 100 },
                currentParentId || undefined,
                nodeId
            );

            // Automatically highlight and select the newly created text block node
            const nextSelectedIds = new Set([nodeId]);
            setSelectedCanvasNodeIds(nextSelectedIds);
            setLastCreatedCanvasNodeId(nodeId);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const el = document.querySelector(`#block-${newBlock.id} [contenteditable="true"]`) as HTMLElement | null;
                    el?.focus({ preventScroll: true });
                    window.dispatchEvent(new CustomEvent('panToNode', { detail: { id: nodeId } }));
                });
            });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [addNode, currentParentId, screenToFlowPosition, setLastCreatedCanvasNodeId, setSelectedCanvasNodeIds]);

    // Canvas-Level Direct Paste (Text/Images)
    useEffect(() => {
        const handleCanvasPaste = async (e: ClipboardEvent) => {
            // Intercept paste only when not typing inside text inputs, textareas, contenteditables or code blocks
            const target = e.target as HTMLElement | null;
            /* `closest` only exists on Elements. A paste dispatched while focus
               sits on the document (or on window) used to throw here and take
               the whole handler down with it, so nothing pasted at all. */
            const canQuery = !!target && typeof target.closest === 'function';
            const isEditable = canQuery && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                !!target.closest('[contenteditable]') ||
                !!target.closest('[class*="BlockEditor"]') ||
                !!target.closest('[class*="editor"]')
            );

            if (isEditable) return;

            /* Cards copied from this app carry their full data — and the
               connections between them — in the clipboard's HTML flavour.
               Rebuild them on whichever canvas is open now, which is what makes
               copying into and out of a card's inner canvas work. */
            const internal = decodePayload(e.clipboardData?.getData('text/html'));
            if (internal?.kind === 'nodes') {
                e.preventDefault();
                const flowPos = screenToFlowPosition({
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2,
                });
                pasteClipboardNodes(internal, flowPos);
                return;
            }

            let parsedBlocks: Block[] = [];
            const files = e.clipboardData?.files;
    
            if (files && files.length > 0) {
                e.preventDefault();
                parsedBlocks = await parseFiles(files);
            } else {
                const text = e.clipboardData?.getData('text/plain')?.trim();
                const html = e.clipboardData?.getData('text/html');
                if (!text && !html) return;
                const youtube = FEATURES.youtubeStudy && text ? parseYouTubeUrl(text) : null;
                if (youtube) {
                    e.preventDefault();
                    const flowPos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                    const forceId = uuidv4();
                    addNode(
                        'youtube',
                        { x: flowPos.x - 180, y: flowPos.y - 152 },
                        createYouTubeStudyData(youtube.canonicalUrl),
                        { width: 360, height: 304 },
                        currentParentId || undefined,
                        forceId,
                    );
                    setSelectedCanvasNodeIds(new Set([forceId]));
                    return;
                }
                e.preventDefault();
                // Create a synthetic React-like event for parseTextOrHtml
                parsedBlocks = parseTextOrHtml({
                    clipboardData: e.clipboardData,
                } as Parameters<typeof parseTextOrHtml>[0]);
            }
    
            if (parsedBlocks.length > 0) {
            const flowPos = screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            });

            // Randomize position slightly if pasting multiple times
            const targetX = flowPos.x + (Math.random() - 0.5) * 40;
            const targetY = flowPos.y + (Math.random() - 0.5) * 40;

            const targetPosition = { x: targetX, y: targetY };
            const nodeData = {
                content: parsedBlocks,
                isStandaloneBlock: true
            };
            
            const isSingleStandaloneBlock = parsedBlocks.length === 1 && ['image', 'video', 'file', 'media', 'link'].includes(parsedBlocks[0].type);
            const nodeType = isSingleStandaloneBlock ? 'block' : 'fused-note';
            
            const forceId = uuidv4();
            addNode(nodeType, targetPosition, nodeData, { width: 432, height: 120 }, currentParentId || undefined, forceId);
            setSelectedCanvasNodeIds(new Set([forceId]));
            }
        };

        window.addEventListener('paste', handleCanvasPaste);
        return () => window.removeEventListener('paste', handleCanvasPaste);
    }, [addNode, currentParentId, screenToFlowPosition, setSelectedCanvasNodeIds, pasteClipboardNodes]);

    /**
     * Ctrl+C / Ctrl+X over selected cards.
     *
     * Rides the native copy/cut events rather than a keydown listener, because
     * only inside those events can a page put both a readable text flavour and
     * our structured payload on the clipboard at once. Ignored while focus is
     * in a text field, so copying words inside a card still behaves normally.
     */
    useEffect(() => {
        const buildPayload = () => {
            const state = useStore.getState();
            const selected = Array.from(state.selectedCanvasNodeIds);
            if (selected.length === 0) return null;

            const nodes = state.nodes.filter(n => selected.includes(n.id));
            if (nodes.length === 0) return null;

            // Positions are stored relative to the selection's top-left so the
            // group keeps its shape wherever it is pasted.
            const minX = Math.min(...nodes.map(n => n.position.x));
            const minY = Math.min(...nodes.map(n => n.position.y));
            const indexById = new Map(nodes.map((n, i) => [n.id, i]));

            const payload: NodesPayload = {
                v: 1,
                kind: 'nodes',
                nodes: nodes.map((n, i) => ({
                    ref: i,
                    type: n.type || 'note',
                    dx: n.position.x - minX,
                    dy: n.position.y - minY,
                    width: typeof n.style?.width === 'number' ? n.style.width : undefined,
                    height: typeof n.style?.height === 'number' ? n.style.height : undefined,
                    data: n.data as unknown as Record<string, unknown>,
                })),
                edges: state.edges
                    .filter(e => indexById.has(e.source) && indexById.has(e.target))
                    .map(e => ({
                        source: indexById.get(e.source)!,
                        target: indexById.get(e.target)!,
                        sourceHandle: e.sourceHandle ?? null,
                        targetHandle: e.targetHandle ?? null,
                        type: e.type,
                    })),
            };

            // Readable fallback: the cards' own text, so pasting into another
            // program gives something meaningful instead of nothing.
            const text = nodes
                .map(n => {
                    const label = getNodeLabel(n.data);
                    const blocks = getNodeBlocks(n.data);
                    const body = blocks ? blocksToPlainText(blocks) : '';
                    return [label, body].filter(Boolean).join('\n');
                })
                .filter(Boolean)
                .join('\n\n---\n\n');

            const html = nodes
                .map(n => {
                    const blocks = getNodeBlocks(n.data);
                    return blocks ? blocksToHtml(blocks) : '';
                })
                .join('<hr />');

            return { payload, ...encodePayload(payload, text, html), ids: selected };
        };

        const onCopy = (e: ClipboardEvent) => {
            if (isInEditableFieldRef.current) return;
            const built = buildPayload();
            if (!built || !e.clipboardData) return;
            e.clipboardData.setData('text/plain', built.text);
            e.clipboardData.setData('text/html', built.html);
            e.preventDefault();
        };

        const onCut = (e: ClipboardEvent) => {
            if (isInEditableFieldRef.current) return;
            const built = buildPayload();
            if (!built || !e.clipboardData) return;
            e.clipboardData.setData('text/plain', built.text);
            e.clipboardData.setData('text/html', built.html);
            e.preventDefault();
            useStore.getState().requestNodeDeletion(built.ids);
        };

        document.addEventListener('copy', onCopy);
        document.addEventListener('cut', onCut);
        return () => {
            document.removeEventListener('copy', onCopy);
            document.removeEventListener('cut', onCut);
        };
    }, []);

    // Native context menu handler (bypasses ReactFlow's right-click pan handling)
    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const isPane = target.closest('.react-flow__pane');
            const nodeEl = target.closest('.react-flow__node') as HTMLElement | null;
            if (!isPane && !nodeEl) return;

            // Don't show context menu when inside an editable field
            const isEditable = !!target.closest('[contenteditable]') ||
                !!target.closest('[class*="BlockEditor"]') ||
                !!target.closest('input, textarea');
            if (isEditable) return;

            /* Right-clicking a card used to be ignored entirely, so there was no
               way to reach Copy or Cut with the mouse. Now it selects the card
               under the cursor (unless it is already part of a multi-selection)
               and opens the same menu, which offers Copy/Cut for a selection. */
            if (nodeEl) {
                const nodeId = nodeEl.getAttribute('data-id');
                if (nodeId) {
                    const state = useStore.getState();
                    if (!state.selectedCanvasNodeIds.has(nodeId)) {
                        state.setSelectedCanvasNodeIds(new Set([nodeId]));
                        state.setNodes(ns => ns.map(n => ({ ...n, selected: n.id === nodeId })));
                    }
                }
            }

            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY });
        };

        document.addEventListener('contextmenu', handleContextMenu, { capture: true });
        return () => document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    }, []);

    const lastFittedParentRef = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (lastFittedParentRef.current === currentParentId) return;
        lastFittedParentRef.current = currentParentId;

        if (visibleNodesRef.current.length > 0) {
            const timer = setTimeout(() => {
                fitViewRef.current({ duration: 400, padding: 0.2, minZoom: MIN_CANVAS_ZOOM, maxZoom: 1 });
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [currentParentId]);

    // Visible edges:
    //  1. Endpoints must be in the visible (current parent context) node set.
    //  2. Edge.data.parentId must match the active currentParentId so connections
    //     made inside a drilled-down canvas don't bleed into the root view.
    /* Dragging replaces only positions, not membership. Keep the edge list
       referentially stable through those frames: filtering every edge while a
       card follows the pointer is enough to make a large graph fall behind. */
    const visibleNodeIdKey = useMemo(
        () => visibleNodes.map(node => node.id).join('\u0000'),
        [visibleNodes],
    );
    const visibleEdges = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodeIdKey ? visibleNodeIdKey.split('\u0000') : []);
        const activeParent = currentParentId ?? null;
        return edges.filter(e => {
            if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)) return false;
            const edgeParent = (e.data as { parentId?: string | null } | undefined)?.parentId ?? null;
            return edgeParent === activeParent;
        });
    }, [edges, visibleNodeIdKey, currentParentId]);

    // Node types registration
    const nodeTypes = useMemo(() => ({
        note: NoteCard,
        block: BlockNode,
        'fused-note': FusedNoteNode,
        kanban: KanbanNodeComponent,
        youtube: YouTubeNode,
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
    const isValidConnection = useCallback((connection: Edge | Connection) => {
        return connection.source !== connection.target;
    }, []);

    // Active parent node for metadata display
    const activeParentNode = useStore(useCallback(s =>
        currentParentId ? s.nodes.find(n => n.id === currentParentId) : null,
        [currentParentId]
    ));
    const [canvasAnnouncement, setCanvasAnnouncement] = useState('');
    const announcedCanvasParentRef = useRef<string | null | undefined>(undefined);
    const autoMappedParentIdsRef = useRef(new Set<string>());
    const [pendingAutoMapFitParentId, setPendingAutoMapFitParentId] = useState<string | null>(null);
    const hasLegacyTopicRoot = visibleNodes.some((node) => (
        node.type === 'fused-note' && node.data.mapRole === 'topic-root'
    ));
    const hasGeneratedDocumentTree = visibleNodes.some((node) => (
        node.type === 'fused-note'
        && (node.data.mapRole === 'chapter' || node.data.mapRole === 'section')
    ));

    // Maps created before the top-to-bottom document tree used a synthetic
    // centre title. It owns no source content, so remove it and reflow only
    // those generated maps; hand-arranged canvases remain untouched.
    useEffect(() => {
        if (!currentParentId || !hasLegacyTopicRoot) return;
        if (migrateTopicMapToDocumentTree(currentParentId)) {
            setPendingAutoMapFitParentId(currentParentId);
            setCanvasAnnouncement('Arranged this note as a top-to-bottom document tree.');
        }
    }, [currentParentId, hasLegacyTopicRoot, migrateTopicMapToDocumentTree]);

    // Opening a written card should reveal its existing thinking as a map, not
    // interrupt the person with an import decision. This runs once for an
    // untouched nested canvas; a deliberate empty map or a manual canvas is
    // never rebuilt behind its owner's back.
    useEffect(() => {
        if (
            !currentParentId
            || activeParentNode?.type !== 'note'
            || activeParentNode.data.hasNestedCanvasSync
            || visibleNodes.length > 0
            || autoMappedParentIdsRef.current.has(currentParentId)
        ) return;

        const noteBlocks = getNodeBlocks(activeParentNode.data) ?? [];
        if (!noteBlocks.some(isCanvasHydratableBlock)) return;

        autoMappedParentIdsRef.current.add(currentParentId);
        hydrateCanvasFromContent(currentParentId);
        setPendingAutoMapFitParentId(currentParentId);
        setCanvasAnnouncement(`Created a mind map for ${getNodeLabel(activeParentNode.data) || 'this note'}.`);
    }, [activeParentNode, currentParentId, hydrateCanvasFromContent, visibleNodes.length]);

    // The first fit on entering a previously empty canvas happens before its
    // generated nodes exist. Wait for those nodes, then frame the whole map in
    // one calm movement rather than leaving its topic or chapters off-screen.
    useEffect(() => {
        if (pendingAutoMapFitParentId !== currentParentId || visibleNodes.length === 0) return;
        const timer = window.setTimeout(() => {
            fitView({ duration: 420, padding: 0.24, minZoom: MIN_CANVAS_ZOOM, maxZoom: 1 });
            setPendingAutoMapFitParentId(null);
        // React Flow measures a newly mounted editor card after its first
        // paint. Giving that measurement one short beat keeps fitView from
        // framing the old empty canvas and leaving the new map off-screen.
        }, 180);
        return () => window.clearTimeout(timer);
    }, [currentParentId, fitView, pendingAutoMapFitParentId, visibleNodes.length]);

    // A map is spatial, so a device rotation or a narrow window must reframe
    // its whole hierarchy. This observes only generated maps; hand-built
    // canvases keep their existing camera position on resize.
    useEffect(() => {
        const canvasArea = canvasAreaRef.current;
        if (!canvasArea || !hasGeneratedDocumentTree) return;

        let timer: number | undefined;
        const frameMap = () => {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                fitView({ duration: 260, padding: 0.22, minZoom: MIN_CANVAS_ZOOM, maxZoom: 1 });
            }, 120);
        };
        const observer = new ResizeObserver(frameMap);
        observer.observe(canvasArea);
        return () => {
            observer.disconnect();
            if (timer) window.clearTimeout(timer);
        };
    }, [fitView, hasGeneratedDocumentTree]);

    useEffect(() => {
        // Do not steal focus on first load, but when a person intentionally
        // changes level, put their keyboard and screen reader at the new
        // canvas and name exactly where they landed.
        if (announcedCanvasParentRef.current === undefined) {
            announcedCanvasParentRef.current = currentParentId;
            return;
        }
        if (announcedCanvasParentRef.current === currentParentId) return;
        announcedCanvasParentRef.current = currentParentId;

        const label = activeParentNode ? (getNodeLabel(activeParentNode.data) || 'Untitled card') : '';
        setCanvasAnnouncement(currentParentId
            ? `Opened ${label}'s nested canvas. Press Alt+Up to return to its parent.`
            : 'Returned to the home canvas.');
        requestAnimationFrame(() => canvasAreaRef.current?.focus({ preventScroll: true }));
    }, [activeParentNode, currentParentId]);

    useEffect(() => {
        const handleNestedCanvasKeys = (event: KeyboardEvent) => {
            const target = event.target;
            if (
                isCanvasObscured
                || isEditableTarget(target)
                || !(target instanceof HTMLElement)
                || (!canvasAreaRef.current?.contains(target) && target !== document.body)
            ) return;

            const nodeElement = target.closest<HTMLElement>('.react-flow__node');
            const nodeId = nodeElement?.getAttribute('data-id') ?? null;

            if (event.key === 'Enter' && nodeId) {
                const node = useStore.getState().nodes.find((candidate) => candidate.id === nodeId);
                if (node?.type === 'note') {
                    event.preventDefault();
                    event.stopPropagation();
                    navigateToNode(nodeId);
                }
                return;
            }

            if ((event.key === 'Delete' || event.key === 'Backspace')) {
                const selectedIds = Array.from(useStore.getState().selectedCanvasNodeIds);
                if (selectedIds.length > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    requestNodeDeletion(selectedIds);
                }
                return;
            }

            const shouldExit = event.altKey && event.key === 'ArrowUp';
            const shouldExitFromPane = event.key === 'Escape' && !nodeId;
            if ((shouldExit || shouldExitFromPane) && currentParentId) {
                const parent = useStore.getState().nodes.find((node) => node.id === currentParentId);
                event.preventDefault();
                event.stopPropagation();
                navigateToNode(parent?.parentId ?? null);
            }
        };

        // Capture before React Flow sees a Delete or Enter key. React Flow
        // otherwise removes selected cards before our branch warning can run.
        document.addEventListener('keydown', handleNestedCanvasKeys, true);
        return () => document.removeEventListener('keydown', handleNestedCanvasKeys, true);
    }, [currentParentId, isCanvasObscured, navigateToNode, requestNodeDeletion]);
    const showFirstCardOffer = Boolean(
        currentParentId
        && activeParentNode?.type === 'note'
        && visibleNodes.length === 0
        && !(getNodeBlocks(activeParentNode.data) ?? []).some(isCanvasHydratableBlock),
    );
    const createFirstNestedCard = useCallback(() => {
        if (!currentParentId) return;
        const nodeId = uuidv4();
        addNode(
            'note',
            { x: 0, y: 0 },
            { label: 'New card' },
            { width: 432, height: 320 },
            currentParentId,
            nodeId,
        );
        setSelectedCanvasNodeIds(new Set([nodeId]));
        setLastCreatedCanvasNodeId(nodeId);
    }, [addNode, currentParentId, setLastCreatedCanvasNodeId, setSelectedCanvasNodeIds]);

    useEffect(() => {
        if (!isSupabaseConfigured || !isAuthenticated || !authUserId || !activeWorkspaceId) {
            setCloudLoad('idle');
            return;
        }
        const loadKey = `${authUserId}:${activeWorkspaceId}`;

        /* Two conditions have to hold before we are allowed to freeze the app:
           this must be the workspace's first load of the session, AND there
           must be nothing on the canvas yet. A canvas with live session edits
           stays usable while a background refresh is in flight. */
        const firstOpen = !hasHydrated(loadKey);
        const canvasIsEmpty = useStore.getState().nodes.length === 0;
        const blocking = firstOpen && canvasIsEmpty;

        let cancelled = false;
        const phase = blocking ? 'blocking' : 'background';
        const handleProgress = (progress: CloudLoadProgress) => {
            if (!cancelled) setCloudLoad(phase, progress);
        };

        setCloudLoad(phase, { stage: 'authorizing', value: 0 });

        void (async () => {
            try {
                setCloudError(null);
                /* `loadWorkspaceOnce` de-duplicates concurrent calls for this
                   key, which is what makes Strict Mode's teardown-and-rerun
                   safe: the second run joins the first run's request (and its
                   progress stream) instead of firing a second one. */
                const result = await loadWorkspaceOnce(
                    loadKey,
                    (onProgress) => loadCanvasFromCloud(authUserId, activeWorkspaceId, onProgress),
                    handleProgress,
                );
                if (cancelled) return;
                if (result.ok) {
                    const state = useStore.getState();
                    if (result.nodes.length === 0 && state.nodes.length > 0) {
                        // Empty cloud must never wipe existing local work — e.g. a
                        // user who started a new session before signing in. Keep the
                        // live canvas and mark everything dirty so auto-sync pushes
                        // it up to the empty cloud instead.
                        state.markNodesDirty(state.nodes.map(n => n.id));
                        state.markEdgesDirty(state.edges.map(e => e.id));
                        setCloudDirty(true);
                        return;
                    }
                    /* A *repeat* load runs against a canvas the user has been
                       editing, so it must yield to unsaved local changes rather
                       than swapping the graph out from under them. A first open
                       keeps the original semantics — cloud is the source of
                       truth for the session's initial state. */
                    if (!firstOpen && state.storage.isCloudDirty) return;
                    loadGraph(result.nodes, result.edges);
                    setCloudLastLoaded(new Date().toLocaleTimeString());
                    setCloudDirty(false);
                    setCloudError(null);
                } else {
                    // Let a retry earn the full-fidelity loader again.
                    forgetWorkspace(loadKey);
                    setCloudError(result.error);
                }
            } finally {
                /* Same commit as the loadGraph/status updates above: React
                   batches this continuation, so the icon and the loader flip
                   together rather than one lagging the other. */
                if (!cancelled) setCloudLoad('idle');
            }
        })();

        return () => {
            cancelled = true;
            unsubscribeWorkspaceProgress(loadKey, handleProgress);
        };
    }, [authUserId, activeWorkspaceId, isAuthenticated, loadGraph, setCloudLastLoaded, setCloudDirty, setCloudError, setCloudLoad]);

    useEffect(() => {
        if (!isSupabaseConfigured || !supabase || !isAuthenticated || !authUserId || !activeWorkspaceId) return;

        let cancelled = false;
        let reloadTimer: number | null = null;

        const reloadSharedCanvas = () => {
            if (reloadTimer) window.clearTimeout(reloadTimer);
            reloadTimer = window.setTimeout(async () => {
                if (cancelled) return;

                const state = useStore.getState();

                // 1. If we have unsaved local changes, do NOT overwrite them!
                if (state.storage.isCloudDirty) return;

                // 2. If the user is actively typing, do NOT reload (prevents typing deletion)
                const activeEl = document.activeElement as HTMLElement | null;
                const isTyping = activeEl && (
                    activeEl.tagName === 'INPUT' ||
                    activeEl.tagName === 'TEXTAREA' ||
                    activeEl.isContentEditable ||
                    !!activeEl.closest('[contenteditable]') ||
                    !!activeEl.closest('[class*="BlockEditor"]') ||
                    !!activeEl.closest('[class*="editor"]')
                );
                if (isTyping) return;

                // 3. If the user is actively dragging, do NOT reload (prevents snapping back)
                const isDragging = document.body.classList.contains('chnk-it-node-dragging') || 
                                   document.body.classList.contains('chnk-it-block-dragging');
                if (isDragging) return;

                // 4. If we just saved to the cloud within the last 5 seconds, ignore this event 
                // as it's almost certainly our own save bouncing back from Supabase.
                const lastSaveMs = state.storage.cloudLastSaveTimeMs;
                if (lastSaveMs && Date.now() - lastSaveMs < 5000) return;

                /* A collaborator's edit rearranges cards under the user's
                   cursor. The pill is what tells them why — it never blocks,
                   and it clears the moment the refetch lands. Routed through
                   the same store field as the initial load so the cloud icon
                   spins for this too. */
                setCloudLoad('background', { stage: 'fetching', value: 0.3 });
                try {
                    const result = await loadCanvasFromCloud(
                        authUserId,
                        activeWorkspaceId,
                        (progress) => { if (!cancelled) setCloudLoad('background', progress); },
                    );
                    if (cancelled) return;
                    if (result.ok) {
                        // Local is clean here (checked above), so a non-empty local
                        // canvas should match the cloud. An empty result against
                        // non-empty local is almost certainly a transient glitch —
                        // skip rather than wipe the canvas.
                        if (result.nodes.length === 0 && useStore.getState().nodes.length > 0) return;
                        loadGraph(result.nodes, result.edges);
                        setCloudLastLoaded(new Date().toLocaleTimeString());
                        setCloudDirty(false);
                        setCloudError(null);
                    } else {
                        setCloudError(result.error);
                    }
                } finally {
                    if (!cancelled) setCloudLoad('idle');
                }
            }, 650);
        };

        const channel = supabase
            .channel(`workspace-canvas-${activeWorkspaceId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'canvas_nodes',
                    filter: `workspace_id=eq.${activeWorkspaceId}`,
                },
                reloadSharedCanvas,
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'canvas_edges',
                    filter: `workspace_id=eq.${activeWorkspaceId}`,
                },
                reloadSharedCanvas,
            )
            .subscribe();

        return () => {
            cancelled = true;
            if (reloadTimer) window.clearTimeout(reloadTimer);
            // An in-flight refetch is abandoned here, so its `finally` will not
            // clear the pill — drop it now rather than leaving one pinned.
            setCloudLoad('idle');
            void supabase.removeChannel(channel);
        };
    }, [authUserId, activeWorkspaceId, isAuthenticated, loadGraph, setCloudLastLoaded, setCloudDirty, setCloudError, setCloudLoad]);

    // Recently viewed tracking
    const { trackNoteView } = useRecentlyViewed(activeWorkspaceId || undefined);

    useEffect(() => {
        if (!activeWorkspaceId) return; // workspace not yet provisioned
        if (currentParentId && activeParentNode) {
            const data = activeParentNode.data as Record<string, unknown>;
            trackNoteView(
                activeParentNode.id, 
                (data?.title as string) || 'Untitled', 
                activeParentNode.type || 'unknown', 
                activeWorkspaceId
            );
        } else if (useStore.getState().nodes.length > 0) {
            // Track a general canvas visit with the first node as representative
            const firstNode = useStore.getState().nodes[0];
            const data = firstNode.data as Record<string, unknown>;
            trackNoteView(
                firstNode.id,
                (data?.title as string) || 'Canvas',
                firstNode.type || 'canvas',
                activeWorkspaceId
            );
        }
    }, [currentParentId, activeParentNode, activeWorkspaceId, trackNoteView]);

    // Drop handlers
    const { onDragOver, onDrop } = useCanvasDrop({
        updateNodeData,
        extractPageFromBlock,
    });

    // Node drag handlers
    const { onNodeDragStart, onNodeDrag, onNodeDragStop } = useCanvasNodeDrag({
        currentParentId,
        setInteractionState,
        setNodes,
        updateNodeData,
        syncParentContent,
    });



    // Cleanup ref on unmount
    useEffect(() => {
        return () => {
            lastDragCheck.current = 0;
        };
    }, []);

    /* Stable handlers so the memoised panels above actually hold: an inline
       arrow would be a new prop every render and defeat the memo. */
    const closeMetadata = useCallback(() => setMetadataOpen(false), [setMetadataOpen]);
    const closeTOC = useCallback(() => setTOCOpen(false), [setTOCOpen]);
    const closeShortcuts = useCallback(() => setShortcutsPanelOpen(false), [setShortcutsPanelOpen]);
    const closeRightPanel = useCallback(() => setRightSidePanelId(null), [setRightSidePanelId]);
    const closeLeftPanel = useCallback(() => setLeftSidePanelId(null), [setLeftSidePanelId]);

    /* Both indicators wait out a short grace period, so a load that returns in
       under ~260ms resolves without anything ever appearing on screen. Neither
       delays its own dismissal: they vanish with the data landing. */
    const showBlockingLoader = useDelayedFlag(cloudLoad.phase === 'blocking');
    const showSyncPill = useDelayedFlag(cloudLoad.phase === 'background');

    return (
        <>
        {/* The shell is frozen only while the blocking overlay is actually on
            screen — a background refresh leaves the canvas fully usable. */}
        <div className={styles.container} inert={showBlockingLoader || undefined} aria-busy={showBlockingLoader}>
            {/* Shell = top bar + framed canvas. It's a separate wrapper because
                the side panels below are in-flow siblings of .container and
                must stay in its row axis. */}
            <div className={styles.shell}>
            <header className={styles.topBar} aria-label="Canvas workspace controls">
                <div className={styles.topBarLeft}>
                    <div className={styles.navGroup} aria-label="Workspace navigation">
                        <HomeButtonM />
                        <HistoryControlsM />
                    </div>
                    <nav className={styles.crumbSlot} aria-label="Canvas location">
                        <BreadcrumbsM />
                    </nav>
                </div>
                    <div className={styles.topBarRight}>
                    <div className={styles.syncGroup} aria-label="Save and sync">
                        <StorageControlsM />
                    </div>
                    <div className={styles.utilityGroup} aria-label="Canvas utilities">
                        <ThemeSwitcherM />
                        <button
                            ref={tocBtnRef}
                            className={`${styles.toolbarBtn} ${isTOCOpen ? styles.toolbarBtnActive : ''}`}
                            onClick={() => setTOCOpen(!isTOCOpen)}
                            data-tooltip={isTOCOpen ? "Close Outline" : "Open Outline"}
                            aria-label={isTOCOpen ? "Close Outline" : "Open Outline"}
                        >
                            <DuotoneIcon icon={ListCollapse} size={18} />
                        </button>
                        <button
                            ref={shortcutsBtnRef}
                            className={`${styles.toolbarBtn} ${isShortcutsPanelOpen ? styles.toolbarBtnActive : ''}`}
                            onClick={() => setShortcutsPanelOpen(!isShortcutsPanelOpen)}
                            data-tooltip={isShortcutsPanelOpen ? "Close Shortcuts" : "Keyboard Shortcuts (K)"}
                            aria-label={isShortcutsPanelOpen ? "Close Keyboard Shortcuts" : "Open Keyboard Shortcuts"}
                        >
                            <DuotoneIcon icon={Keyboard} size={18} />
                        </button>
                        {activeParentNode && (
                            <button
                                ref={metadataBtnRef}
                                className={`${styles.toolbarBtn} ${isMetadataOpen ? styles.toolbarBtnActive : ''}`}
                                onClick={() => setMetadataOpen(!isMetadataOpen)}
                                data-tooltip={isMetadataOpen ? "Close Metadata" : "Open Metadata"}
                                aria-label={isMetadataOpen ? "Close Metadata" : "Open Metadata"}
                            >
                                <DuotoneIcon icon={SlidersHorizontal} size={18} />
                            </button>
                        )}
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
                        /* A card opened in fullscreen or center peek stays mounted
                           on the canvas underneath the overlay — React Flow never
                           unmounts nodes just because they're covered. Without
                           `inert` that card's own BlockEditor is still focusable
                           and typeable, as a second live instance of the same
                           node's content sitting right behind the blur. Any stray
                           focus left over from before the modal opened keeps
                           receiving keystrokes there, which the open pane then
                           silently absorbs through its own external-content merge
                           effect — surfacing as edits that appear to jump between
                           panes. `inert` removes the whole canvas from the tab
                           order and blocks its pointer events for as long as the
                           overlay is up, and — per spec — blurs any focused
                           descendant the moment it's applied, so this closes both
                           the "focus left over from before" and the "tabbed back
                           in during" paths in one attribute. */
                        inert={isCanvasObscured || undefined}
                    >
                        <ReactFlow
                    className={isLinkingMode ? 'is-linking-mode' : ''}
                    nodes={processedNodes}
                    edges={visibleEdges}
                    onNodesChange={onNodesChangeWrapped}
                    onConnect={onConnect}
                    onReconnect={onReconnect}
                    isValidConnection={isValidConnection}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={defaultEdgeOptions}
                    connectionLineComponent={CustomConnectionLine}
                    connectionRadius={150}
                    onNodeMouseEnter={(_, node) => {
                        hoveredNodeRef.current = node;
                    }}
                    onNodeMouseLeave={() => {
                        hoveredNodeRef.current = null;
                    }}
                    onPaneClick={() => {
                        if (isLinkingMode) return;
                        setContextMenu(null);
                        blurActiveEditable();
                        if (isFocusArmedRef.current) setIsFocusArmed(false);
                        clearCanvasSelection();
                    }}
                    onNodeClick={(e, node) => {
                        e.stopPropagation();
                        setContextMenu(null);

                        // If in linking mode, clicking a node establishes it as the main node
                        if (isLinkingMode) {
                            linkSelectedNodes(node.id, Array.from(useStore.getState().selectedCanvasNodeIds));
                            setIsLinkingMode(false);
                            clearCanvasSelection();
                            return;
                        }

                        if (isFocusArmedRef.current) {
                            fitView({ nodes: [node], padding: 0.45, duration: 450, maxZoom: 1.3 });
                            setIsFocusArmed(false);
                        }
                        if (e.shiftKey) {
                            toggleCanvasNodeSelection(node.id);
                            // The selection action updates node.selected atomically.
                        } else {
                            setSelectedCanvasNodeIds(new Set([node.id]));
                        }
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
                    minZoom={MIN_CANVAS_ZOOM}
                    maxZoom={2}
                    snapToGrid={false}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onMove={onViewportMove}
                    onMoveStart={handleMoveStart}
                    onMoveEnd={() => handleMoveEnd()}
                    onSelectionStart={() => {
                        isBoxSelectingRef.current = true;
                        setSelectedEdgeId(null);
                    }}
                    onSelectionEnd={() => {
                        // React Flow publishes the final box result just after
                        // onSelectionEnd. Keep the gate open through that turn,
                        // then close it before ordinary node-click callbacks.
                        requestAnimationFrame(() => {
                            isBoxSelectingRef.current = false;
                        });
                    }}
                    onSelectionChange={({ nodes: selectedNodes }) => {
                        // Skip if we recently updated node.selected —
                        // ReactFlow fires onSelectionChange asynchronously as a side-effect
                        // of receiving new processedNodes, which would revert our selection.
                        if (Date.now() - lastProgrammaticSelectionTimeRef.current < PROGRAMMATIC_SELECTION_GUARD_MS) return;

                        const nextIds = new Set(selectedNodes.map(n => n.id));
                        const currentIds = useStore.getState().selectedCanvasNodeIds;
                        const isSame = nextIds.size === currentIds.size && Array.from(nextIds).every(id => currentIds.has(id));
                        if (isSame) return;

                        /* React Flow deselects the current node on mousedown before
                           a plain click selects the next one, publishing an empty
                           selection in between. Honouring it makes the selection
                           toolbar flash out and back on every click-through. Skip
                           that transient gap and save the empty for changes that
                           genuinely end the selection: box deselection and the
                           deletion of the selected nodes. */
                        if (nextIds.size === 0 && !isBoxSelectingRef.current) {
                            const storeNodes = useStore.getState().nodes;
                            const selectionStillExists = Array.from(currentIds)
                                .some(id => storeNodes.some(n => n.id === id));
                            if (selectionStillExists) return;
                        }

                        setSelectedCanvasNodeIds(nextIds);
                    }}
                    onPointerMove={handlePointerMove}
                    selectionOnDrag={true}
                    panOnDrag={true}
                    selectionKeyCode={isHoveringEditor ? null : "Control"}
                    multiSelectionKeyCode="Shift"
                    selectionMode={SelectionMode.Partial}
                    // Performance optimizations
                    // Unmount cards and connections that are outside the camera.
                    // The note data stays in Zustand; React Flow recreates visual
                    // nodes when they re-enter view.
                    onlyRenderVisibleElements
                    nodesDraggable={!isLinkingMode}
                    nodesConnectable={!isLinkingMode}
                    nodesFocusable={true}
                    edgesFocusable={!isLinkingMode}
                    elementsSelectable={!isLinkingMode}
                    selectNodesOnDrag={false}
                    panOnScroll={true}
                    zoomOnScroll={true}
                    zoomOnPinch={true}
                    zoomOnDoubleClick={false}
                    preventScrolling={false}
                    autoPanOnConnect={false}
                    autoPanOnNodeDrag={false}
                    connectOnClick={false}
                    nodeDragThreshold={0}
                    deleteKeyCode={null}
                    onEdgesDelete={(deletedEdges) => {
                        deletedEdges.forEach(e => {
                            useStore.getState().deleteEdge(e.id);
                        });
                    }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--dot)" />
                    {showFirstCardOffer && (
                        <Panel position="top-center" className={styles.emptyStatePanel}>
                            <section className={styles.emptyState} aria-labelledby="first-card-canvas-title">
                                <p className={styles.emptyEyebrow}>Nested canvas</p>
                                <h2 id="first-card-canvas-title">Ready for its first idea</h2>
                                <p>
                                    Anything you add here belongs inside this card. You can always return to the parent canvas with Alt and Up Arrow.
                                </p>
                                <button type="button" className={styles.emptyStateAction} onClick={createFirstNestedCard}>
                                    <Plus size={17} aria-hidden="true" />
                                    Add a card
                                </button>
                            </section>
                        </Panel>
                    )}
                    {FEATURES.collaboration && <LiveCursors presenceData={presenceData} currentUserId={currentUserId} />}
                    <CanvasSlashMenuM />
                    <DragChipM />
                    {organizationNotice && (
                        <Panel position="top-center" className={styles.organizationNoticePanel}>
                            <div className={styles.organizationNotice}>
                                <span role="status" aria-live="polite">
                                    {organizationNotice.count} nodes organized
                                </span>
                                <button type="button" onClick={undoCanvasOrganization}>Undo</button>
                            </div>
                        </Panel>
                    )}
                    <Panel position="bottom-right" className={styles.bottomRightControls}>
                        {/* No nodeColor/maskColor props: those become SVG presentation
                            attributes that can't read var(). We style .react-flow__minimap-*
                            in index.css instead, where `fill` IS a CSS property and does
                            resolve tokens — so the minimap tracks the live palette and the
                            theme automatically, with no literals to keep in sync (§10). */}
                        <CanvasMiniMap
                            className={styles.canvasMiniMap}
                            nodes={processedNodes}
                        />
                        <Controls className={styles.canvasControls} />
                    </Panel>
                </ReactFlow>
                    </div>
            </div>

            {/* Inside the frame, not the shell: the menu docks against the
                canvas's own edges, so an open side panel narrows the box it
                centres on instead of sliding underneath it. */}
            <BottomMenuM />
            </div>
            </div>

            <MetadataPanelM
                nodeId={activeParentNode?.id}
                isOpen={isMetadataOpen}
                onClose={closeMetadata}
                buttonRef={metadataBtnRef}
            />

            <TableOfContentsPanelM
                isOpen={isTOCOpen}
                onClose={closeTOC}
                buttonRef={tocBtnRef}
            />

            <KeyboardShortcutsPanelM
                isOpen={isShortcutsPanelOpen}
                onClose={closeShortcuts}
                buttonRef={shortcutsBtnRef}
            />

            <AIPanelM />

            <ChunkItPanelM />

            {/* Dual Panel Backdrop (only when both sides are open) */}
            {rightSidePanelId && leftSidePanelId && (
                <div className={styles.dualPanelBackdrop} />
            )}

            {contextMenu && (
                <CanvasContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                />
            )}
            <SidePanelM
                side="right"
                nodeId={rightSidePanelId}
                onClose={closeRightPanel}
            />
            <SidePanelM
                side="left"
                nodeId={leftSidePanelId}
                onClose={closeLeftPanel}
            />
            <FullscreenModalM onCanvasDragOver={onDragOver} onCanvasDrop={onDrop} />
            <CenterModalM onCanvasDragOver={onDragOver} onCanvasDrop={onDrop} />
            {/* Opened from a board card or a calendar chip via `tasksCardId`. */}
            <CardTasksModal />
            <AuthModalM />
            <BranchDeleteConfirmation />
        </div>
        {showBlockingLoader && (
            <WorkspaceLoadOverlay progress={cloudLoad.progress ?? { stage: 'authorizing', value: 0 }} />
        )}
        {showSyncPill && <WorkspaceSyncPill />}
        </>
    );
}
