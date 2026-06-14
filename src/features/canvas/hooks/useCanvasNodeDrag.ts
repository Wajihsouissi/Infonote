import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useReactFlow } from '@xyflow/react';
import type { AppNode } from '../../../types';
import { snapToGridValue, snapFusedDimensions, MAX_HEIGHT } from '../../../config/layout';

// A single source of truth for what a node-drag will do on release. Computed once per
// drag tick and consumed verbatim on drop, so the highlight the user sees always matches
// the action that runs (no second, divergent detection pass on drop).
interface PendingDrop {
    targetId: string;
    action: 'fusion' | 'nesting';
    insertBlockId: string | null;
    insertPosition: 'top' | 'bottom';
}

interface UseCanvasNodeDragOptions {
    nodes: AppNode[];
    currentParentId: string | null;
    setInteractionState: (state: any) => void;
    setNodes: (updater: (nodes: AppNode[]) => AppNode[]) => void;
    updateNodeData: (id: string, data: any) => void;
    syncParentContent: (parentId: string) => void;
    selectedCanvasNodeIds: Set<string>;
}

/**
 * Hook that handles all node drag interactions on the canvas.
 * Manages drag start, drag move, and drag stop with fusion/nesting/kanban logic.
 */
export function useCanvasNodeDrag({
    nodes,
    currentParentId,
    setInteractionState,
    setNodes,
    updateNodeData,
    syncParentContent,
    selectedCanvasNodeIds,
}: UseCanvasNodeDragOptions) {
    const { screenToFlowPosition, getIntersectingNodes, getNode, getViewport } = useReactFlow();

    // Throttling and state Refs
    const lastDragCheck = useRef(0);
    const lastHighlightedBlockRef = useRef<HTMLElement | null>(null);
    const activeDropTargetRef = useRef<any>(null);
    const activeKanbanColumnRef = useRef<any>(null);
    // The complete fusion/nesting decision for the current drag, reused on drop.
    const pendingDropRef = useRef<PendingDrop | null>(null);
    // Whether the dragged node is currently hidden (swapped for the cursor chip). True only
    // while hovering a fusion/nesting target, so free repositioning keeps the normal node.
    const isSourceHiddenRef = useRef(false);

    // Add/remove the hide class on the dragged node as it enters/leaves a drop target.
    const setSourceHidden = useCallback((nodeId: string, hidden: boolean) => {
        if (hidden === isSourceHiddenRef.current) return;
        isSourceHiddenRef.current = hidden;
        setNodes(nds => nds.map(n => {
            if (n.id !== nodeId) return n;
            const cls = n.className ?? '';
            const has = cls.includes('chnk-it-drag-source');
            if (hidden && !has) return { ...n, className: `${cls} chnk-it-drag-source`.trim() };
            if (!hidden && has) return { ...n, className: cls.replace('chnk-it-drag-source', '').replace(/\s+/g, ' ').trim() };
            return n;
        }));
    }, [setNodes]);

    // Move the between-blocks insertion line to a specific block element (or clear it).
    const setDropLine = useCallback((blockEl: HTMLElement | null, position: 'top' | 'bottom') => {
        const prev = lastHighlightedBlockRef.current;
        if (prev && prev !== blockEl) prev.removeAttribute('data-external-drop-target');
        if (blockEl) {
            blockEl.setAttribute('data-external-drop-target', position);
            lastHighlightedBlockRef.current = blockEl;
        } else {
            lastHighlightedBlockRef.current = null;
        }
    }, []);

    // Single, centralized cleanup for every drop indicator left in the DOM.
    const clearDropIndicators = useCallback(() => {
        lastHighlightedBlockRef.current = null;
        document.querySelectorAll('[data-external-drop-target]').forEach(el => {
            (el as HTMLElement).removeAttribute('data-external-drop-target');
        });
    }, []);

    const onNodeDragStart = useCallback((_event: React.MouseEvent, node: any) => {
        // Multi-drag = the grabbed node is part of a selection of 2+. React Flow's own
        // getDragItems uses node.selected to decide who moves; we mirror that exactly.
        const isMultiDrag = selectedCanvasNodeIds.size > 1 && selectedCanvasNodeIds.has(node.id);

        setInteractionState({
            draggedNodeId: node.id,
            isMultiDragging: isMultiDrag,
        });
        activeDropTargetRef.current = null;
        activeKanbanColumnRef.current = null;
        pendingDropRef.current = null;
        isSourceHiddenRef.current = false;
        clearDropIndicators();

        // Two distinct body classes so single-drag and multi-drag can style independently:
        //   chnk-it-node-dragging  — base flag for cursor + general grabbing UX
        //   chnk-it-multi-drag     — only during multi-drag; targets every selected card
        document.body.classList.add('chnk-it-node-dragging');
        if (isMultiDrag) document.body.classList.add('chnk-it-multi-drag');
    }, [setInteractionState, clearDropIndicators, selectedCanvasNodeIds]);

    const onNodeDrag = useCallback((event: React.MouseEvent, node: any) => {
        // Multi-drag is pure repositioning — no fusion, no nesting, no kanban targeting.
        // Short-circuit before any hit-testing so the group glides cleanly under the cursor.
        if (selectedCanvasNodeIds.size > 1 && selectedCanvasNodeIds.has(node.id)) {
            return;
        }

        // Throttle for smoother grid response (approx 30fps)
        const now = Date.now();
        if (now - lastDragCheck.current < 32) {
            return;
        }
        lastDragCheck.current = now;

        const { zoom } = getViewport();
        // Constant 16px screen-space hover checking size, scaled to flow space
        const checkSize = Math.max(2, 16 / zoom);

        const mousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const mouseRect = { 
            x: mousePos.x - checkSize / 2, 
            y: mousePos.y - checkSize / 2, 
            width: checkSize, 
            height: checkSize 
        };
        const intersections = getIntersectingNodes(mouseRect as any);

        const targetKanban = intersections.find(n => n.type === 'kanban');
        const targetOther = intersections.find(n =>
            n.id !== node.id && (n.type === 'note' || n.type === 'fused-note' || n.type === 'block')
        );

        let newDropTarget: { id: string; type: 'fusion' | 'nesting' | 'kanban-column' } | null = null;

        // Priority 1: Kanban Column
        if (targetKanban && node.type === 'note') {
            const kanbanData = targetKanban.data as any;
            const currentColumns = kanbanData.columns;

            if (currentColumns && currentColumns.length > 0) {
                const boardWidth = targetKanban.measured?.width ?? (targetKanban.style?.width as number) ?? 800;
                const relativeX = node.position.x - targetKanban.position.x;
                const visualColWidth = (boardWidth - 48 - (20 * (currentColumns.length - 1))) / currentColumns.length;
                const gap = 20;
                const padding = 24;
                const totalStep = visualColWidth + gap;

                let colIndex = Math.floor((relativeX - padding + (gap / 2)) / totalStep);
                if (colIndex < 0) colIndex = 0;
                if (colIndex >= currentColumns.length) colIndex = currentColumns.length - 1;

                const targetCol = currentColumns[colIndex];

                newDropTarget = {
                    id: targetKanban.id,
                    type: 'kanban-column'
                };

                const lastKanbanCol = activeKanbanColumnRef.current;
                if (
                    lastKanbanCol?.kanbanId !== targetKanban.id ||
                    lastKanbanCol?.columnId !== targetCol.statusValue
                ) {
                    const nextKanbanCol = {
                        kanbanId: targetKanban.id,
                        columnId: targetCol.statusValue
                    };
                    activeKanbanColumnRef.current = nextKanbanCol;
                    activeDropTargetRef.current = newDropTarget;

                    setInteractionState({
                        hoveredKanbanColumn: nextKanbanCol,
                        dropTarget: newDropTarget
                    });
                }
                // Over a kanban column: there's no fusion/nesting in play.
                pendingDropRef.current = null;
                clearDropIndicators();
                return;
            }
        }

        // Clear Kanban hover if not hovering kanban anymore
        if (!targetKanban && activeKanbanColumnRef.current) {
            activeKanbanColumnRef.current = null;
            setInteractionState({ hoveredKanbanColumn: null });
        }

        // Priority 2: Fusion or Nesting (single decision used verbatim on drop)
        if (targetOther) {
            const isSourceBlock = node.type === 'block';
            const isSourceFused = node.type === 'fused-note';
            const isSourceNote = node.type === 'note';

            const isTargetBlock = targetOther.type === 'block';
            const isTargetFused = targetOther.type === 'fused-note';
            const isTargetNote = targetOther.type === 'note';

            if ((isTargetBlock || isTargetFused) && (isSourceBlock || isSourceFused)) {
                newDropTarget = { id: targetOther.id, type: 'fusion' };
            } else if (isTargetNote && (isSourceFused || isSourceNote || isSourceBlock)) {
                newDropTarget = { id: targetOther.id, type: 'nesting' };
            }

            if (newDropTarget) {
                // Which of the target's blocks would we insert next to? The dragged node is
                // pointer-events:none during drag (global CSS), so elementsFromPoint returns the
                // TARGET's blocks rather than the dragged node's overlay.
                const elementsUnderCursor = document.elementsFromPoint(event.clientX, event.clientY);
                const blockElement = elementsUnderCursor.find(el => el.id && el.id.startsWith('block-')) as HTMLElement | undefined;

                let insertBlockId: string | null = null;
                let insertPosition: 'top' | 'bottom' = 'bottom';
                if (blockElement) {
                    const rect = blockElement.getBoundingClientRect();
                    const midY = rect.top + (rect.height / 2);
                    insertPosition = event.clientY < midY ? 'top' : 'bottom';
                    insertBlockId = blockElement.id.replace('block-', '');
                    setDropLine(blockElement, insertPosition);
                } else {
                    setDropLine(null, 'bottom');
                }

                pendingDropRef.current = {
                    targetId: newDropTarget.id,
                    action: newDropTarget.type as 'fusion' | 'nesting',
                    insertBlockId,
                    insertPosition,
                };
            } else {
                pendingDropRef.current = null;
                setDropLine(null, 'bottom');
            }
        } else {
            pendingDropRef.current = null;
            setDropLine(null, 'bottom');
        }

        const lastDropTarget = activeDropTargetRef.current;
        if (lastDropTarget?.id !== newDropTarget?.id ||
            lastDropTarget?.type !== newDropTarget?.type) {
            activeDropTargetRef.current = newDropTarget;
            setInteractionState({ dropTarget: newDropTarget });
        }

        // Swap the node for the cursor chip while over a fusion/nesting target.
        // Multi-drag never reaches here — it short-circuits at the top of this callback.
        setSourceHidden(node.id, !!newDropTarget);
    }, [getIntersectingNodes, setInteractionState, screenToFlowPosition, getViewport, setDropLine, clearDropIndicators, setSourceHidden, selectedCanvasNodeIds]);

    const onNodeDragStop = useCallback((event: React.MouseEvent, node: any) => {
        // The exact fusion/nesting decision that was shown to the user during the drag.
        const pending = pendingDropRef.current;
        const hoveredColumn = activeKanbanColumnRef.current;
        const isMultiDrag = selectedCanvasNodeIds.size > 1 && selectedCanvasNodeIds.has(node.id);

        // Clear interaction states + every drop indicator (single, centralized cleanup)
        setInteractionState({
            hoveredKanbanColumn: null,
            draggedNodeId: null,
            isMultiDragging: false,
            dropTarget: null
        });
        activeDropTargetRef.current = null;
        activeKanbanColumnRef.current = null;
        pendingDropRef.current = null;
        isSourceHiddenRef.current = false;
        clearDropIndicators();
        document.body.classList.remove('chnk-it-node-dragging');
        document.body.classList.remove('chnk-it-multi-drag');

        // Reveal the dragged node(s) again (drop the drag-chip hide class). Runs before the
        // branch updates below, which spread the now-cleaned node.
        setNodes(nds => nds.map(n => (n.className && n.className.includes('chnk-it-drag-source'))
            ? { ...n, className: n.className.replace('chnk-it-drag-source', '').replace(/\s+/g, ' ').trim() }
            : n));

        // Snap the node (or the whole group) to grid and restore z-index.
        // For multi-drag we use GROUP-DELTA snapping: compute the nudge that snaps the
        // primary node, then apply the exact same dx/dy to every other node in the group
        // so relative positions are preserved perfectly.
        const snapSingleNode = () => {
            setNodes(nds => nds.map(n => {
                if (n.id !== node.id) return n;
                return {
                    ...n,
                    zIndex: 10,
                    extent: n.parentId ? 'parent' : undefined,
                    position: {
                        x: snapToGridValue(n.position.x),
                        y: snapToGridValue(n.position.y),
                    },
                };
            }));
        };

        const snapGroupNodes = () => {
            // Anchor the snap to the primary dragged node so all others shift by the same delta.
            const dx = snapToGridValue(node.position.x) - node.position.x;
            const dy = snapToGridValue(node.position.y) - node.position.y;
            setNodes(nds => nds.map(n => {
                if (!selectedCanvasNodeIds.has(n.id)) return n;
                return {
                    ...n,
                    zIndex: 10,
                    extent: n.parentId ? 'parent' : undefined,
                    position: { x: n.position.x + dx, y: n.position.y + dy },
                };
            }));
        };

        const isSourceBlock = node.type === 'block';
        const isSourceFused = node.type === 'fused-note';
        const isSourceNote = node.type === 'note';

        // Multi-drag: skip fusion/nesting/kanban — snap as a group and return.
        if (isMultiDrag) {
            snapGroupNodes();
            if (currentParentId) syncParentContent(currentParentId);
            return;
        }

        // Kanban column placement (note → kanban)
        if (hoveredColumn && isSourceNote) {
            const targetKanban = getNode(hoveredColumn.kanbanId);

            if (targetKanban) {
                const kanbanData = targetKanban.data as any;
                const targetCol = kanbanData.columns.find((c: any) => c.statusValue === hoveredColumn.columnId);

                if (targetCol) {
                    const newStatus = targetCol.statusValue;
                    const GAP = 16;
                    const HEADER_OFFSET = 130;

                    const columnSiblings = nodes.filter(n => {
                        if (n.type !== 'note') return false;
                        if (n.parentId !== targetKanban.id) return false;
                        if (n.id === node.id) return false;
                        const d = n.data as any;
                        return d.status === newStatus;
                    });

                    columnSiblings.sort((a, b) => a.position.y - b.position.y);
                    const lastSibling = columnSiblings[columnSiblings.length - 1];

                    const colIndex = kanbanData.columns.findIndex((c: any) => c.statusValue === newStatus);
                    const exactColWidth = ((targetKanban.measured?.width ?? 800) - 48 - (20 * (kanbanData.columns.length - 1))) / kanbanData.columns.length;

                    let targetWidth = 112;
                    let targetHeight = 112;
                    let targetViewMode = 'icon';

                    const canFitMedium = exactColWidth >= 240;
                    const currentNodeWidth = node.style?.width as number || 112;

                    if (canFitMedium && currentNodeWidth >= 224) {
                        targetWidth = 224;
                        targetHeight = 224;
                        targetViewMode = 'medium';
                    }

                    const colXOffset = 24 + (colIndex * (exactColWidth + 20));
                    const centeredX = colXOffset + (exactColWidth - targetWidth) / 2;

                    let nextY = HEADER_OFFSET;
                    if (lastSibling) {
                        const lastSiblingH = (lastSibling.style?.height as number) || 112;
                        nextY = lastSibling.position.y + lastSiblingH + GAP;
                    }

                    setNodes((nds: AppNode[]) => nds.map((n: AppNode) => {
                        if (n.id === node.id) {
                            return {
                                ...n,
                                parentId: targetKanban.id,
                                extent: 'parent',
                                zIndex: 1001,
                                position: { x: centeredX, y: nextY },
                                style: { ...n.style, width: targetWidth, height: targetHeight },
                                data: { ...(n.data as any), viewMode: targetViewMode as any, status: newStatus }
                            };
                        }
                        return n;
                    }));
                    return;
                }
            }
        }

        // Fusion / Nesting — run the EXACT decision the user saw during the drag.
        if (pending) {
            const targetNode = getNode(pending.targetId);
            if (targetNode) {
                // Dropped onto its own parent → keep as-is (no re-nest / no un-nest).
                if (targetNode.id === node.parentId) {
                    snapSingleNode();
                    return;
                }

                const isTargetBlock = targetNode.type === 'block';
                const isTargetFused = targetNode.type === 'fused-note';
                const isTargetNote = targetNode.type === 'note';

                if (pending.action === 'fusion' && (isTargetBlock || isTargetFused) && (isSourceBlock || isSourceFused)) {
                    const sourceContent = Array.isArray(node.data.content) ? node.data.content : [];
                    // Nothing to merge — keep the source intact instead of deleting it (no data loss).
                    if (sourceContent.length === 0) {
                        snapSingleNode();
                        return;
                    }
                    handleFusionDrop(targetNode, node, pending.insertBlockId, pending.insertPosition, setNodes);
                    return;
                }

                if (pending.action === 'nesting' && isTargetNote && (isSourceFused || isSourceNote || isSourceBlock)) {
                    handleNestingDrop(targetNode, node, pending.insertBlockId, pending.insertPosition, updateNodeData, setNodes);
                    return;
                }
            }
        }

        // Recompute intersections once for the kanban fallback + un-nest decision.
        const { zoom } = getViewport();
        const checkSize = Math.max(2, 16 / zoom);
        const mousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const mouseRect = {
            x: mousePos.x - checkSize / 2,
            y: mousePos.y - checkSize / 2,
            width: checkSize,
            height: checkSize
        };
        const stopIntersections = getIntersectingNodes(mouseRect as any);

        // Kanban fallback: note dropped on a board but the hover wasn't captured this tick.
        if (isSourceNote) {
            const kanbanTarget = stopIntersections.find(n => n.type === 'kanban' && n.id !== node.id);
            if (kanbanTarget) {
                handleKanbanDrop(kanbanTarget, node, nodes, setNodes);
                return;
            }
        }

        // CASE 0: Drag out — un-nest when nothing actionable is under the cursor.
        const overSomething = stopIntersections.some(n => n.id !== node.id && n.id !== currentParentId);

        if (!overSomething && node.parentId) {
            const parentNode = getNode(node.parentId);
            if (parentNode) {
                const absPos = {
                    x: snapToGridValue(node.positionAbsolute?.x ?? (parentNode.position.x + node.position.x)),
                    y: snapToGridValue(node.positionAbsolute?.y ?? (parentNode.position.y + node.position.y))
                };
                setNodes(nds => nds.map(n => n.id === node.id ? {
                    ...n,
                    parentId: undefined,
                    extent: undefined,
                    zIndex: 10,
                    position: absPos
                } : n));
            }
            return;
        }

        snapSingleNode();
        if (currentParentId) {
            syncParentContent(currentParentId);
        }
    }, [getIntersectingNodes, setNodes, updateNodeData, getNode, nodes, currentParentId,
        syncParentContent, screenToFlowPosition, setInteractionState, selectedCanvasNodeIds, getViewport, clearDropIndicators]);

    return {
        onNodeDragStart,
        onNodeDrag,
        onNodeDragStop,
    };
}

