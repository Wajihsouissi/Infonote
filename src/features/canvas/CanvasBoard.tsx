import { useMemo, useEffect, Suspense, lazy, useRef, useCallback, useState } from 'react';
import {
    ReactFlow,
    Controls,
    MiniMap,
    SelectionMode,
    useReactFlow,
    Panel,
    Background,
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
import { KeyboardShortcutsPanel } from '../ui/KeyboardShortcutsPanel';
import { SlidersHorizontal, ListCollapse, Keyboard } from 'lucide-react';
import { HomeButton } from '../ui/HomeButton';
import { HistoryControls } from '../ui/HistoryControls';
import { ModifierKeyIndicator } from '../ui/ModifierKeyIndicator';
import { KanbanNodeComponent } from '../kanban/KanbanNode';
import { CanvasSlashMenu } from './CanvasSlashMenu';
import { CanvasContextMenu } from './CanvasContextMenu';
import { CloudSyncControls } from './CloudSyncControls';
import { CenteredEdge } from './CenteredEdge';
import { CustomConnectionLine } from './CustomConnectionLine';
import { BASE_UNIT, GRID_GAP } from '../../config/layout';
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
import { useModifierKeys } from '../ui/hooks/useModifierKeys';

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
    const hoveredNodeRef = useRef<any | null>(null);
    const lastInteractedNodeIdRef = useRef<string | null>(null);
    const [justFocused, setJustFocused] = useState(false);
    const justFocusedTimeoutRef = useRef<number | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    // Viewport culling and visible nodes
    const { visibleNodes, handleViewportChange } = useCanvasViewport({
        nodes,
        currentParentId,
    });

    const processedNodes = useMemo(() => {
        return visibleNodes.map(node => {
            const isSelected = selectedCanvasNodeIds.has(node.id);
            const classes = [
                node.className || '',
                isSelected ? 'is-selected' : '',
                isLinkingMode ? 'is-linking-mode' : '',
            ].filter(Boolean).join(' ');
            return {
                ...node,
                className: classes
            };
        });
    }, [visibleNodes, selectedCanvasNodeIds, isLinkingMode]);

    const applySelectedIdsToNodes = useCallback((ids: Set<string>) => {
        setNodes(nds => {
            let changed = false;
            const next = nds.map(n => {
                const shouldBeSelected = ids.has(n.id);
                if (n.selected === shouldBeSelected) return n;
                changed = true;
                return { ...n, selected: shouldBeSelected };
            });
            return changed ? next : nds;
        });
    }, [setNodes]);



    const blurActiveEditable = useCallback(() => {
        // Never blur during/just after a drag — let the editor's cleanup handler restore focus
        if ((window as any).chnkItBlockDragging) return false;
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
                realParentId: nodes.find(og => og.id === n.id)?.parentId,
                pos: n.position
            })));
        }
    }, [currentParentId, visibleNodes, nodes]);

    const addNode = useStore(s => s.addNode);

    // Focus viewport when parent changes
    const { fitView, screenToFlowPosition, getViewport, setViewport, setCenter } = useReactFlow();

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
            if ((window as any).chnkItBlockDragging) return;

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
            if ((window as any).chnkItBlockDragging || document.body.classList.contains('chnk-it-block-dragging')) {
                console.log("[CanvasBoard] Global dragend fallback cleanup executed");
                (window as any).chnkItBlockDragging = false;
                document.body.classList.remove('chnk-it-block-dragging');
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
    const nodesRef = useRef(nodes);

    useEffect(() => {
        selectedCanvasNodeIdsRef.current = selectedCanvasNodeIds;
        nodesRef.current = nodes;
    }, [selectedCanvasNodeIds, nodes]);

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
            let nodesToFocus: any[] = [];

            // Priority 1: Hovered node (immediate context)
            if (hoveredNodeRef.current) {
                const found = nodesRef.current.find(n => n.id === hoveredNodeRef.current.id);
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
            applySelectedIdsToNodes(nextSelectedIds);
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
    }, [addNode, applySelectedIdsToNodes, currentParentId, screenToFlowPosition, setLastCreatedCanvasNodeId, setSelectedCanvasNodeIds]);

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
        ? localStorage.getItem('chnk it.activeWorkspaceId') || '' 
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
                        data-tooltip={isTOCOpen ? "Close Outline" : "Open Outline"}
                        style={{ marginLeft: 6 }}
                    >
                        <ListCollapse size={18} />
                    </button>
                    <button
                        ref={shortcutsBtnRef}
                        className={`${styles.toolbarBtn} ${isShortcutsPanelOpen ? styles.toolbarBtnActive : ''}`}
                        onClick={() => setShortcutsPanelOpen(!isShortcutsPanelOpen)}
                        data-tooltip={isShortcutsPanelOpen ? "Close Shortcuts" : "Keyboard Shortcuts (K)"}
                        style={{ marginLeft: 6 }}
                    >
                        <Keyboard size={18} />
                    </button>
                    {activeParentNode && (
                        <button
                            ref={metadataBtnRef}
                            className={`${styles.toolbarBtn} ${isMetadataOpen ? styles.toolbarBtnActive : ''}`}
                            onClick={() => setMetadataOpen(!isMetadataOpen)}
                            data-tooltip={isMetadataOpen ? "Close Metadata" : "Open Metadata"}
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

                <ModifierKeyIndicator
                    showCtrl={modifierKeys.ctrl}
                    showShift={modifierKeys.shift}
                    showFocus={isFocusArmed}
                    showSuccess={justFocused}
                    suppress={isInEditableField}
                    top={76}
                />


                <ReactFlow
                    className={isLinkingMode ? 'is-linking-mode' : ''}
                    nodes={processedNodes}
                    edges={visibleEdges}
                    onNodesChange={onNodesChange}
                    onConnect={onConnect}
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
                        applySelectedIdsToNodes(new Set());
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
                            applySelectedIdsToNodes(new Set());
                            return;
                        }

                        if (isFocusArmedRef.current) {
                            fitView({ nodes: [node], padding: 0.45, duration: 450, maxZoom: 1.3 });
                            setIsFocusArmed(false);
                        }
                        if (e.shiftKey) {
                            toggleCanvasNodeSelection(node.id);
                            const nextIds = useStore.getState().selectedCanvasNodeIds;
                            applySelectedIdsToNodes(nextIds);
                        } else {
                            const nextIds = new Set([node.id]);
                            setSelectedCanvasNodeIds(nextIds);
                            applySelectedIdsToNodes(nextIds);
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
                    snapToGrid={true}
                    snapGrid={[BASE_UNIT, BASE_UNIT]}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onMove={handleViewportChange}
                    onSelectionStart={() => {
                        isBoxSelectingRef.current = true;
                        setSelectedEdgeId(null);
                    }}
                    onSelectionEnd={() => {
                        isBoxSelectingRef.current = false;
                    }}
                    onSelectionChange={({ nodes: selectedNodes }) => {
                        const nextIds = new Set(selectedNodes.map(n => n.id));
                        const currentIds = useStore.getState().selectedCanvasNodeIds;
                        const isSame = nextIds.size === currentIds.size && Array.from(nextIds).every(id => currentIds.has(id));
                        if (!isSame) {
                            setSelectedCanvasNodeIds(nextIds);
                        }
                    }}
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
                    deleteKeyCode={['Delete', 'Backspace']}
                    onNodesDelete={(deletedNodes) => {
                        const ids = deletedNodes.map(n => n.id);
                        if (ids.length > 0) {
                            useStore.getState().bulkDeleteNodes(ids);
                        }
                    }}
                    onEdgesDelete={(deletedEdges) => {
                        deletedEdges.forEach(e => {
                            useStore.getState().deleteEdge(e.id);
                        });
                    }}
                >
                    <CanvasSlashMenu />
                    <Background variant="dots" gap={BASE_UNIT} offset={-GRID_GAP / 2} size={1.5} color="var(--color-border)" style={{ opacity: 0.8 }} />
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

            <KeyboardShortcutsPanel
                isOpen={isShortcutsPanelOpen}
                onClose={() => setShortcutsPanelOpen(false)}
                buttonRef={shortcutsBtnRef}
            />

            {/* Dual Panel Backdrop (only when both sides are open) */}
            {rightSidePanelId && leftSidePanelId && (
                <div className={styles.dualPanelBackdrop} />
            )}

            <BottomMenu />
            {contextMenu && (
                <CanvasContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                />
            )}
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
            <FullscreenModal onCanvasDragOver={onDragOver} onCanvasDrop={onDrop} />
            <CenterModal onCanvasDragOver={onDragOver} onCanvasDrop={onDrop} />
            <AuthModal />
            <Suspense fallback={null}>
                <KanbanConfigModal />
            </Suspense>
        </div>
    );
}
