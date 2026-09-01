import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useReactFlow } from '@xyflow/react';
import { type AppNode, getNodeBlocks, getNodeLabel } from '../../../types';
import type { Block } from '../../editor/types';
import type { UISlice } from '../../../store/types';
import { snapFusedDimensions, MAX_HEIGHT, MEDIUM_SIZE, GRID_GAP } from '../../../config/layout';
import { useStore } from '../../../store/useStore';
import { setStreaming } from './lodStore';
import { mergeIntoGallery, GALLERY_NODE_WIDTH } from '../../editor/galleryTypes';

type SetNodesFn = (updater: (nodes: AppNode[]) => AppNode[]) => void;

/** Standalone flag lives only on block / fused-note payloads. */
const hasStandaloneFlag = (data: AppNode['data']): boolean =>
    'isStandaloneBlock' in data && !!data.isStandaloneBlock;

// A single source of truth for what a node-drag will do on release. Computed once per
// drag tick and consumed verbatim on drop, so the highlight the user sees always matches
// the action that runs (no second, divergent detection pass on drop).
interface PendingDrop {
    targetId: string;
    action: 'fusion' | 'nesting' | 'gallery' | 'kanban';
    insertBlockId: string | null;
    insertPosition: 'top' | 'bottom';
    /** Kanban only: the lane value the drop will write onto the card. */
    laneValue?: string;
}

/** Columns the board lays adopted cards out in on its drilled-in canvas. */
const DRILL_GRID_COLS = 4;

/**
 * The board lane under the cursor, if any.
 *
 * Boards draw their cards as plain DOM rather than as React Flow nodes, so
 * there is nothing for `getIntersectingNodes` to report and the lane has to be
 * found by hit-testing the document. The dragged node is `pointer-events: none`
 * for the duration of a drag (global CSS), which is what lets the lane beneath
 * it answer instead.
 */
const laneUnderCursor = (elementsUnderCursor: Element[]): { boardId: string; value: string } | null => {
    for (const el of elementsUnderCursor) {
        const lane = (el as HTMLElement).getAttribute?.('data-kanban-lane');
        const boardId = (el as HTMLElement).getAttribute?.('data-kanban-board');
        if (lane !== null && lane !== undefined && boardId) {
            return { boardId, value: lane };
        }
    }
    return null;
};

/** Every node type that carries content, which is every type a board can plan. */
const canJoinBoard = (node: AppNode): boolean =>
    node.type === 'note' || node.type === 'block' || node.type === 'fused-note';


interface UseCanvasNodeDragOptions {
    currentParentId: string | null;
    setInteractionState: (state: Partial<UISlice['interactionState']>) => void;
    setNodes: SetNodesFn;
    updateNodeData: (id: string, data: Record<string, unknown>) => void;
    syncParentContent: (parentId: string) => void;
}

/**
 * Hook that handles all node drag interactions on the canvas.
 * Manages drag start, drag move, and drag stop with fusion/nesting/kanban logic.
 */