// Helper: Handle Kanban drop
function handleKanbanDrop(targetNode: any, node: any, nodes: AppNode[], setNodes: any) {
    const kanbanData = targetNode.data as any;
    const currentColumns = kanbanData.columns;

    if (!currentColumns || currentColumns.length === 0) return;

    const boardWidth = targetNode.measured?.width ?? (targetNode.style?.width as number) ?? 800;

    let relativeX = 0;
    if (node.parentId === targetNode.id) {
        relativeX = node.position.x;
    } else {
        relativeX = node.position.x - targetNode.position.x;
    }

    const visualColWidth = (boardWidth - 48 - (20 * (currentColumns.length - 1))) / currentColumns.length;
    const gap = 20;
    const padding = 24;
    const totalStep = visualColWidth + gap;

    let colIndex = Math.floor((relativeX - padding + (gap / 2)) / totalStep);
    if (colIndex < 0) colIndex = 0;
    if (colIndex >= currentColumns.length) colIndex = currentColumns.length - 1;

    const targetCol = currentColumns[colIndex];
    const newStatus = targetCol.statusValue;

    const GAP = 16;
    const HEADER_OFFSET = 130;

    const columnSiblings = nodes.filter(n => {
        if (n.type !== 'note') return false;
        if (n.parentId !== targetNode.id) return false;
        if (n.id === node.id) return false;
        const d = n.data as any;
        return d.status === newStatus;
    });

    columnSiblings.sort((a, b) => a.position.y - b.position.y);
    const lastSibling = columnSiblings[columnSiblings.length - 1];

    let targetWidth = 112;
    let targetHeight = 112;
    let targetViewMode = 'icon';

    const canFitMedium = visualColWidth >= 240;
    const currentNodeWidth = node.style?.width as number || 112;

    if (canFitMedium && currentNodeWidth >= 224) {
        targetWidth = 224;
        targetHeight = 224;
        targetViewMode = 'medium';
    }

    const colXOffset = 24 + (colIndex * (visualColWidth + 20));
    // Free-form: keep raw kanban column placement (no grid snap)
    const centeredX = colXOffset + (visualColWidth - targetWidth) / 2;

    let nextY = HEADER_OFFSET;
    if (lastSibling) {
        const lastSiblingH = (lastSibling.style?.height as number) || 112;
        nextY = lastSibling.position.y + lastSiblingH + GAP;
    }

    setNodes((nds: AppNode[]) => nds.map((n: AppNode) => {
        if (n.id === node.id) {
            return {
                ...n,
                parentId: targetNode.id,
                extent: 'parent',
                zIndex: 1001,
                position: { x: centeredX, y: nextY },
                style: { ...n.style, width: targetWidth, height: targetHeight },
                data: { ...(n.data as any), viewMode: targetViewMode as any, status: newStatus }
            } as AppNode;
        }
        return n;
    }));
}

