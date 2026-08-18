import { memo, useMemo, useEffect, Suspense, lazy, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FEATURES } from '../../config/featureFlags';
import {
    ReactFlow,
    Controls,
    MiniMap,
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
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { BottomMenu } from '../ui/BottomMenu';
import { SidePanel } from '../ui/SidePanel';
import { FullscreenModal } from '../ui/FullscreenModal';
import { CenterModal } from '../ui/CenterModal';
import { MetadataPanel } from '../ui/MetadataPanel';
import { TableOfContentsPanel } from '../ui/TableOfContentsPanel';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { StorageControls } from '../ui/StorageControls';
import { KeyboardShortcutsPanel } from '../ui/KeyboardShortcutsPanel';
import { AIPanel } from '../ai/AIPanel';
import { SlidersHorizontal, ListCollapse, Keyboard } from '../../components/icons';
import { DuotoneIcon } from '../../components/ui/DuotoneIcon';
import { HomeButton } from '../ui/HomeButton';
import { HistoryControls } from '../ui/HistoryControls';
import { ModifierKeyIndicator } from '../ui/ModifierKeyIndicator';

import { CanvasSlashMenu } from './CanvasSlashMenu';
import { DragChip } from './DragChip';
import { CanvasContextMenu } from './CanvasContextMenu';

import { CenteredEdge } from './CenteredEdge';
import { CustomConnectionLine } from './CustomConnectionLine';
import { ChunkItModal } from '../card/ChunkItModal';
import { AuthModal } from '../auth/AuthModal';
import { useStore } from '../../store/useStore';
import type { AppNode } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { isUrl, parseFiles, parseTextOrHtml } from '../editor/pasteUtils';
import { endBlockDrag } from '../editor/blockDragLock';
import { loadCanvasFromCloud } from '../../services/cloudSync';
import { isSupabaseConfigured, supabase } from '../../services/supabase/client';

// Hooks
import { setStreaming } from './hooks/lodStore';
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
const ChunkItModalM = memo(ChunkItModal);
const BottomMenuM = memo(BottomMenu);
const SidePanelM = memo(SidePanel);
const FullscreenModalM = memo(FullscreenModal);
const CenterModalM = memo(CenterModal);
const AuthModalM = memo(AuthModal);
const CanvasSlashMenuM = memo(CanvasSlashMenu);
const DragChipM = memo(DragChip);

export function CanvasBoard() {
    // Store selectors and actions
    const {
        edges,
        currentParentId,
        selectedCanvasNodeIds,
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
    const loadedCloudWorkspaceRef = useRef<string | null>(null);
    const authUserId = useStore(s => s.auth.userId);
    const activeWorkspaceId = useStore(s => s.auth.activeWorkspaceId);
    const isAuthenticated = useStore(s => s.auth.isAuthenticated);
    const loadGraph = useStore(s => s.loadGraph);
    const setCloudLastSaved = useStore(s => s.setCloudLastSaved);
    const setCloudDirty = useStore(s => s.setCloudDirty);
    const setCloudError = useStore(s => s.setCloudError);

    // Realtime Sync Hook
    const { presenceData, updateCursor, broadcastNodeChange, currentUserId } = useRealtimeSync(currentParentId);

    // Viewport culling and visible nodes
    /* Detail streams in when the gesture stops rather than during it: promoting
       a row of cards to a richer tier mid-pan is what makes the drag stutter. */
    const handleMoveStart = useCallback(() => setStreaming(true), []);
    const handleMoveEnd = useCallback(() => setStreaming(false), []);

    const { visibleNodes, handleViewportChange } = useCanvasViewport({
        currentParentId,
    });

    const processedNodes = useMemo(() => {
        return visibleNodes.map(node => {
            const isSelected = selectedCanvasNodeIds.has(node.id);
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
    }, [visibleNodes, selectedCanvasNodeIds, isLinkingMode]);

    // Sync node.selected into the store whenever selectedCanvasNodeIds changes.
    // This is what React Flow reads to decide which nodes join a multi-drag.
    //
    // CRITICAL: We use useStore.setState directly instead of setNodes because
    // setNodes unconditionally calls setCloudDirty(true), which triggers the
    // useStore.subscribe delta-tracker. That tracker diffs nodes by reference,
    // finds "changed" objects (because we create new objects with flipped
    // `selected`), and calls markNodesDirty → further store updates →
    // onSelectionChange re-fires → new Set → this effect re-runs → infinite loop.
    //
    // The `selected` flag is purely a UI concern and must NOT mark the cloud dirty.
    useEffect(() => {
        const currentNodes = useStore.getState().nodes;
        let needsUpdate = false;
        for (const n of currentNodes) {
            if (!!n.selected !== selectedCanvasNodeIds.has(n.id)) {
                needsUpdate = true;
                break;
            }
        }
        if (!needsUpdate) return;

        // Record timestamp so onSelectionChange ignores ReactFlow's callback
        // that fires as an async side-effect of us changing nodes.
        lastProgrammaticSelectionTimeRef.current = Date.now();

        // Direct setState bypasses setNodes → setCloudDirty chain
        const nextNodes = currentNodes.map(n => {
            const shouldBeSelected = selectedCanvasNodeIds.has(n.id);
            if (!!n.selected === shouldBeSelected) return n;
            return { ...n, selected: shouldBeSelected };
        });
        useStore.setState({ nodes: nextNodes as AppNode[] });
    }, [selectedCanvasNodeIds]);



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

    // Focus viewport when parent changes
    const { fitView, screenToFlowPosition, getViewport, setViewport, setCenter } = useReactFlow();

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
       re-render of every visible node. handleViewportChange can't carry it: that
       one is throttled and skips small moves, and the size has to track the wheel
       exactly or the buttons visibly jump. */
    const publishZoom = useCallback(() => {
        document.documentElement.style.setProperty('--rf-zoom', String(getViewportRef.current().zoom));
    }, []);

    const onViewportMove = useCallback(() => {
        publishZoom();
        handleViewportChange();
    }, [publishZoom, handleViewportChange]);

    // fitView on mount settles the viewport without ever firing onMove.
    useEffect(() => {
        publishZoom();
    }, [publishZoom, currentParentId, visibleNodes.length]);

    /* Presence cursors ride on pointermove, which fires far faster than any
       collaborator can perceive — and during a node drag it fires on the same
       events that are already moving a card. Sample it instead: ~20/s, and not
       at all mid-drag, where the moving card is the message. */
    const lastCursorPush = useRef(0);
    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (useStore.getState().interactionState.draggedNodeId) return;
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
                newZoom = Math.max(0.05, zoom / zoomFactorPerFrame);
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
                if (selectedCanvasNodeIds.size >= 2) {
                    setIsLinkingMode(!isLinkingMode);
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                if (selectedCanvasNodeIds.size > 0) {
                    bulkDuplicateNodes(Array.from(selectedCanvasNodeIds));
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
    }, [isInEditableField, fitView, isShortcutsPanelOpen, setShortcutsPanelOpen, selectedCanvasNodeIds, setIsLinkingMode, isLinkingMode, bulkDuplicateNodes]);

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

    const selectedCanvasNodeIdsRef = useRef(selectedCanvasNodeIds);
    // Sync node selection to ReactFlow when changed externally
    const nodesRef = useRef(useStore.getState().nodes);
    useEffect(() => {
        selectedCanvasNodeIdsRef.current = selectedCanvasNodeIds;
        nodesRef.current = useStore.getState().nodes;
    }, [selectedCanvasNodeIds]); // Use selectedCanvasNodeIds as a proxy to keep ref roughly updated since it doesn't trigger re-renders now on drag

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

            // If we found nodes to focus, center/zoom them instantly!
            if (nodesToFocus.length > 0) {
                fitView({ nodes: nodesToFocus, padding: 0.45, duration: 450, maxZoom: 1.3 });
                clearArm();

                // Show success visual HUD notification
                if (justFocusedTimeoutRef.current) {
                    window.clearTimeout(justFocusedTimeoutRef.current);
                }
                setJustFocused(true);
                justFocusedTimeoutRef.current = window.setTimeout(() => {
                    setJustFocused(false);
                    justFocusedTimeoutRef.current = null;
                }, 1500);

                return;
            }

            // Fallback: If no selected/hovered/clicked nodes, toggle/arm focusing for the next mouse click
            if (isFocusArmedRef.current) {
                clearArm();
                return;
            }
            armForNextClick();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('blur', clearArm);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('blur', clearArm);
            if (focusArmTimeoutRef.current) {
                window.clearTimeout(focusArmTimeoutRef.current);
            }
            if (justFocusedTimeoutRef.current) {
                window.clearTimeout(justFocusedTimeoutRef.current);
            }
        };
    }, [isInEditableField, fitView]);

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
            const target = e.target as HTMLElement;
            const isEditable = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                target.closest('[contenteditable]') ||
                target.closest('[class*="BlockEditor"]') ||
                target.closest('[class*="editor"]');
    
            if (isEditable) return;

            let parsedBlocks: any[] = [];
            const files = e.clipboardData?.files;
    
            if (files && files.length > 0) {
                e.preventDefault();
                parsedBlocks = await parseFiles(files);
            } else {
                const text = e.clipboardData?.getData('text/plain')?.trim();
                const html = e.clipboardData?.getData('text/html');
                if (!text && !html) return;
                e.preventDefault();
                // Create a synthetic React-like event for parseTextOrHtml
                parsedBlocks = parseTextOrHtml({ clipboardData: e.clipboardData } as any);
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
    }, [addNode, currentParentId, screenToFlowPosition, setSelectedCanvasNodeIds]);

    // Native context menu handler (bypasses ReactFlow's right-click pan handling)
    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const isPane = target.closest('.react-flow__pane');
            const isNode = target.closest('.react-flow__node');
            if (!isPane || isNode) return;

            // Don't show context menu when inside an editable field
            const isEditable = !!target.closest('[contenteditable]') ||
                !!target.closest('[class*="BlockEditor"]') ||
                !!target.closest('input, textarea');
            if (isEditable) return;

            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY });
        };

        document.addEventListener('contextmenu', handleContextMenu, { capture: true });
        return () => document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    }, []);

    useEffect(() => {
        if (visibleNodes.length > 0) {
            const timer = setTimeout(() => {
                fitView({ duration: 400, padding: 0.2, minZoom: 0.5, maxZoom: 1 });
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [currentParentId]);

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
    const isValidConnection = useCallback((connection: Edge | Connection) => {
        return connection.source !== connection.target;
    }, []);

    // Active parent node for metadata display
    const activeParentNode = useStore(useCallback(s =>
        currentParentId ? s.nodes.find(n => n.id === currentParentId) : null,
        [currentParentId]
    ));

    useEffect(() => {
        if (!isSupabaseConfigured || !isAuthenticated || !authUserId || !activeWorkspaceId) return;
        const loadKey = `${authUserId}:${activeWorkspaceId}`;
        if (loadedCloudWorkspaceRef.current === loadKey) return;
        loadedCloudWorkspaceRef.current = loadKey;

        let cancelled = false;
        (async () => {
            setCloudError(null);
            const result = await loadCanvasFromCloud(authUserId, activeWorkspaceId);
            if (cancelled) return;
            if (result.ok) {
                const state = useStore.getState();
                if (result.nodes.length === 0 && state.nodes.length > 0) {
                    // Empty cloud must never wipe existing local work — e.g. an
                    // anonymous canvas restored from the IndexedDB snapshot right
                    // before sign-in, or a brand-new workspace. Keep the local
                    // canvas and mark everything dirty so auto-sync pushes it up
                    // to the empty cloud instead.
                    state.markNodesDirty(state.nodes.map(n => n.id));
                    state.markEdgesDirty(state.edges.map(e => e.id));
                    setCloudDirty(true);
                    return;
                }
                loadGraph(result.nodes, result.edges);
                setCloudLastSaved(new Date().toLocaleTimeString());
                setCloudDirty(false);
                setCloudError(null);
            } else {
                loadedCloudWorkspaceRef.current = null;
                setCloudError(result.error);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [authUserId, activeWorkspaceId, isAuthenticated, loadGraph, setCloudLastSaved, setCloudDirty, setCloudError]);

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

                const result = await loadCanvasFromCloud(authUserId, activeWorkspaceId);
                if (cancelled) return;
                if (result.ok) {
                    // Local is clean here (checked above), so a non-empty local
                    // canvas should match the cloud. An empty result against
                    // non-empty local is almost certainly a transient glitch —
                    // skip rather than wipe the canvas.
                    if (result.nodes.length === 0 && useStore.getState().nodes.length > 0) return;
                    loadGraph(result.nodes, result.edges);
                    setCloudLastSaved(new Date().toLocaleTimeString());
                    setCloudDirty(false);
                    setCloudError(null);
                } else {
                    setCloudError(result.error);
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
            void supabase.removeChannel(channel);
        };
    }, [authUserId, activeWorkspaceId, isAuthenticated, loadGraph, setCloudLastSaved, setCloudDirty, setCloudError]);

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
        selectedCanvasNodeIds,
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

    return (
        <div className={styles.container}>
            {/* Shell = top bar + framed canvas. It's a separate wrapper because
                the side panels below are in-flow siblings of .container and
                must stay in its row axis. */}
            <div className={styles.shell}>
            <header className={styles.topBar}>
                <div className={styles.topBarLeft}>
                    <HomeButtonM />
                    <div className={styles.topBarSeparator} />
                    <HistoryControlsM />
                    <div className={styles.crumbSlot}>
                        <BreadcrumbsM />
                    </div>
                </div>
                <div className={styles.topBarRight}>
                    <StorageControlsM />
                    <div className={styles.topBarSeparator} />
                    <ThemeSwitcherM />
                    <button
                        ref={tocBtnRef}
                        className={`${styles.toolbarBtn} ${isTOCOpen ? styles.toolbarBtnActive : ''}`}
                        onClick={() => setTOCOpen(!isTOCOpen)}
                        data-tooltip={isTOCOpen ? "Close Outline" : "Open Outline"}
                    >
                        <DuotoneIcon icon={ListCollapse} size={18} />
                    </button>
                    <button
                        ref={shortcutsBtnRef}
                        className={`${styles.toolbarBtn} ${isShortcutsPanelOpen ? styles.toolbarBtnActive : ''}`}
                        onClick={() => setShortcutsPanelOpen(!isShortcutsPanelOpen)}
                        data-tooltip={isShortcutsPanelOpen ? "Close Shortcuts" : "Keyboard Shortcuts (K)"}
                    >
                        <DuotoneIcon icon={Keyboard} size={18} />
                    </button>
                    {activeParentNode && (
                        <button
                            ref={metadataBtnRef}
                            className={`${styles.toolbarBtn} ${isMetadataOpen ? styles.toolbarBtnActive : ''}`}
                            onClick={() => setMetadataOpen(!isMetadataOpen)}
                            data-tooltip={isMetadataOpen ? "Close Metadata" : "Open Metadata"}
                        >
                            <DuotoneIcon icon={SlidersHorizontal} size={18} />
                        </button>
                    )}
                </div>
            </header>

            <div className={styles.canvasFrame}>
            <div className={styles.canvasArea}>
                <ModifierKeyIndicatorM
                    showCtrl={modifierKeys.ctrl}
                    showShift={modifierKeys.shift}
                    showFocus={isFocusArmed}
                    showSuccess={justFocused}
                    suppress={isInEditableField}
                    top={20}
                />

                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentParentId || 'root'}
                        initial={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 1.02, filter: 'blur(4px)' }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
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
                        setSelectedEdgeId(null);
                        clearCanvasSelection();
                    }}
                    onNodeClick={(e, node) => {
                        e.stopPropagation();
                        setContextMenu(null);
                        setSelectedEdgeId(null);

                        // If in linking mode, clicking a node establishes it as the main node
                        if (isLinkingMode) {
                            linkSelectedNodes(node.id, Array.from(selectedCanvasNodeIds));
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
                            // processedNodes derives node.selected from selectedCanvasNodeIds automatically
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
                    minZoom={0.05}
                    maxZoom={2}
                    snapToGrid={false}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onMove={onViewportMove}
                    onMoveStart={handleMoveStart}
                    onMoveEnd={handleMoveEnd}
                    onSelectionStart={() => {
                        isBoxSelectingRef.current = true;
                        setSelectedEdgeId(null);
                    }}
                    onSelectionEnd={() => {
                        isBoxSelectingRef.current = false;
                    }}
                    onSelectionChange={({ nodes: selectedNodes }) => {
                        // Skip if we recently updated node.selected —
                        // ReactFlow fires onSelectionChange asynchronously as a side-effect
                        // of receiving new processedNodes, which would revert our selection.
                        if (Date.now() - lastProgrammaticSelectionTimeRef.current < 50) return;

                        const nextIds = new Set(selectedNodes.map(n => n.id));
                        const currentIds = useStore.getState().selectedCanvasNodeIds;
                        const isSame = nextIds.size === currentIds.size && Array.from(nextIds).every(id => currentIds.has(id));
                        if (!isSame) {
                            setSelectedCanvasNodeIds(nextIds);
                        }
                    }}
                    onPointerMove={handlePointerMove}
                    selectionOnDrag={true}
                    panOnDrag={true}
                    selectionKeyCode={isHoveringEditor ? null : "Control"}
                    multiSelectionKeyCode="Shift"
                    selectionMode={SelectionMode.Partial}
                    // Performance optimizations
                    nodesDraggable={!isLinkingMode}
                    nodesConnectable={!isLinkingMode}
                    nodesFocusable={false}
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
                    deleteKeyCode={['Delete', 'Backspace']}
                    onNodesDelete={(deletedNodes) => {
                        const ids = deletedNodes.map(n => n.id);
                        if (ids.length > 0) {
                            // React Flow already committed the removal; prompting here can't cancel it.
                            useStore.getState().bulkDeleteNodes(ids, true);
                        }
                    }}
                    onEdgesDelete={(deletedEdges) => {
                        deletedEdges.forEach(e => {
                            useStore.getState().deleteEdge(e.id);
                        });
                    }}
                >
                    {FEATURES.collaboration && <LiveCursors presenceData={presenceData} currentUserId={currentUserId} />}
                    <CanvasSlashMenuM />
                    <DragChipM />
                    <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--dot)" />
                    <Panel position="top-center">

                    </Panel>
                    <Panel position="bottom-right" className={styles.bottomRightControls}>
                        {/* No nodeColor/maskColor props: those become SVG presentation
                            attributes that can't read var(). We style .react-flow__minimap-*
                            in index.css instead, where `fill` IS a CSS property and does
                            resolve tokens — so the minimap tracks the live palette and the
                            theme automatically, with no literals to keep in sync (§10). */}
                        <MiniMap
                            className={styles.canvasMiniMap}
                            style={{ width: 160, height: 116 }}
                        />
                        <Controls className={styles.canvasControls} />
                    </Panel>
                </ReactFlow>
                    </motion.div>
                </AnimatePresence>
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

            <ChunkItModalM />

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
            <AuthModalM />
        </div>
    );
}
