import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import {
    claimGalleryItem, toGalleryItems, withResolvedSpans,
    GALLERY_DRAG_MIME, GALLERY_ITEM_MIME, type GalleryLayout,
} from '../galleryTypes';
import { endBlockDrag } from '../blockDragLock';
import type { Block } from '../types';
import { dragHasType, readDragData } from '../dragSession';
import { useStableCallback } from '../../../utils/useStableCallback';
import { SLOT_ID } from './GalleryTile';

/** A tile of THIS board being moved within it. */
const isOwnItemDrag = (e: React.DragEvent) => dragHasType(e, GALLERY_ITEM_MIME);
/** Media arriving from outside — a card's block, a canvas node, another board.
 *  Anything that isn't media keeps bubbling to the block wrapper, which knows
 *  what to do with it. */
const isIncomingMedia = (e: React.DragEvent) =>
    !isOwnItemDrag(e)
    && dragHasType(e, GALLERY_DRAG_MIME)
    && dragHasType(e, 'application/chnk-it-block-data');
const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

type TileBox = { id: string; x: number; y: number; w: number; h: number };

/**
 * Everything about carrying pictures onto, around and off a board: where a
 * drop would land, the board shown rearranged around it, and committing it.
 */
export function useBoardDrop({ gridRef, items, layout, readOnly, setItems, addFiles }: {
    gridRef: RefObject<HTMLDivElement | null>;
    items: Block[];
    layout: GalleryLayout;
    readOnly?: boolean;
    setItems: (next: Block[]) => void;
    addFiles: (files: FileList | File[]) => Promise<void>;
}) {
    const [dragItemId, setDragItemId] = useState<string | null>(null);
    /* Where the thing being carried would land, as an index into `items`.
       An index rather than a {tile, side} pair because that is what the board
       is *shown* rearranged around — see `previewItems`. */
    const [dropAt, setDropAt] = useState<number | null>(null);
    const [isFileDragOver, setIsFileDragOver] = useState(false);

    const reorder = useCallback((sourceId: string, targetId: string, side: 'before' | 'after') => {
        if (sourceId === targetId) return;
        const from = items.findIndex((i) => i.id === sourceId);
        const to = items.findIndex((i) => i.id === targetId);
        if (from === -1 || to === -1) return;
        const without = items.filter((i) => i.id !== sourceId);
        const at = without.findIndex((i) => i.id === targetId) + (side === 'after' ? 1 : 0);
        setItems([...without.slice(0, at), items[from], ...without.slice(at)]);
    }, [items, setItems]);

    /**
     * Move a tile of this board to `index` in the untouched item order.
     *
     * The same arithmetic `previewItems` uses, and the answer for a drop that
     * arrives before the preview has rendered: a drag fast enough to produce a
     * single dragover — which is what Safari's test build does every time, and
     * any engine can do — committed nothing at all, so the tile sprang back to
     * where it started.
     */
    const moveTileTo = useCallback((sourceId: string, index: number) => {
        const from = items.findIndex((i) => i.id === sourceId);
        if (from === -1) return false;
        const without = items.filter((i) => i.id !== sourceId);
        const at = Math.max(0, Math.min(without.length, index - (from < index ? 1 : 0)));
        setItems([...without.slice(0, at), items[from], ...without.slice(at)]);
        return true;
    }, [items, setItems]);

    /** Insert media at a position, and take it off whoever had it. */
    const insertAt = useCallback((incoming: Block[], index: number) => {
        if (incoming.length === 0) return;
        const at = Math.max(0, Math.min(index, items.length));
        setItems([...items.slice(0, at), ...incoming, ...items.slice(at)]);
    }, [items, setItems]);

    /**
     * A block dragged in from a card, a canvas node, or another board. The source
     * editor registered `chnkItRemoveDraggedBlocks` when the drag began — calling
     * it is what stops the picture existing in two places.
     *
     * Releasing the drag lock by hand is not optional: removing the block unmounts
     * the element being dragged, and a detached element's `dragend` is dispatched
     * into nothing, so the wrapper's own cleanup never runs and the lock stays
     * raised — the editor then looks fine but swallows every click.
     */
    const takeIncoming = useCallback((e: React.DragEvent, index: number) => {
        let incoming: Block[] = [];
        try {
            const raw = readDragData(e, 'application/chnk-it-block-data');
            const parsed = raw ? JSON.parse(raw) : null;
            const blocks: Block[] = parsed?.blocks ?? (parsed?.block ? [parsed.block] : []);
            incoming = toGalleryItems(blocks);
        } catch { /* malformed payload — nothing to take */ }

        if (incoming.length === 0) return;
        insertAt(incoming, index);

        const ids = incoming.map((b) => b.id);
        claimGalleryItem(ids);
        if (typeof window.chnkItRemoveDraggedBlocks === 'function') {
            window.chnkItRemoveDraggedBlocks(ids);
            window.chnkItRemoveDraggedBlocks = null;
        }
        window.chnkItCrossEditorDropHandled = true;
        endBlockDrag();
        window.dispatchEvent(new CustomEvent('chnk-it-clear-selection'));
    }, [insertAt]);

    /**
     * Called the instant a rearrangement begins, from any route — a tile picked
     * up, a picture carried in from outside, a keyboard move.
     *
     * It pins the composition as it stands (see `withResolvedSpans`), which is
     * what stops the board reshaping itself under the gesture. Doing it at the
     * *start* rather than on commit matters: the preview has to show the same
     * shapes the drop will produce, or the board would settle into something
     * other than what the user was looking at when they let go.
     *
     * A no-op once the board is already pinned, and outside bento entirely.
     */
    const pinComposition = useCallback(() => {
        if (readOnly || layout !== 'bento') return;
        const pinned = withResolvedSpans(items, layout);
        // Reference equality: `withResolvedSpans` returns the same items when
        // every shape is already explicit, so a second drag writes nothing.
        if (pinned.some((item, i) => item !== items[i])) setItems(pinned);
    }, [readOnly, layout, items, setItems]);

    /**
     * Where every tile sat when the drag began, in the board's own coordinates.
     *
     * The drop target has to be decided against a layout that does not move,
     * and the one on screen moves constantly: the board shows the arrangement
     * the drop would produce, so every change of mind re-flows it. Reading the
     * live tiles fed that straight back into itself — you hovered a picture,
     * the board rearranged, a *different* picture was now under the cursor,
     * which asked for a different arrangement, and the composition thrashed
     * between two answers without the pointer moving at all.
     *
     * Frozen once per drag, it also fixes the mismatch underneath that loop:
     * `dropAt` indexes the untouched item list — which is what `previewItems`
     * expects — so the geometry it is read from has to be the untouched layout
     * too, not the rearranged one.
     */
    const dragGeometry = useRef<TileBox[] | null>(null);
    /* Skips the arithmetic on the flood of `dragover` events that report the
       same place. Board-local px, so it is the same threshold at every zoom. */
    const lastProbe = useRef<{ x: number; y: number } | null>(null);

    /** Board-local coordinates. The board can sit in the canvas's scaled
     *  viewport, where a client rect is in screen pixels but the layout it is
     *  being compared against is in the board's own. */
    const boardPoint = useCallback((clientX: number, clientY: number) => {
        const host = gridRef.current;
        if (!host) return null;
        const box = host.getBoundingClientRect();
        const scale = host.offsetWidth > 0 ? box.width / host.offsetWidth : 1;
        return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale };
    }, [gridRef]);

    const captureDragGeometry = useCallback(() => {
        const host = gridRef.current;
        if (!host) return;
        const box = host.getBoundingClientRect();
        const scale = host.offsetWidth > 0 ? box.width / host.offsetWidth : 1;
        const shot: TileBox[] = [];
        for (const el of host.querySelectorAll<HTMLElement>('[data-tile-id]')) {
            const id = el.dataset.tileId;
            if (!id || id === SLOT_ID) continue;
            const r = el.getBoundingClientRect();
            shot.push({
                id,
                x: (r.left - box.left) / scale,
                y: (r.top - box.top) / scale,
                w: r.width / scale,
                h: r.height / scale,
            });
        }
        dragGeometry.current = shot;
    }, [gridRef]);

    const forgetDragGeometry = useCallback(() => {
        dragGeometry.current = null;
        lastProbe.current = null;
    }, []);

    /** The index the pointer is asking for, judged against the frozen layout. */
    const dropIndexFromPointer = useCallback((clientX: number, clientY: number): number | null => {
        const geo = dragGeometry.current;
        const at = boardPoint(clientX, clientY);
        if (!geo || geo.length === 0 || !at) return null;

        /* The tile under the pointer, and failing that the nearest one — a
           board has gaps, and on a collage the cards overlap, so "the one you
           are over" is not always a single answer. Containment wins outright;
           distance only separates ties and reaches into the gaps. */
        let best = geo[0];
        let bestScore = Infinity;
        for (const g of geo) {
            const inside = at.x >= g.x && at.x <= g.x + g.w && at.y >= g.y && at.y <= g.y + g.h;
            const dx = at.x - (g.x + g.w / 2);
            const dy = at.y - (g.y + g.h / 2);
            const score = (inside ? 0 : 1e7) + dx * dx + dy * dy;
            if (score < bestScore) { bestScore = score; best = g; }
        }

        const index = items.findIndex((i) => i.id === best.id);
        if (index === -1) return null;
        /* Masonry stacks down a column, so its insertion point is above or
           below the tile you're over — reading the horizontal midpoint there
           would pick an edge nothing is ever inserted at. */
        const after = layout === 'masonry'
            ? at.y > best.y + best.h / 2
            : at.x > best.x + best.w / 2;
        return index + (after ? 1 : 0);
    }, [items, layout, boardPoint]);

    /**
     * One handler for the whole board, reached from a tile or from the space
     * between tiles. Previously only the tiles tracked the drop, so carrying a
     * picture over a gap — or over the board's own padding — left the
     * arrangement frozen at whatever it last showed.
     */
    const trackDrop = useCallback((e: React.DragEvent) => {
        if (!dragGeometry.current) captureDragGeometry();
        const at = boardPoint(e.clientX, e.clientY);
        if (!at) return;
        const last = lastProbe.current;
        if (last && Math.abs(last.x - at.x) < 3 && Math.abs(last.y - at.y) < 3) return;
        lastProbe.current = at;

        const index = dropIndexFromPointer(e.clientX, e.clientY);
        if (index === null || index === dropAt) return;
        // A picture arriving from outside also opens a slot mid-composition,
        // which re-shapes everything after it exactly as a reorder does.
        if (dropAt === null) pinComposition();
        setDropAt(index);
    }, [captureDragGeometry, boardPoint, dropIndexFromPointer, dropAt, pinComposition]);

    /**
     * The board rearranged around the drop, or null when nothing is in flight.
     *
     * This replaces an insertion bar, because the bar could not tell the truth.
     * It marked one edge of one tile — but a dense bento pack re-flows around
     * an insertion, so a picture dropped "after this one" routinely lands
     * somewhere else entirely and half the board moves with it.
     *
     * So the board simply shows the arrangement: the carried tile is *already*
     * in the position it would take, and everything else has already moved out
     * of its way. With FLIP over the top, the composition visibly reorganises
     * under the cursor, and dropping is just agreeing with what you can see.
     * It costs nothing to be wrong about, either — this is local state, and the
     * document is untouched until the drop.
     */
    const previewItems = useMemo(() => {
        if (dropAt === null) return null;

        // A tile of this board being moved within it: take it out and put it back.
        if (dragItemId) {
            const from = items.findIndex((i) => i.id === dragItemId);
            if (from === -1) return null;
            const without = items.filter((i) => i.id !== dragItemId);
            // `dropAt` indexes the untouched list; removing an earlier tile
            // shifts everything after it back one.
            const at = Math.max(0, Math.min(without.length, dropAt - (from < dropAt ? 1 : 0)));
            return [...without.slice(0, at), items[from], ...without.slice(at)];
        }

        /* Arriving from outside: there is no tile to move, so the board holds a
           slot open instead. Same gesture to read — the composition makes room
           — without pretending to know what the picture looks like. */
        const at = Math.max(0, Math.min(items.length, dropAt));
        const slot: Block = { id: SLOT_ID, type: 'image', content: '', metadata: {} };
        return [...items.slice(0, at), slot, ...items.slice(at)];
    }, [dropAt, dragItemId, items]);

    /** Nothing is in flight any more — put the board back to its real order. */
    const clearDropPreview = useCallback(() => {
        setDropAt(null);
        setDragItemId(null);
        forgetDragGeometry();
    }, [forgetDragGeometry]);

    /** Commit whatever the preview is showing: it already is the answer. */
    const commitPreview = () => {
        if (!previewItems) return false;
        setItems(previewItems.filter((i) => i.id !== SLOT_ID));
        return true;
    };

    const onTileDragOver = (e: React.DragEvent) => {
        if (readOnly) return;
        const own = isOwnItemDrag(e);
        if (!own && !isIncomingMedia(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = own ? 'move' : 'copy';
        trackDrop(e);
    };

    const onTileDrop = (e: React.DragEvent, id: string) => {
        if (readOnly) return;
        const own = isOwnItemDrag(e);
        if (!own && !isIncomingMedia(e)) return;
        e.preventDefault();
        e.stopPropagation();

        const at = items.findIndex((i) => i.id === id);
        const pointerIndex = dropIndexFromPointer(e.clientX, e.clientY);
        const index = dropAt ?? pointerIndex ?? (at === -1 ? items.length : at + 1);
        /* The board has been showing this arrangement under the cursor, so
           committing it is the only thing that could match what was just seen.
           With no preview yet, the pointer says where the tile goes. */
        if (own && !commitPreview()) {
            moveTileTo(readDragData(e, GALLERY_ITEM_MIME), index);
        }
        clearDropPreview();
        if (!own) takeIncoming(e, index);
    };

    /* Tiles get handlers whose identity never changes: these close over the
       drop state, which changes on every pointer move during a drag, and a new
       function each time would re-render every tile on the board. */
    const stableTileDragOver = useStableCallback(onTileDragOver);
    const stableTileDrop = useStableCallback(onTileDrop);

    /* ------------- the board's own surface: files, and anything dropped
                     between the tiles rather than onto one ------------- */

    const onGridDragOver = (e: React.DragEvent) => {
        if (readOnly) return;
        if (isFileDrag(e)) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            if (!isFileDragOver) setIsFileDragOver(true);
            return;
        }
        if (!isOwnItemDrag(e) && !isIncomingMedia(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = isOwnItemDrag(e) ? 'move' : 'copy';
        // The gaps between tiles and the board's own padding are part of the
        // board: carrying a picture across them used to leave the arrangement
        // stuck at whatever the last tile it crossed had asked for.
        trackDrop(e);
    };

    const onGridDrop = (e: React.DragEvent) => {
        if (readOnly) return;

        if (e.dataTransfer.files?.length) {
            e.preventDefault();
            e.stopPropagation();
            setIsFileDragOver(false);
            void addFiles(e.dataTransfer.files);
            return;
        }

        const own = isOwnItemDrag(e);
        if (!own && !isIncomingMedia(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const index = dropAt ?? items.length;

        // Dropped on the board's padding rather than on a tile: whatever the
        // preview was last showing stands; failing that, the end.
        if (own) {
            if (!commitPreview()) {
                const sourceId = readDragData(e, GALLERY_ITEM_MIME);
                const pointerIndex = dropIndexFromPointer(e.clientX, e.clientY);
                if (!sourceId) { /* nothing identifiable was carried */ }
                else if (pointerIndex !== null) moveTileTo(sourceId, pointerIndex);
                else {
                    // Nowhere in particular: the end of the board.
                    const last = items[items.length - 1];
                    if (last && sourceId !== last.id) reorder(sourceId, last.id, 'after');
                }
            }
            clearDropPreview();
            return;
        }
        clearDropPreview();
        takeIncoming(e, index);
    };

    const onGridDragLeave = (e: React.DragEvent) => {
        // Only when the pointer has genuinely left the board, not on every
        // crossing between two tiles inside it.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsFileDragOver(false);
        /* Carried back out again: the board closes up and shows its real
           arrangement, so it never sits holding a gap open for a picture that
           went somewhere else. The frozen layout goes with it — the board is
           back in its true order now, so a picture carried in again measures
           that. */
        setDropAt(null);
        forgetDragGeometry();
    };

    return {
        dragItemId,
        setDragItemId,
        dropAt,
        isFileDragOver,
        previewItems,
        pinComposition,
        clearDropPreview,
        onTileDragOver: stableTileDragOver,
        onTileDrop: stableTileDrop,
        onGridDragOver,
        onGridDrop,
        onGridDragLeave,
    };
}