// Resolve the precomputed (blockId, position) decision into an array index.
function computeInsertIndex(targetContent: any[], insertBlockId: string | null, insertPosition: 'top' | 'bottom'): number {
    if (!insertBlockId) return targetContent.length;
    const idx = targetContent.findIndex((b: any) => b.id === insertBlockId);
    if (idx === -1) return targetContent.length;
    return insertPosition === 'top' ? idx : idx + 1;
}

// Helper: Handle Fusion drop. Uses the insertion point captured during the drag (no
// re-hit-testing) so the merge lands exactly where the insertion line was shown.
function handleFusionDrop(
    targetNode: any,
    node: any,
    insertBlockId: string | null,
    insertPosition: 'top' | 'bottom',
    setNodes: any
) {
    const sourceContent = Array.isArray(node.data.content) ? node.data.content : [];
    const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];

    const insertIndex = computeInsertIndex(targetContent, insertBlockId, insertPosition);
    const newContent = [
        ...targetContent.slice(0, insertIndex),
        ...sourceContent,
        ...targetContent.slice(insertIndex)
    ];

    const isStandalone = (node.data as any).isStandaloneBlock || (targetNode.data as any).isStandaloneBlock;

    // Content-aware default size: 8 units wide, height grown to fit the merged blocks
    // (grid-snapped, min 8×4, capped at MAX_HEIGHT) so tall merges aren't clipped.
    const DEFAULT_FUSED_WIDTH = 432; // 8 * 56 - 16
    const APPROX_BLOCK_PX = 44;
    const VERTICAL_PADDING = 48;
    const rawHeight = Math.min(MAX_HEIGHT, newContent.length * APPROX_BLOCK_PX + VERTICAL_PADDING);
    const sized = snapFusedDimensions(DEFAULT_FUSED_WIDTH, rawHeight);

    setNodes((nds: AppNode[]) => {
        const filtered = nds.filter(n => n.id !== node.id);
        return filtered.map(n => {
            if (n.id === targetNode.id) {
                // Preserve an already-fused target's manual dimensions; otherwise size to content.
                const currentWidth = n.style?.width as number | undefined;
                const currentHeight = n.style?.height as number | undefined;
                const isAlreadyFused = n.type === 'fused-note';
                const nextWidth = isAlreadyFused && typeof currentWidth === 'number' ? currentWidth : sized.width;
                const nextHeight = isAlreadyFused && typeof currentHeight === 'number' ? currentHeight : sized.height;

                return {
                    ...n,
                    type: 'fused-note',
                    style: { ...n.style, width: nextWidth, height: nextHeight },
                    data: {
                        ...n.data,
                        content: newContent,
                        lastFusedAt: Date.now(),
                        ...(isStandalone ? { isStandaloneBlock: true } : {})
                    }
                };
            }
            return n;
        });
    });
}

