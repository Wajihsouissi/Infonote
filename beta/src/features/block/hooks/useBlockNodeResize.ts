import { useCallback, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../../store/useStore';
import { getNodeById } from '../../../store/nodeIndex';
import type { AppNode } from '../../../types';
import type { Block } from '../../editor/types';
import { MAX_HEIGHT } from '../../../config/layout';
import { GALLERY_MIN_ROW, GALLERY_NODE_WIDTH } from '../../editor/gallery/galleryTypes';
import { MIN_COL_W } from '../../editor/document/tableLayout';
import { BLOCK_MAX_USER_W, BLOCK_MIN_H, BLOCK_MIN_W, TABLE_MIN_W, type BlockNodeShape } from '../blockNodeShape';

/* Taking a hand-size is a one-way door out of intrinsic sizing, so it has to be
   a deliberate drag: a plain click on the handle (mousedown + a pixel of
   tremor + mouseup) must leave the block sizing itself. */
const RESIZE_THRESHOLD_PX = 3;

const contentOf = (id: string): Block[] => {
    const content = getNodeById(useStore.getState().nodes, id)?.data.content;
    return Array.isArray(content) ? (content as Block[]) : [];
};

/** Rewrites the first block's metadata, the one a single-block node holds. */
const withFirstBlockMetadata = (blocks: Block[], patch: Record<string, unknown>): Block[] =>
    blocks.map((b, i) => (i === 0 ? { ...b, metadata: { ...b.metadata, ...patch } } : b));

/** Runs a window-level mouse drag with the resize cursor held on the body. */
function trackDrag(cursor: string, onMove: (e: MouseEvent) => void, onEnd?: () => void) {
    document.body.style.cursor = cursor;
    document.body.classList.add('chnk-it-resizing-active');

    const onUp = () => {
        document.body.style.cursor = '';
        document.body.classList.remove('chnk-it-resizing-active');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        onEnd?.();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

/**
 * The corner handle of a block node: drag to size it, double-click to hand it
 * back to intrinsic sizing.
 */
export function useBlockNodeResize(id: string, nodeRef: RefObject<HTMLDivElement | null>, shape: BlockNodeShape) {
    const { getViewport } = useReactFlow();
    /* The store's setNodes, not React Flow's. React Flow queues its own and
       replays the node it last rendered, so a data write made in between (the
       reset below clearing userWidth) was silently undone by the stale copy. */
    const setNodes = useStore((s) => s.setNodes);
    const updateNodeData = useStore((s) => s.updateNodeData);
    const { isStandardBlock, isSingleGallery, isSingleTable, isTableSized } = shape;

    /* On a hand-sized table the node is shrink-wrapped to the columns, so there
       is no node width to drag — instead the drag scales every column by the
       same ratio and the node follows them. That closes the loop: resize the
       table and the container follows (max-content), resize the container and
       the table follows (this). */
    const startTableScale = useCallback((e: ReactMouseEvent) => {
        const table = nodeRef.current?.querySelector('table');
        const colgroup = table?.querySelector('colgroup');
        if (!table || !colgroup) return;

        const { zoom } = getViewport();
        const cols = [...colgroup.children] as HTMLElement[];
        const startWidths = [...table.querySelectorAll<HTMLElement>('thead th')].map((th) => Math.round(th.offsetWidth));
        const startTotal = startWidths.reduce((a, b) => a + b, 0);
        if (startTotal <= 0) return;

        const startX = e.clientX;
        // Floor the ratio so no column can be squeezed under MIN_COL_W.
        const minTotal = startWidths.length * MIN_COL_W;
        let nextWidths = [...startWidths];

        trackDrag('ew-resize', (move) => {
            const total = Math.max(minTotal, startTotal + (move.clientX - startX) / zoom);
            const ratio = total / startTotal;
            nextWidths = startWidths.map((w) => Math.max(MIN_COL_W, Math.round(w * ratio)));
            cols.forEach((col, i) => { col.style.width = `${nextWidths[i]}px`; });
        }, () => {
            updateNodeData(id, { content: withFirstBlockMetadata(contentOf(id), { columnWidths: nextWidths }) });
        });
    }, [id, nodeRef, getViewport, updateNodeData]);

    const onResizeStart = useCallback((e: ReactMouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isTableSized) {
            startTableScale(e);
            return;
        }

        const el = nodeRef.current;
        if (!el) return;
        const { zoom } = getViewport();
        const startX = e.clientX;
        const startY = e.clientY;
        // Screen pixels -> flow units, or the block outruns the cursor at any
        // zoom other than 100%.
        const rect = el.getBoundingClientRect();
        const startW = rect.width / zoom;
        const startH = rect.height / zoom;

        /* A board's height is stored on the BOARD, not the node — it's the grid
           that has to re-solve its tiles to fill it. The user drags the whole
           node though, so measure the difference once: everything that isn't
           grid (toolbar, node padding) is chrome the drag must not hand to the
           board, or the node would grow by the toolbar's height on every drag. */
        const gridEl = isSingleGallery ? el.querySelector<HTMLElement>('[data-gallery-grid]') : null;
        const galleryChrome = gridEl ? Math.max(0, startH - gridEl.getBoundingClientRect().height / zoom) : 0;

        trackDrag(isStandardBlock || isSingleGallery ? 'nwse-resize' : 'ew-resize', (move) => {
            if (Math.abs(move.clientX - startX) + Math.abs(move.clientY - startY) < RESIZE_THRESHOLD_PX) return;

            const rawW = startW + (move.clientX - startX) / zoom;
            const width = isStandardBlock
                ? Math.min(BLOCK_MAX_USER_W, Math.max(BLOCK_MIN_W, rawW))
                // A table narrower than this is unreadable — even two columns
                // collapse to a stack of single characters.
                : Math.max(isSingleTable ? TABLE_MIN_W : 100, rawW);
            const height = Math.min(MAX_HEIGHT, Math.max(BLOCK_MIN_H, startH + (move.clientY - startY) / zoom));

            // Size and data must move in ONE store write: as two (setNodes then
            // updateNodeData) they raced, and the node ended a drag with a
            // stale userWidth that disagreed with its rendered width.
            setNodes((nodes) => nodes.map((n) => {
                if (n.id !== id) return n;
                const style = { ...n.style, width };

                if (isSingleGallery) {
                    /* Both axes, and both meaningful: width re-columns the board,
                       height re-sizes its tiles. The height rides on the block so
                       the grid can solve against it; the node then auto-heights
                       around the result, which is why style.height stays alone. */
                    const content = Array.isArray(n.data.content) ? (n.data.content as Block[]) : [];
                    const galleryHeight = Math.max(GALLERY_MIN_ROW, height - galleryChrome);
                    return { ...n, style, data: { ...n.data, content: withFirstBlockMetadata(content, { galleryHeight }) } } as AppNode;
                }

                if (!isStandardBlock) return { ...n, style };
                // userHeight lands in CSS as a min-height floor, not style.height.
                return { ...n, style, data: { ...n.data, userWidth: width, userHeight: height } } as AppNode;
            }));
        });
    }, [id, nodeRef, getViewport, setNodes, startTableScale, isTableSized, isStandardBlock, isSingleGallery, isSingleTable]);

    // Double-clicking the handle hands the block back to intrinsic sizing —
    // the only way out of a drag you didn't want.
    const onResizeReset = useCallback((e: ReactMouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (isSingleGallery) {
            // Clearing the stored height is what returns the board to sizing
            // itself; the width goes back to the default board footprint.
            setNodes((nodes) => nodes.map((n) => {
                if (n.id !== id) return n;
                const content = Array.isArray(n.data.content) ? (n.data.content as Block[]) : [];
                return {
                    ...n,
                    style: { ...n.style, width: GALLERY_NODE_WIDTH },
                    data: { ...n.data, content: withFirstBlockMetadata(content, { galleryHeight: undefined }) },
                } as AppNode;
            }));
            return;
        }

        setNodes((nodes) => nodes.map((n) => (n.id === id ? { ...n, style: { ...n.style, width: 'auto' } } : n)));
        updateNodeData(id, { userWidth: undefined, userHeight: undefined });
    }, [id, setNodes, updateNodeData, isSingleGallery]);

    return { onResizeStart, onResizeReset };
}
