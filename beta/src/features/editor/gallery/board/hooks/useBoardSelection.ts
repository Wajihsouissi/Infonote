import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Block } from '../../../types';
import { SLOT_ID } from '../../tile/GalleryTile';

export interface Marquee { x0: number; y0: number; x1: number; y1: number }

/**
 * Which pictures the next action applies to.
 *
 * Arranging a board is bulk work — you cull six, promote three, move a cluster
 * to another board — and every operation used to be one-at-a-time. Selection
 * is modifier-click, Shift for a range, or a rubber band drawn from the
 * board's background. Escape gives the board back.
 */
export function useBoardSelection({ items, readOnly }: { items: Block[]; readOnly?: boolean }) {
    /* Held as an array, not a Set, so it is a plain value React can compare and
       a range can be read off it. */
    const [requestedIds, setSelectedIds] = useState<string[]>([]);
    /* The anchor a Shift range extends from. A ref, not state: it only ever
       affects the *next* click, so re-rendering for it would be waste. */
    const rangeAnchor = useRef<string | null>(null);
    /* Rubber band, in the grid's own coordinates. */
    const [marquee, setMarquee] = useState<Marquee | null>(null);

    /* Only the pictures that still exist. Filtered on the way out rather than
       pruned by an effect: removing a selected tile would otherwise leave its
       id behind and the bar would keep counting a picture that is gone. */
    const selectedIds = useMemo(() => {
        const live = new Set(items.map((item) => item.id));
        return requestedIds.filter((id) => live.has(id));
    }, [requestedIds, items]);
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

    const clearSelection = useCallback(() => {
        setSelectedIds([]);
        rangeAnchor.current = null;
    }, []);

    /**
     * Modifier-click. Plain click is left alone deliberately: opening the
     * picture is the board's most-used gesture and turning it into "select"
     * the moment a selection exists — the file-manager convention — would make
     * the same click do two different things depending on invisible state.
     */
    const selectFromClick = useCallback((id: string, e: React.MouseEvent) => {
        // Shift extends from the anchor; the range is over item order, which is
        // the only order the board actually has.
        if (e.shiftKey && rangeAnchor.current) {
            const a = items.findIndex((i) => i.id === rangeAnchor.current);
            const b = items.findIndex((i) => i.id === id);
            if (a !== -1 && b !== -1) {
                const [lo, hi] = a < b ? [a, b] : [b, a];
                setSelectedIds(items.slice(lo, hi + 1).map((i) => i.id));
                return;
            }
        }
        rangeAnchor.current = id;
        setSelectedIds((prev) => (
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        ));
    }, [items]);

    useEffect(() => {
        if (selectedIds.length === 0) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            clearSelection();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [selectedIds.length, clearSelection]);

    /**
     * Pointer-down on the board. Only from the background — starting a band on
     * a tile would fight the drag that rearranges the board, which is the more
     * important gesture. Also focuses the board, so clicking its empty space
     * makes it the paste target.
     */
    const onBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        e.currentTarget.focus();
        if (readOnly || e.button !== 0) return;
        const host = e.currentTarget;
        const box = host.getBoundingClientRect();
        /* The board may sit in the canvas's scaled viewport, where a client
           rect is in screen pixels but the overlay is drawn in the board's own.
           Their ratio is the scale, whatever produced it. */
        const scale = host.offsetWidth > 0 ? box.width / host.offsetWidth : 1;
        const local = (cx: number, cy: number) => ({
            x: (cx - box.left) / scale,
            y: (cy - box.top) / scale,
        });
        const start = local(e.clientX, e.clientY);
        host.setPointerCapture(e.pointerId);
        // A plain press on the background is also how you let go of a selection.
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) clearSelection();

        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        const base = additive ? selectedIds : [];

        const move = (ev: PointerEvent) => {
            const now = local(ev.clientX, ev.clientY);
            setMarquee({ x0: start.x, y0: start.y, x1: now.x, y1: now.y });
            const band = {
                left: Math.min(start.x, now.x), right: Math.max(start.x, now.x),
                top: Math.min(start.y, now.y), bottom: Math.max(start.y, now.y),
            };
            // Intersection, not containment: a band has to be able to catch a
            // large tile without enclosing the whole of it.
            const hit: string[] = [];
            for (const el of host.querySelectorAll<HTMLElement>('[data-tile-id]')) {
                const id = el.dataset.tileId;
                if (!id || id === SLOT_ID) continue;
                const r = el.getBoundingClientRect();
                const a = local(r.left, r.top);
                const b = local(r.right, r.bottom);
                if (b.x < band.left || a.x > band.right) continue;
                if (b.y < band.top || a.y > band.bottom) continue;
                hit.push(id);
            }
            setSelectedIds([...new Set([...base, ...hit])]);
        };
        const up = () => {
            host.releasePointerCapture(e.pointerId);
            host.removeEventListener('pointermove', move);
            host.removeEventListener('pointerup', up);
            host.removeEventListener('pointercancel', up);
            setMarquee(null);
        };
        host.addEventListener('pointermove', move);
        host.addEventListener('pointerup', up);
        host.addEventListener('pointercancel', up);
    };

    return { selectedIds, selected, clearSelection, selectFromClick, marquee, onBoardPointerDown };
}