export function useCanvasNodeDrag({
    currentParentId,
    setInteractionState,
    setNodes,
    updateNodeData,
    syncParentContent,
}: UseCanvasNodeDragOptions) {
    const { screenToFlowPosition, getIntersectingNodes, getNode, getViewport } = useReactFlow<AppNode>();

    // Throttling and state Refs
    const lastDragCheck = useRef(0);
    const lastHighlightedBlockRef = useRef<HTMLElement | null>(null);
    const activeDropTargetRef = useRef<{ id: string; type: 'fusion' | 'nesting' | 'gallery' | 'kanban' } | null>(null);
    // Last lane highlighted, so the store is written on entering a lane rather
    // than on every throttled frame spent inside one.
    const hoveredLaneRef = useRef<{ boardId: string; value: string } | null>(null);
    const hasKanbanTargetsRef = useRef(false);
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

    const onNodeDragStart = useCallback((_event: React.MouseEvent, node: AppNode) => {
        // Multi-drag = the grabbed node is part of a selection of 2+. React Flow's own
        // getDragItems uses node.selected to decide who moves; we mirror that exactly.
        const selectedCanvasNodeIds = useStore.getState().selectedCanvasNodeIds;
        const isMultiDrag = selectedCanvasNodeIds.size > 1 && selectedCanvasNodeIds.has(node.id);

        /* A node drag is a gesture like a pan, and the same rule applies: no
           card may promote itself to a richer tier or commit a queued editor
           mount while the user is moving something. Without this the cards the
           drag sweeps past mount their editors mid-gesture and each commit
           lands as a dropped frame under the cursor. */
        setStreaming(true);

        setInteractionState({
            draggedNodeId: node.id,
            isMultiDragging: isMultiDrag,
        });
        activeDropTargetRef.current = null;
        pendingDropRef.current = null;
        isSourceHiddenRef.current = false;
        hasKanbanTargetsRef.current = canJoinBoard(node) && useStore.getState().nodes.some(candidate =>
            candidate.type === 'kanban' &&
            (candidate.parentId ?? null) === (currentParentId ?? null),
        );
        clearDropIndicators();

        // Two distinct body classes so single-drag and multi-drag can style independently:
        //   chnk-it-node-dragging  — base flag for cursor + general grabbing UX
        //   chnk-it-multi-drag     — only during multi-drag; targets every selected card
        document.body.classList.add('chnk-it-node-dragging');
        if (isMultiDrag) document.body.classList.add('chnk-it-multi-drag');
    }, [setInteractionState, clearDropIndicators, currentParentId]);

    const onNodeDrag = useCallback((event: React.MouseEvent, node: AppNode) => {
        // Multi-drag is pure repositioning — no fusion, no nesting, no kanban targeting.
        // Short-circuit before any hit-testing so the group glides cleanly under the cursor.
        const selectedCanvasNodeIds = useStore.getState().selectedCanvasNodeIds;
        if (selectedCanvasNodeIds.size > 1 && selectedCanvasNodeIds.has(node.id)) {
            return;
        }

        // Drop-target discovery is visual feedback, not the movement path.
        // Sampling it at 20fps keeps highlights responsive without making the
        // cursor wait for hit-testing on high-polling-rate pointer devices.
        const now = Date.now();
        if (now - lastDragCheck.current < 50) {
            return;
        }
        lastDragCheck.current = now;

        const { zoom } = getViewport();
        const checkSize = Math.max(2, 16 / zoom);
        const mousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const mouseRect = {
            x: mousePos.x - checkSize / 2,
            y: mousePos.y - checkSize / 2,
            width: checkSize,
            height: checkSize,
        };
        const intersections = getIntersectingNodes(mouseRect);
        const elementsUnderCursor = hasKanbanTargetsRef.current
            ? document.elementsFromPoint(event.clientX, event.clientY)
            : [];

        /* Priority 1: a board lane. Anything with content can be planned — a
           note joins as itself, a block or a fused note becomes a card carrying
           its blocks (see the drop handler). A lane wins over whatever else is
           under the cursor, because something released over a board is being
           scheduled, not merged into the thing behind it. */
        const kanbanHit = canJoinBoard(node)
            ? laneUnderCursor(elementsUnderCursor)
            : null;

        const targetOther = kanbanHit ? undefined : intersections.find(candidate =>
            candidate.id !== node.id &&
            (candidate.type === 'note' || candidate.type === 'fused-note' || candidate.type === 'block')
        );

        let newDropTarget: { id: string; type: 'fusion' | 'nesting' | 'gallery' | 'kanban' } | null = null;

        if (kanbanHit) {
            newDropTarget = { id: kanbanHit.boardId, type: 'kanban' };
            pendingDropRef.current = {
                targetId: kanbanHit.boardId,
                action: 'kanban',
                insertBlockId: null,
                insertPosition: 'bottom',
                laneValue: kanbanHit.value,
            };
            setDropLine(null, 'bottom');
        }

        // Priority 2: Fusion or Nesting (single decision used verbatim on drop)
        else if (targetOther) {
            const isSourceBlock = node.type === 'block';
            const isSourceFused = node.type === 'fused-note';
            const isSourceNote = node.type === 'note';

            const isTargetBlock = targetOther.type === 'block';
            const isTargetFused = targetOther.type === 'fused-note';
            const isTargetNote = targetOther.type === 'note';

            if ((isTargetBlock || isTargetFused) && (isSourceBlock || isSourceFused)) {
                // Media landing on media is a moodboard, not a stack. Decided here,
                // during the drag, so the highlight the user sees is the action
                // that runs — the whole point of the single-decision design.
                const makesGallery = !!mergeIntoGallery(
                    getNodeBlocks(targetOther.data) ?? [],
                    getNodeBlocks(node.data) ?? [],
                );
                newDropTarget = { id: targetOther.id, type: makesGallery ? 'gallery' : 'fusion' };
            } else if (isTargetNote && (isSourceFused || isSourceNote || isSourceBlock)) {
                newDropTarget = { id: targetOther.id, type: 'nesting' };
            }

            if (newDropTarget) {
                // Which of the target's blocks would we insert next to? The dragged node is
                // pointer-events:none during drag (global CSS), so elementsFromPoint returns the
                // TARGET's blocks rather than the dragged node's overlay.
                const targetElement = document.querySelector<HTMLElement>(
                    `.react-flow__node[data-id="${CSS.escape(newDropTarget.id)}"]`,
                );
                const blockElement = targetElement
                    ? Array.from(targetElement.querySelectorAll<HTMLElement>('[id^="block-"]')).find(element => {
                        const rect = element.getBoundingClientRect();
                        return event.clientX >= rect.left && event.clientX <= rect.right &&
                            event.clientY >= rect.top && event.clientY <= rect.bottom;
                    })
                    : undefined;

                let insertBlockId: string | null = null;
                let insertPosition: 'top' | 'bottom' = 'bottom';
                // A gallery has no insertion point — the board absorbs the media
                // whole — so drawing a between-blocks line would promise a
                // placement that doesn't happen.
                if (blockElement && newDropTarget.type !== 'gallery') {
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
                    action: newDropTarget.type as 'fusion' | 'nesting' | 'gallery',
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

        // Which lane lights up is a finer-grained question than which node is
        // the target, so it gets its own comparison.
        const lastLane = hoveredLaneRef.current;
        if (lastLane?.boardId !== kanbanHit?.boardId || lastLane?.value !== kanbanHit?.value) {
            hoveredLaneRef.current = kanbanHit;
            setInteractionState({ hoveredKanbanLane: kanbanHit });
        }

        // Swap the node for the cursor chip while over a fusion/nesting target.
        // Multi-drag never reaches here — it short-circuits at the top of this callback.
        setSourceHidden(node.id, !!newDropTarget);
    }, [getIntersectingNodes, setInteractionState, screenToFlowPosition, getViewport, setDropLine, setSourceHidden]);

    const onNodeDragStop = useCallback((event: React.MouseEvent, node: AppNode) => {
        const pending = pendingDropRef.current;
        const selectedCanvasNodeIds = useStore.getState().selectedCanvasNodeIds;
        const isMultiDrag = selectedCanvasNodeIds.size > 1 && selectedCanvasNodeIds.has(node.id);

        // Clear interaction states + every drop indicator (single, centralized cleanup)
        setInteractionState({
            draggedNodeId: null,
            isMultiDragging: false,
            dropTarget: null,
            hoveredKanbanLane: null
        });
        activeDropTargetRef.current = null;
        hoveredLaneRef.current = null;
        pendingDropRef.current = null;
        isSourceHiddenRef.current = false;
        hasKanbanTargetsRef.current = false;
        clearDropIndicators();
        document.body.classList.remove('chnk-it-node-dragging');
        document.body.classList.remove('chnk-it-multi-drag');
        // Gesture over: held-back tier upgrades and queued mounts resume.
        setStreaming(false);

        // Reveal the dragged node(s) again and restore z-index — single pass, no extra re-renders.
        const nodeIdsToRestore = isMultiDrag
            ? Array.from(selectedCanvasNodeIds)
            : [node.id];

        const nodeIdSet = new Set(nodeIdsToRestore);
        setNodes(nds => nds.map(n => {
            if (!nodeIdSet.has(n.id)) return n;
            const cls = n.className ?? '';
            const needsClassClean = cls.includes('chnk-it-drag-source');
            const needsZIndex = n.zIndex !== 10;
            const needsExtent = n.extent !== (n.parentId ? 'parent' : undefined);
            if (!needsClassClean && !needsZIndex && !needsExtent) return n;
            return {
                ...n,
                className: needsClassClean ? cls.replace('chnk-it-drag-source', '').replace(/\s+/g, ' ').trim() : cls,
                zIndex: 10,
                extent: n.parentId ? 'parent' : undefined,
            };
        }));

        const isSourceBlock = node.type === 'block';
        const isSourceFused = node.type === 'fused-note';
        const isSourceNote = node.type === 'note';

        // Multi-drag: skip fusion/nesting/kanban — restore already handled above.
        if (isMultiDrag) {
            if (currentParentId) syncParentContent(currentParentId);
            return;
        }


        /* Kanban — the card joins the board and takes the lane's value.
           Parent, position and metadata move in ONE store write: as separate
           calls they race, and the card can end the drag adopted by the board
           but still carrying its old status. */
        if (pending?.action === 'kanban' && canJoinBoard(node)) {
            const board = getNode(pending.targetId);
            if (board?.type === 'kanban') {
                const field = board.data.groupBy;
                const value = pending.laneValue ?? '';
                const previousParentId = node.parentId;
                const isNewChild = previousParentId !== board.id;

                /* A card the board is adopting needs somewhere to sit on the
                   board's own drilled-in canvas — invisible from the board
                   itself, which is exactly why it would otherwise stay at the
                   origin under every other adopted card. A card merely moving
                   between lanes of a board it already belongs to keeps its
                   place there. */
                const siblings = isNewChild
                    ? useStore.getState().nodes.filter(n =>
                        n.parentId === board.id && n.id !== node.id).length
                    : 0;
                const step = MEDIUM_SIZE + GRID_GAP;
                const slotPosition = {
                    x: (siblings % DRILL_GRID_COLS) * step,
                    y: Math.floor(siblings / DRILL_GRID_COLS) * step,
                };

                /* Nothing is converted. Whatever was dropped joins the board as
                   itself — a block stays a block, a fused note stays a fused
                   note — and takes the lane's value on the one metadata field
                   the board groups by. Every node type a board can hold carries
                   those fields (see kanbanTypes.BoardPlanningFields), so the
                   board can draw and group all of them without any of them
                   having to become something else first. Dragging one back out
                   returns exactly what was dropped. */
                setNodes(nds => nds.map(n => {
                    if (n.id !== node.id) return n;
                    return {
                        ...n,
                        parentId: board.id,
                        extent: undefined,
                        zIndex: 10,
                        position: isNewChild ? slotPosition : n.position,
                        data: { ...n.data, [field]: value || undefined },
                    } as AppNode;
                }));

                // The node left its old parent's content behind.
                if (isNewChild && previousParentId) syncParentContent(previousParentId);
                return;
            }
        }

        // Fusion / Nesting — run the EXACT decision the user saw during the drag.
        if (pending) {
            const targetNode = getNode(pending.targetId);
            if (targetNode) {
                // Dropped onto its own parent → keep as-is (no re-nest / no un-nest).
                if (targetNode.id === node.parentId) {
                    return;
                }

                const isTargetBlock = targetNode.type === 'block';
                const isTargetFused = targetNode.type === 'fused-note';
                const isTargetNote = targetNode.type === 'note';

                if ((pending.action === 'fusion' || pending.action === 'gallery')
                    && (isTargetBlock || isTargetFused) && (isSourceBlock || isSourceFused)) {
                    const sourceContent = getNodeBlocks(node.data) ?? [];
                    // Nothing to merge — keep the source intact instead of deleting it (no data loss).
                    if (sourceContent.length === 0) {
                        return;
                    }
                    // Re-checked rather than trusted: the drag decision could have
                    // been made against content that changed under it, and turning
                    // a text card into a gallery would silently lose its text.
                    const gallery = pending.action === 'gallery'
                        ? mergeIntoGallery(getNodeBlocks(targetNode.data) ?? [], sourceContent)
                        : null;
                    if (gallery) {
                        handleGalleryDrop(targetNode, node, gallery, setNodes);
                    } else {
                        handleFusionDrop(targetNode, node, pending.insertBlockId, pending.insertPosition, setNodes);
                    }
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
        const stopIntersections = getIntersectingNodes(mouseRect);


        // CASE 0: Drag out — un-nest when nothing actionable is under the cursor.
        const overSomething = stopIntersections.some(n => n.id !== node.id && n.id !== currentParentId);

        if (!overSomething && node.parentId) {
            const parentNode = getNode(node.parentId);
            if (parentNode) {
                // React Flow 11 exposed positionAbsolute on the callback node; v12 doesn't, so fall back to parent + relative.
                const legacyAbs = (node as AppNode & { positionAbsolute?: { x: number; y: number } }).positionAbsolute;
                const absPos = {
                    x: legacyAbs?.x ?? (parentNode.position.x + node.position.x),
                    y: legacyAbs?.y ?? (parentNode.position.y + node.position.y)
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

        // Restore already handled above — just sync parent content.
        if (currentParentId) {
            syncParentContent(currentParentId);
        }
    }, [getIntersectingNodes, setNodes, updateNodeData, getNode, currentParentId,
        syncParentContent, screenToFlowPosition, setInteractionState, getViewport, clearDropIndicators]);

    return {
        onNodeDragStart,
        onNodeDrag,
        onNodeDragStop,
    };
}



// Resolve the precomputed (blockId, position) decision into an array index.
function computeInsertIndex(targetContent: Block[], insertBlockId: string | null, insertPosition: 'top' | 'bottom'): number {
    if (!insertBlockId) return targetContent.length;
    const idx = targetContent.findIndex((b) => b.id === insertBlockId);
    if (idx === -1) return targetContent.length;
    return insertPosition === 'top' ? idx : idx + 1;
}

/**
 * Media dropped on media: the target becomes a one-block node holding the merged
 * gallery, and the source is consumed. Deliberately NOT a fused-note — a board is
 * a single object, and the block node is what gives it the transparent surface
 * and the resize handle that media already gets.
 */
function handleGalleryDrop(targetNode: AppNode, node: AppNode, gallery: Block, setNodes: SetNodesFn) {
    const isStandalone = hasStandaloneFlag(node.data) || hasStandaloneFlag(targetNode.data);

    setNodes((nds: AppNode[]) => {
        const filtered = nds.filter(n => n.id !== node.id);
        return filtered.map(n => {
            if (n.id !== targetNode.id) return n;

            /* A board the user has already sized keeps that size — the whole
               point of dropping another picture in is that the composition is
               theirs. Only a first promotion (a lone media node becoming a
               board) claims the wider default. */
            const wasGallery = getNodeBlocks(n.data)?.some(b => b.type === 'gallery');
            const currentWidth = n.style?.width;
            const width = wasGallery && typeof currentWidth === 'number'
                ? currentWidth
                : GALLERY_NODE_WIDTH;

            return {
                ...n,
                type: 'block',
                style: { ...n.style, width, height: 'auto' },
                data: {
                    ...n.data,
                    content: [gallery],
                    lastFusedAt: Date.now(),
                    ...(isStandalone ? { isStandaloneBlock: true } : {}),
                },
            } as AppNode;
        });
    });
}

// Helper: Handle Fusion drop. Uses the insertion point captured during the drag (no
// re-hit-testing) so the merge lands exactly where the insertion line was shown.
function handleFusionDrop(
    targetNode: AppNode,
    node: AppNode,
    insertBlockId: string | null,
    insertPosition: 'top' | 'bottom',
    setNodes: SetNodesFn
) {
    const sourceContent = getNodeBlocks(node.data) ?? [];
    const targetContent = getNodeBlocks(targetNode.data) ?? [];

    const insertIndex = computeInsertIndex(targetContent, insertBlockId, insertPosition);
    const newContent = [
        ...targetContent.slice(0, insertIndex),
        ...sourceContent,
        ...targetContent.slice(insertIndex)
    ];

    const isStandalone = hasStandaloneFlag(node.data) || hasStandaloneFlag(targetNode.data);

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
                } as AppNode;
            }
            return n;
        });
    });
}

// Helper: Handle Nesting drop. Uses the insertion point captured during the drag.
function handleNestingDrop(
    targetNode: AppNode,
    node: AppNode,
    insertBlockId: string | null,
    insertPosition: 'top' | 'bottom',
    updateNodeData: (id: string, data: Record<string, unknown>) => void,
    setNodes: SetNodesFn
) {
    const isSourceNote = node.type === 'note';

    if (isSourceNote) {
        const pageBlock: Block = {
            id: uuidv4(),
            type: 'page',
            content: getNodeLabel(node.data) || 'Untitled Page',
            metadata: { nodeId: node.id }
        };

        const targetContent = getNodeBlocks(targetNode.data) ?? [];
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
    const sourceContent = getNodeBlocks(node.data) ?? [];

    if (sourceContent.length > 0) {
        const targetContent = getNodeBlocks(targetNode.data) ?? [];
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
                    } as AppNode;
                }
                return n;
            });
        });
    }
}