// Helper: Handle Nesting drop. Uses the insertion point captured during the drag.
function handleNestingDrop(
    targetNode: any,
    node: any,
    insertBlockId: string | null,
    insertPosition: 'top' | 'bottom',
    updateNodeData: any,
    setNodes: any
) {
    const isSourceNote = node.type === 'note';

    if (isSourceNote) {
        const pageBlock = {
            id: uuidv4(),
            type: 'page',
            content: node.data.label || 'Untitled Page',
            metadata: { nodeId: node.id }
        };

        const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];
        const insertIndex = computeInsertIndex(targetContent, insertBlockId, insertPosition);

        updateNodeData(targetNode.id, {
            content: [
                ...targetContent.slice(0, insertIndex),
                pageBlock,
                ...targetContent.slice(insertIndex)
            ]
        });

        setNodes((nds: AppNode[]) => nds.map((n: AppNode) => {
            if (n.id === node.id) {
                return {
                    ...n,
                    parentId: targetNode.id,
                    extent: 'parent',
                    position: { x: 0, y: 0 },
                    style: n.style
                };
            }
            return n;
        }));
        return;
    }

    // For fused/block sources
    const sourceContent = Array.isArray(node.data.content) ? node.data.content : [];

    if (sourceContent.length > 0) {
        const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];
        const insertIndex = computeInsertIndex(targetContent, insertBlockId, insertPosition);

        const newTargetContent = [
            ...targetContent.slice(0, insertIndex),
            ...sourceContent,
            ...targetContent.slice(insertIndex)
        ];

        setNodes((nds: AppNode[]) => {
            const filtered = nds.filter(n => n.id !== node.id);
            return filtered.map(n => {
                if (n.id === targetNode.id) {
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            content: newTargetContent,
                            lastFusedAt: Date.now()
                        }
                    } as any;
                }
                return n;
            });
        });
    }
}
