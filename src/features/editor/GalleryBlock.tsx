import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    LayoutGrid, Rows3, Squircle, Layers, Plus, X, Scaling, Play, FileText, ImageOff,
    Undo2, Crosshair, Expand, RotateCcw,
} from '../../components/icons';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockMetadata } from './types';
import { ingestFiles, AssetImage, AssetVideo } from '../../services/assets';
import { canThumbnail, displaySrc, makeThumbnail } from './mediaThumbnail';
import {
    cellSizeForHeight, claimGalleryItem, clampTileRatio, columnsForWidth, dealMasonry,
    dealScatter, clearManualSpans, getGalleryFit, getGalleryItems, getGalleryLayout,
    getManualSpan, hasManualSpans, masonryColumnsForWidth, nextSpan,
    packBoard, resolveSpan, scatterLanesForWidth, spanCells, spanLabel, toGalleryItems,
    withResolvedSpans,
    GALLERY_DRAG_MIME, GALLERY_ITEM_MIME, MASONRY_FALLBACK_RATIO,
    type GalleryFit, type GalleryLayout, type GallerySpan,
} from './galleryTypes';
import { endBlockDrag } from './blockDragLock';
import { useTileFlip } from './useTileFlip';
import { MediaLightbox } from '../ui/MediaLightbox';
import styles from './GalleryBlock.module.css';
import { Tabs, type TabItem } from '../../components/ui/Tabs';

interface GalleryBlockProps {
    block: Block;
    readOnly?: boolean;
    /**
     * Every write goes through the whole-block patch, never the string-content
     * path. That path runs the editor's markdown shortcuts and slash detection
     * against whatever it's handed — so a board titled "- refs" would convert
     * itself into a todo and take its pictures with it.
     */
    onReplace?: (patch: Partial<Block>) => void;
    /** True on the canvas, where the node owns the chrome and space is tight. */
    disableMediaControls?: boolean;
}

/** Gap between tiles, in px. Mirrored by --gal-gap in the stylesheet. */
const GAP = 8;

/** A picture's focal point, in percent of its own frame — `object-position`. */
type Focal = { x: number; y: number };

/** The empty slot held open for a picture arriving from outside the board. */
const SLOT_ID = '__gallery-drop-slot__';

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** The point of the picture the pointer is over, as `object-position` percents. */
const focalFromPointer = (el: HTMLElement, clientX: number, clientY: number): Focal => {
    const r = el.getBoundingClientRect();
    return {
        x: clampPct(((clientX - r.left) / Math.max(1, r.width)) * 100),
        y: clampPct(((clientY - r.top) / Math.max(1, r.height)) * 100),
    };
};

/** Size of the thumbnail dragged under the cursor. */
const DRAG_PREVIEW_W = 132;
const DRAG_PREVIEW_H = 96;

/**
 * The thumbnail shown under the cursor while a tile is being dragged.
 *
 * Without one, the browser snapshots the tile where it sits — inside the
 * canvas's scaled viewport — so the thing following the cursor is whatever size
 * the current zoom happened to make it: a postage stamp zoomed out, a slab
 * zoomed in, and blurry either way. A preview built outside that transform is
 * the same crisp size at every zoom.
 *
 * The tile's own `<img>` is cloned rather than a fresh one created: its bitmap
 * is already decoded, and the browser snapshots this element the instant
 * `dragstart` returns — a new `<img>`, even from a data URL, can still be
 * undecoded at that moment and snapshot blank.
 */
function buildDragPreview(tile: HTMLElement, item: Block): HTMLElement {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    /* Parked offscreen: it must be laid out and painted to be snapshotted, so it
       cannot be `display:none` or detached.
       The corner echoes --media-radius scaled down — the preview is about a
       third of a tile, and a tile's full corner on something this small rounds
       it away into a lozenge. */
    host.style.cssText = `
        position:fixed; top:0; left:-10000px;
        width:${DRAG_PREVIEW_W}px; height:${DRAG_PREVIEW_H}px;
        border-radius:16px; overflow:hidden; pointer-events:none;
        background:#111; box-shadow:0 10px 24px rgba(0,0,0,.4);
    `;

    const img = tile.querySelector('img');
    if (img) {
        const clone = img.cloneNode(true) as HTMLImageElement;
        clone.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        clone.removeAttribute('class');
        host.appendChild(clone);
    } else {
        // Video and file tiles have no bitmap to clone — a labelled plate reads
        // better than an empty box.
        const label = document.createElement('div');
        label.textContent = item.metadata?.name || item.type;
        label.style.cssText = `
            width:100%; height:100%; display:flex; align-items:center;
            justify-content:center; padding:8px; box-sizing:border-box;
            font: 500 11px/1.3 system-ui, sans-serif; color:#fff;
            text-align:center; word-break:break-word;
        `;
        host.appendChild(label);
    }

    document.body.appendChild(host);
    return host;
}

const LAYOUTS: { id: GalleryLayout; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'bento', label: 'Bento — mixed sizes', icon: Squircle },
    { id: 'grid', label: 'Grid — equal tiles', icon: LayoutGrid },
    { id: 'masonry', label: 'Masonry — natural heights', icon: Rows3 },
    { id: 'scatter', label: 'Collage — pinned, tilted, overlapping', icon: Layers },
];

/* The same four layouts as tab items. The label doubles as the tooltip and
   the accessible name, since these tabs are glyphs only. */
const LAYOUT_TABS: TabItem<GalleryLayout>[] = LAYOUTS.map(({ id, label, icon: Icon }) => ({
    id,
    ariaLabel: label,
    icon: <Icon size={15} />,
}));

const LAYOUT_CLASS: Record<GalleryLayout, string> = {
    bento: styles.layoutBento,
    grid: styles.layoutGrid,
    masonry: styles.layoutMasonry,
    scatter: styles.layoutScatter,
};

/**
 * The moodboard. A bento grid of media that reads as one composition instead of
 * a list of attachments.
 *
 * Column count is measured, not declared: the same block renders inside a 432px
 * canvas node and across a full-screen card, and any fixed count is wrong at one
 * of those. From the measured width come both the column count and the row
 * height, which is what keeps a `lg` tile actually square rather than whatever
 * shape the content happened to force.
 */
export const GalleryBlock = memo(function GalleryBlock({
    block, readOnly, onReplace, disableMediaControls,
}: GalleryBlockProps) {
    const items = getGalleryItems(block);
    const layout = getGalleryLayout(block);
    const fit = getGalleryFit(block);

    const gridRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragPreviewRef = useRef<HTMLElement | null>(null);
    const [width, setWidth] = useState(0);
    /* Natural aspect ratios, reported by each bitmap as it decodes. Only masonry
       reads them, but they are collected in every layout: switching to masonry
       must not wait on a second round of load events for pictures the browser
       has already cached. */
    const [ratios, setRatios] = useState<Record<string, number>>({});
    const [lightboxId, setLightboxId] = useState<string | null>(null);
    const [dragItemId, setDragItemId] = useState<string | null>(null);
    /* Where the thing being carried would land, as an index into `items`.
       An index rather than the old {tile, side} pair because that is what the
       board is now *shown* rearranged around — see `previewItems`. */
    const [dropAt, setDropAt] = useState<number | null>(null);
    const [isFileDragOver, setIsFileDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resizingTileId, setResizingTileId] = useState<string | null>(null);
    const [resizeStart, setResizeStart] = useState<{ x: number, y: number, span: GallerySpan } | null>(null);
    /* Adjusting the crop is a mode, not a per-tile handle: you go round a board
       fixing several pictures at once, and a handle per tile would be four more
       controls competing for the corner of every thumbnail. Local state, never
       stored — it is a thing you are doing, not a property of the board. */
    const [focusMode, setFocusMode] = useState(false);
    /* Which pictures the next action applies to. Arranging a board is bulk work
       — you cull six, promote three, move a cluster to another board — and
       every operation here was one-at-a-time. Held as an array, not a Set, so
       it is a plain value React can compare and a range can be read off it. */
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    /* The anchor a Shift range extends from. A ref, not state: it only ever
       affects the *next* click, so re-rendering for it would be waste. */
    const rangeAnchor = useRef<string | null>(null);
    /* Rubber band, in the grid's own coordinates. */
    const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    const [presenting, setPresenting] = useState(false);
    /* The focal point under the pointer right now. Held locally so dragging
       previews at pointer rate; only the release writes to the document. */
    const [draftFocal, setDraftFocal] = useState<{ id: string; focal: Focal } | null>(null);

    /* One observer per board, and it only records the width — the column count
       is derived, because the two layouts want different counts from the same
       number and re-observing on every layout switch would be a tear-down for
       nothing. */
    useLayoutEffect(() => {
        const el = gridRef.current;
        if (!el) return;
        const measure = (next: number) => {
            if (next > 0) setWidth((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
        };
        measure(el.getBoundingClientRect().width);
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) measure(entry.contentRect.width);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    /* Bento counts cells, masonry counts columns of pictures — see
       `masonryColumnsForWidth`. Before the first measurement, three is the
       sensible guess for both. */
    const columns = useMemo(() => {
        if (width <= 0) return 3;
        if (layout !== 'masonry') return columnsForWidth(width);
        // Never more columns than pictures: a wide board holding two of them
        // would otherwise deal one per column and leave the rest of the width
        // as blank tracks, which reads as a broken layout rather than a sparse
        // one. Fewer, wider columns is the composed answer.
        return Math.min(masonryColumnsForWidth(width), Math.max(1, items.length));
    }, [width, layout, items.length]);

    /* Width drives the row height too, so a tile spanning two columns is twice
       as wide AND twice as tall — the thing that makes a bento read as composed
       rather than accidental. */
    const cell = useMemo(() => (
        width <= 0 ? 120 : Math.max(48, Math.round((width - (columns - 1) * GAP) / columns))
    ), [width, columns]);

    const noteRatio = useCallback((id: string, ratio: number) => {
        if (!Number.isFinite(ratio) || ratio <= 0) return;
        setRatios((prev) => (
            // Same shape twice over is the common case (a re-render, a cache
            // hit); returning `prev` keeps it from being a render loop.
            Math.abs((prev[id] ?? 0) - ratio) < 1e-3 ? prev : { ...prev, [id]: ratio }
        ));
    }, []);

    /* The offscreen thumbnail has to be torn down by hand from several places:
       `dragend` covers the ordinary case, but a tile accepted elsewhere is
       removed from this board mid-drag, and a detached element's `dragend` is
       dispatched into nothing. Left behind it is an invisible node that
       accumulates one per drag. */
    const clearDragPreview = useCallback(() => {
        dragPreviewRef.current?.remove();
        dragPreviewRef.current = null;
    }, []);

    useEffect(() => clearDragPreview, [clearDragPreview]);

    const commit = useCallback((patch: Partial<BlockMetadata>) => {
        onReplace?.({ metadata: { ...block.metadata, ...patch } });
    }, [block.metadata, onReplace]);

    const setItems = useCallback((next: Block[]) => commit({ items: next }), [commit]);

    const addFiles = useCallback(async (files: FileList | File[]) => {
        const list = Array.from(files);
        if (list.length === 0) return;
        setError(null);
        // Store every file before writing once — a per-file commit would make
        // each read race the previous state and silently drop all but the last.
        const { files: stored, errors } = await ingestFiles(list);
        const added: Block[] = stored.map((f) => ({
            id: uuidv4(),
            type: f.type,
            content: f.ref,
            metadata: f.metadata,
        }));
        if (added.length) setItems([...getGalleryItems(block), ...added]);
        if (errors.length) setError(errors[0]);
    }, [block, setItems]);

    /**
     * Give every picture on the board a downscaled copy to render from.
     *
     * It runs here rather than at the point media is added because there are
     * five ways onto a board — the picker, a drop, a paste, a block dragged in
     * from a card, a whole board merged into another — and a boarded picture
     * that missed its thumbnail is indistinguishable from one that never had a
     * chance at one. Sweeping the items covers all five and heals old boards
     * saved before thumbnails existed.
     *
     * `attempted` is what stops it spinning: `makeThumbnail` returns null for
     * anything not worth shrinking, and without a record of having asked, every
     * commit would re-ask for the same nulls forever.
     */
    const attempted = useRef<Set<string>>(new Set());
    /* Advances the sweep when a picture turns out not to need a thumbnail.
       Making one changes `items` and re-runs this effect on its own; declining
       to make one changes nothing, so without a nudge the sweep would stop at
       the first picture that was already small enough. */
    const [sweep, setSweep] = useState(0);

    useEffect(() => {
        if (readOnly || !onReplace) return;
        /* Never while something is being carried. Encoding a bitmap is the one
           genuinely expensive thing this component does, it holds the main
           thread for the length of it, and pinning the composition at the
           start of a drag changes `items` — which is exactly what wakes this
           sweep. The result was a stall on the first frame of every drag on a
           board that still had thumbnails outstanding. It picks up again the
           moment the picture is put down. */
        if (dragItemId !== null || dropAt !== null) return;
        const next = items.find((i) => (
            !i.metadata?.thumb && canThumbnail(i.content) && !attempted.current.has(i.id)
        ));
        if (!next) return;

        /* One picture per run, not a batch. Encoding a dozen bitmaps takes long
           enough that the board is very likely to change underneath — and a
           batch interrupted half way through loses every result it had already
           computed, because the single commit at the end never happens. One at
           a time, each result is banked as soon as it exists, and an
           interrupted picture is simply still pending on the next pass.
           It also spreads the encoding over separate frames instead of holding
           the main thread for the length of the whole board. */
        let live = true;
        (async () => {
            const thumb = await makeThumbnail(next.content);
            // Interrupted: leave it unattempted so a later pass picks it up.
            if (!live) return;
            attempted.current.add(next.id);
            if (!thumb) {
                setSweep((s) => s + 1);
                return;
            }
            /* Re-read the board rather than closing over `items`: the tile may
               have been removed or reordered while this was encoding, and
               writing the stale list back would resurrect it. */
            setItems(getGalleryItems(block).map((i) => (
                i.id === next.id ? { ...i, metadata: { ...i.metadata, thumb } } : i
            )));
        })();

        return () => { live = false; };
        // `block` is deliberately absent: it changes on every commit, including
        // the one this effect makes, and the sweep only ever needs to react to
        // the item list itself.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, sweep, readOnly, onReplace, setItems, dragItemId, dropAt]);

    /**
     * Paste straight onto the board.
     *
     * Without this the editor's own paste handling wins and a copied image
     * becomes a *separate* media block below the card — which then has to be
     * dragged back onto the board by hand. Copy-paste is how references are
     * actually collected, so the board has to be a paste target in its own
     * right.
     *
     * It only claims the event when the clipboard actually carries media, so
     * pasting text into the board's title still behaves like pasting text.
     */
    const onPaste = useCallback((e: React.ClipboardEvent) => {
        if (readOnly) return;
        const files = Array.from(e.clipboardData?.files ?? [])
            .filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
        if (files.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        void addFiles(files);
    }, [readOnly, addFiles]);

    /**
     * Removing is one click with no confirmation, which is right — a board is
     * arranged by trying things — but only if it can be taken back. The removed
     * picture is held with the position it came from, so undo restores the
     * composition and not merely the file.
     *
     * A confirm dialog would be the wrong trade: it taxes every deletion to
     * protect against the rare one, and it interrupts exactly the fast,
     * unthinking pruning that arranging a moodboard is made of.
     */
    const undoTimer = useRef<number | undefined>(undefined);
    /* A list, because a removal can now be a whole selection. Each picture is
       held with the index it came from so undo restores the composition and not
       merely the files. */
    const [undoable, setUndoable] = useState<{ item: Block; index: number }[] | null>(null);

    const clearUndo = useCallback(() => {
        window.clearTimeout(undoTimer.current);
        undoTimer.current = undefined;
        setUndoable(null);
    }, []);

    useEffect(() => () => window.clearTimeout(undoTimer.current), []);

    const removeMany = useCallback((ids: string[]) => {
        const set = new Set(ids);
        const taken = items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => set.has(item.id));
        if (taken.length === 0) return;
        setItems(items.filter((i) => !set.has(i.id)));
        window.clearTimeout(undoTimer.current);
        setUndoable(taken);
        // Long enough to notice and reach, short enough that it isn't a
        // permanent bar across the bottom of the board.
        undoTimer.current = window.setTimeout(() => setUndoable(null), 7000);
    }, [items, setItems]);

    const removeItem = useCallback((id: string) => removeMany([id]), [removeMany]);

    const undoRemove = useCallback(() => {
        if (!undoable) return;
        /* Rebuilt from the live board, not from the list captured at removal:
           anything added or reordered since must survive the undo. Restored in
           ascending index order so each splice lands where the one before it
           left the list, and clamped because the board may now be shorter. */
        const next = [...getGalleryItems(block)];
        for (const { item, index } of [...undoable].sort((a, b) => a.index - b.index)) {
            next.splice(Math.min(index, next.length), 0, item);
        }
        setItems(next);
        clearUndo();
    }, [undoable, block, setItems, clearUndo]);

    /* Steps the tile's own span, `auto` included — see `nextSpan`. Reached from
       the keyboard; the pointer gets the corner handle. */
    const cycleSpan = useCallback((id: string) => {
        setItems(items.map((i) => (
            i.id === id ? { ...i, metadata: { ...i.metadata, span: nextSpan(getManualSpan(i)) } } : i
        )));
    }, [items, setItems]);

    const setFocal = useCallback((id: string, focal: Focal | undefined) => {
        setItems(items.map((i) => (
            i.id === id ? { ...i, metadata: { ...i.metadata, focal } } : i
        )));
    }, [items, setItems]);

    /* Leaving the mode is Escape, the same as everywhere else. Bound while the
       mode is on and not before, so a board sitting idle isn't holding a
       window listener that swallows Escape from whatever is really focused. */
    useEffect(() => {
        if (!focusMode) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setFocusMode(false);
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [focusMode]);

    // Whole frames are already fully visible, so there is no crop to place.
    const canAdjustFocus = fit === 'cover';
    useEffect(() => {
        if (!canAdjustFocus) setFocusMode(false);
    }, [canAdjustFocus]);

    /** `undefined` hands the tile back to the board's automatic rhythm. */
    const setSpan = useCallback((id: string, newSpan: GallerySpan | undefined) => {
        setItems(items.map((i) => (
            i.id === id ? { ...i, metadata: { ...i.metadata, span: newSpan } } : i
        )));
    }, [items, setItems]);

    /** One size for a whole selection, in one write. */
    const setSpanMany = useCallback((ids: string[], newSpan: GallerySpan | undefined) => {
        const set = new Set(ids);
        setItems(items.map((i) => (
            set.has(i.id) ? { ...i, metadata: { ...i.metadata, span: newSpan } } : i
        )));
    }, [items, setItems]);

    /* ---------------- tile reordering ---------------- */

    const reorder = useCallback((sourceId: string, targetId: string, side: 'before' | 'after') => {
        if (sourceId === targetId) return;
        const from = items.findIndex((i) => i.id === sourceId);
        const to = items.findIndex((i) => i.id === targetId);
        if (from === -1 || to === -1) return;
        const next = [...items];
        const [moved] = next.splice(from, 1);
        const insertAt = next.findIndex((i) => i.id === targetId) + (side === 'after' ? 1 : 0);
        next.splice(insertAt, 0, moved);
        setItems(next);
    }, [items, setItems]);

    /**
     * Move a tile by `delta` places, for the keyboard.
     *
     * Rearranging is the board's primary gesture and it was pointer-only, so a
     * keyboard user could look at a moodboard but not arrange one. Deliberately
     * a move within the item order rather than a spatial "one to the left":
     * the order *is* the composition — every layout is a function of it — and a
     * dense bento pack has no stable notion of the cell to the left anyway.
     *
     * Focus has to be put back by hand: the tile is the same React element but
     * it moves in the DOM, and a moved element loses focus.
     */
    const moveBy = useCallback((id: string, delta: number) => {
        const from = items.findIndex((i) => i.id === id);
        if (from === -1) return;
        const to = Math.max(0, Math.min(items.length - 1, from + delta));
        if (to === from) return;
        /* Pinned in the same write as the move: a keyboard rearrangement is
           just as entitled to keep its shapes as a dragged one, and doing it
           separately would be two commits for one keystroke. */
        const next = [...withResolvedSpans(items, layout)];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setItems(next);
        requestAnimationFrame(() => {
            gridRef.current
                ?.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(id)}"]`)
                ?.focus();
        });
    }, [items, setItems, layout]);

    /* ---------------- selection ---------------- */

    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
    const clearSelection = useCallback(() => {
        setSelectedIds([]);
        rangeAnchor.current = null;
    }, []);

    /* A selection only means anything while the pictures in it exist. Without
       this, removing a selected tile leaves its id in the set and the count in
       the bar keeps claiming a picture that is gone. */
    useEffect(() => {
        setSelectedIds((prev) => {
            const live = prev.filter((id) => items.some((i) => i.id === id));
            return live.length === prev.length ? prev : live;
        });
    }, [items]);

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

    /** Escape gives the board back. */
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

    /** Insert media at a position, and take it off whoever had it. */
    const insertAt = useCallback((incoming: Block[], index: number) => {
        if (incoming.length === 0) return;
        const next = [...items];
        next.splice(Math.max(0, Math.min(index, next.length)), 0, ...incoming);
        setItems(next);
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
            const raw = e.dataTransfer.getData('application/chnk-it-block-data');
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

    /** A tile of THIS board being moved within it. */
    const isOwnItemDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(GALLERY_ITEM_MIME);
    /** Media arriving from outside — a card's block, a canvas node, another board.
     *  Anything that isn't media keeps bubbling to the block wrapper, which knows
     *  what to do with it. */
    const isIncomingMedia = (e: React.DragEvent) =>
        !isOwnItemDrag(e)
        && e.dataTransfer.types.includes(GALLERY_DRAG_MIME)
        && e.dataTransfer.types.includes('application/chnk-it-block-data');
    const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

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
    const dragGeometry = useRef<{ id: string; x: number; y: number; w: number; h: number }[] | null>(null);
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
    }, []);

    const captureDragGeometry = useCallback(() => {
        const host = gridRef.current;
        if (!host) return;
        const box = host.getBoundingClientRect();
        const scale = host.offsetWidth > 0 ? box.width / host.offsetWidth : 1;
        const shot: { id: string; x: number; y: number; w: number; h: number }[] = [];
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
    }, []);

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
        const index = dropAt ?? (at === -1 ? items.length : at + 1);
        setDropAt(null);
        setDragItemId(null);
        forgetDragGeometry();

        if (own) {
            // The preview already is the answer — the board has been showing
            // this arrangement under the cursor, so committing it is the only
            // thing that could match what the user just saw.
            if (previewItems) setItems(previewItems.filter((i) => i.id !== SLOT_ID));
            return;
        }
        takeIncoming(e, index);
    };

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
        setDropAt(null);
        setDragItemId(null);
        forgetDragGeometry();

        // Dropped on the board's padding rather than on a tile: whatever the
        // preview was last showing stands; failing that, the end.
        if (own) {
            if (previewItems) { setItems(previewItems.filter((i) => i.id !== SLOT_ID)); return; }
            const sourceId = e.dataTransfer.getData(GALLERY_ITEM_MIME);
            const last = items[items.length - 1];
            if (sourceId && last && sourceId !== last.id) reorder(sourceId, last.id, 'after');
            return;
        }
        takeIncoming(e, index);
    };

    /* ---------------- what the board is showing right now ---------------- */

    /**
     * The board rearranged around the drop, or null when nothing is in flight.
     *
     * This replaces the insertion bar, and it replaces it because the bar could
     * not tell the truth. It marked one edge of one tile — but a dense bento
     * pack re-flows around an insertion, so a picture dropped "after this one"
     * routinely lands somewhere else entirely and half the board moves with it.
     * A marker that is wrong most of the time is worse than none.
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
            const next = [...items];
            const [moved] = next.splice(from, 1);
            // `dropAt` indexes the untouched list; removing an earlier tile
            // shifts everything after it back one.
            next.splice(Math.max(0, Math.min(next.length, dropAt - (from < dropAt ? 1 : 0))), 0, moved);
            return next;
        }

        /* Arriving from outside: there is no tile to move, so the board holds a
           slot open instead. Same gesture to read — the composition makes room
           — without pretending to know what the picture looks like. */
        const next: Block[] = [...items];
        next.splice(Math.max(0, Math.min(next.length, dropAt)), 0, {
            id: SLOT_ID, type: 'image', content: '', metadata: {},
        });
        return next;
    }, [dropAt, dragItemId, items]);

    /** What actually gets laid out: the preview while dragging, else the board. */
    const boardItems = previewItems ?? items;

    /** Nothing is in flight any more — put the board back to its real order. */
    const clearDropPreview = useCallback(() => {
        setDropAt(null);
        setDragItemId(null);
        forgetDragGeometry();
    }, [forgetDragGeometry]);

    /* ---------------- lightbox ---------------- */

    const viewable = useMemo(
        () => items.filter((i) => i.type === 'image' || i.type === 'video'),
        [items],
    );

    /* The open picture is tracked by id, not by position. An index would go stale
       the moment a tile is removed or reordered underneath it — pointing at a
       different picture, or past the end — and the viewer would need an effect to
       chase it. By id, a removed picture simply resolves to nothing and closes. */
    const openIndex = lightboxId ? viewable.findIndex((i) => i.id === lightboxId) : -1;
    const active = openIndex >= 0 ? viewable[openIndex] : undefined;

    const step = (delta: number) => {
        if (viewable.length === 0) return;
        const next = (openIndex + delta + viewable.length) % viewable.length;
        setLightboxId(viewable[next].id);
    };

    /* ---------------- render ---------------- */

    /* Hand-dragged height. The board doesn't crop to it — it re-solves its cell
       size so the whole composition fills the box, which is the point of
       resizing a moodboard rather than a document. Width still decides the
       column count, so dragging the corner recomposes in both axes. */
    const boardHeight = typeof block.metadata?.galleryHeight === 'number'
        ? block.metadata.galleryHeight
        : undefined;

    /* Row count drives the height solve — measured on what is actually laid
       out, so a board holding a slot open doesn't clip it. */
    const rows = useMemo(() => {
        // Neither of the free-flowing layouts has cells to count.
        if (layout === 'masonry' || layout === 'scatter') return 1;
        const n = boardItems.length;
        const shapes = boardItems.map((item, i) => spanCells(resolveSpan(item, i, n, layout), columns));
        if (layout === 'grid') return Math.ceil(shapes.length / Math.max(1, columns));
        return packBoard(shapes, columns);
    }, [boardItems, layout, columns]);

    /* The collage. Absolutely placed rather than laid out by the browser: cards
       overlap on purpose, and no flow algorithm produces overlap. Every card's
       size, drift and tilt is seeded from its own id, so the composition is
       stable across renders and survives a rearrangement — see `dealScatter`. */
    const scatter = useMemo(() => {
        if (layout !== 'scatter' || boardItems.length === 0) return null;
        // Before the first measurement, a sensible board width — the observer
        // corrects it on the next frame and FLIP is silent for a resize.
        const w = width > 0 ? width : 640;
        return dealScatter(
            boardItems.map((item) => ({ id: item.id, ratio: ratios[item.id] ?? MASONRY_FALLBACK_RATIO })),
            w,
            scatterLanesForWidth(w),
        );
    }, [layout, boardItems, width, ratios]);

    // Masonry and the collage have no rows to solve — they own their own flow —
    // so a set height is a floor for them rather than something the tiles are
    // scaled into.
    const scalesToFit = boardHeight !== undefined && layout !== 'masonry' && layout !== 'scatter';
    const rowSize = scalesToFit ? cellSizeForHeight(boardHeight, rows, GAP) : cell;

    /* A floor, never a ceiling. The board never scrolls: a moodboard you have
       to scroll is no longer a composition you can see, and the height you
       dragged is a statement about how much room the pictures get, not a window
       cut over a taller board. Bento and grid re-solve their cell size to land
       on it exactly; when that solve bottoms out at the minimum cell — a board
       dragged shorter than its own tiles can be — the board grows past the
       floor instead of clipping what it can't fit. */
    const gridVars = {
        '--gal-cols': columns,
        '--gal-row': `${rowSize}px`,
        '--gal-gap': `${GAP}px`,
        ...(boardHeight !== undefined ? { minHeight: `${boardHeight}px` } : null),
        /* The collage's own height: its cards are out of flow, so the container
           has no height of its own to give the board. */
        ...(scatter ? { height: `${scatter.height}px` } : null),
    } as React.CSSProperties;

    /* Masonry's columns are solved here rather than handed to CSS `columns`,
       which fills column-first and so scrambles the order the board was
       arranged in. See `dealMasonry`. */
    const masonry = useMemo(() => {
        // An empty board is nothing but the add tile, and dealt into one column
        // it would be a third of a prompt beside two empty columns.
        if (layout !== 'masonry' || boardItems.length === 0) return null;
        const entries = boardItems.map((item, index) => ({ item, index }));
        const { columns: cols } = dealMasonry(
            entries, columns, (e) => ratios[e.item.id] ?? MASONRY_FALLBACK_RATIO,
        );
        return { cols };
    }, [layout, boardItems, columns, ratios]);

    /* Seen to move when the order or the layout changes; silently re-measured
       when anything else shifts the tiles. See `useTileFlip`. */
    const flipSignature = `${layout}|${boardItems.map((i) => i.id).join(',')}`;
    useTileFlip(gridRef, flipSignature, [flipSignature, columns, rowSize, width, ratios]);

    const compact = !!disableMediaControls;
    const showToolbar = !readOnly;

    /* One tile, rendered identically in every layout — only its sizing differs,
       and that arrives as inline style: grid spans in bento and grid, a natural
       aspect ratio in masonry. */
    const renderTile = (item: Block, index: number) => {
        const span = resolveSpan(item, index, boardItems.length, layout);
        const { cols, rows: tileRows } = spanCells(span, columns);
        const place = scatter?.places.get(item.id);
        /* Tilt and stacking travel as custom properties rather than as `rotate`
           and `z-index` directly: an inline declaration would beat the hover
           rule that straightens the card and lifts it to the front, and a
           `!important` in a stylesheet to win back what this file just took is
           the wrong way round. */
        const tileVars = layout === 'scatter'
            ? ({
                left: place?.x ?? 0,
                top: place?.y ?? 0,
                width: place?.w ?? 0,
                height: place?.h ?? 0,
                '--gal-rot': `${place?.rot ?? 0}deg`,
                '--gal-z': place?.z ?? 1,
            } as React.CSSProperties)
            : layout === 'masonry'
                ? ({ aspectRatio: clampTileRatio(ratios[item.id]) } as React.CSSProperties)
                : ({ gridColumn: `span ${cols}`, gridRow: `span ${tileRows}` } as React.CSSProperties);

        /* The room being held open for a picture arriving from outside. It is
           in the item list, and only in the item list, because that is what
           makes every other tile move aside for it — and makes FLIP animate
           them doing so. It is inert: no drag, no focus, no controls. */
        if (item.id === SLOT_ID) {
            return (
                <div
                    key={item.id}
                    data-tile-id={item.id}
                    className={styles.dropSlot}
                    style={tileVars}
                    aria-hidden="true"
                />
            );
        }

        const label = item.metadata?.name || `${item.type} ${index + 1}`;

        /* In focus mode a tile stops being a button and becomes a surface you
           push the picture around inside. Only media has a crop to place — a
           file tile has nothing behind its icon. */
        const adjusting = focusMode && !readOnly
            && (item.type === 'image' || item.type === 'video');
        const focal = draftFocal?.id === item.id ? draftFocal.focal : item.metadata?.focal;

        return (
            <div
                key={item.id}
                /* A tile opens the picture, so it is a button and has to behave
                   like one: reachable by Tab, activated by Enter or Space, and
                   announced with a name. It stays a `div` because a real
                   `<button>` cannot be a native drag source in Firefox, and
                   rearranging is the board's primary gesture. */
                role="button"
                tabIndex={0}
                /* Found again after a keyboard move, which detaches and
                   re-inserts the element — see `moveBy`. */
                data-tile-id={item.id}
                aria-label={adjusting ? `Set the focal point of ${label}` : `Open ${label}`}
                onKeyDown={(e) => {
                    if (adjusting) {
                        // Nudge the crop a step at a time — the same reach a
                        // pointer has, without one.
                        const step = e.shiftKey ? 10 : 2;
                        const d: Record<string, [number, number]> = {
                            ArrowLeft: [-step, 0], ArrowRight: [step, 0],
                            ArrowUp: [0, -step], ArrowDown: [0, step],
                        };
                        if (d[e.key]) {
                            e.preventDefault();
                            e.stopPropagation();
                            const base = item.metadata?.focal ?? { x: 50, y: 50 };
                            setFocal(item.id, {
                                x: clampPct(base.x + d[e.key][0]),
                                y: clampPct(base.y + d[e.key][1]),
                            });
                        }
                        return;
                    }
                    if (readOnly) {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        e.stopPropagation();
                        setLightboxId(item.id);
                        return;
                    }

                    /* Modifier + arrow moves the tile. Unmodified arrows are
                       left alone deliberately — they are how you walk a board,
                       and a board where arrowing to look at the next picture
                       rearranged it would be unusable. */
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                        e.preventDefault();
                        e.stopPropagation();
                        moveBy(item.id, e.key === 'ArrowRight' ? 1 : -1);
                        return;
                    }
                    // Home/End send it to the ends, the same as any list.
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'Home' || e.key === 'End')) {
                        e.preventDefault();
                        e.stopPropagation();
                        moveBy(item.id, e.key === 'End' ? items.length : -items.length);
                        return;
                    }
                    /* The size button used to live in the tile's corner; this
                       is where its steppability went. Bento only — the other
                       layouts have no per-tile size to step. */
                    if (e.key === 's' && layout === 'bento') {
                        e.preventDefault();
                        e.stopPropagation();
                        cycleSpan(item.id);
                        return;
                    }
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        e.preventDefault();
                        e.stopPropagation();
                        // Whatever the selection is, if this tile is in it.
                        if (selected.has(item.id) && selectedIds.length > 1) {
                            removeMany(selectedIds);
                            clearSelection();
                        } else {
                            removeItem(item.id);
                        }
                        return;
                    }
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    // Space scrolls the page by default, and the editor's own
                    // key handling treats Enter as a block split.
                    e.preventDefault();
                    e.stopPropagation();
                    setLightboxId(item.id);
                }}
                onPointerDown={adjusting ? (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDraftFocal({
                        id: item.id,
                        focal: focalFromPointer(e.currentTarget, e.clientX, e.clientY),
                    });
                } : undefined}
                onPointerMove={adjusting ? (e) => {
                    if (draftFocal?.id !== item.id) return;
                    e.stopPropagation();
                    setDraftFocal({
                        id: item.id,
                        focal: focalFromPointer(e.currentTarget, e.clientX, e.clientY),
                    });
                } : undefined}
                onPointerUp={adjusting ? (e) => {
                    if (draftFocal?.id !== item.id) return;
                    e.stopPropagation();
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    // One write for the whole gesture, not one per frame.
                    setFocal(item.id, draftFocal.focal);
                    setDraftFocal(null);
                } : undefined}
                /* `nodrag` is React Flow's opt-out, and without it a tile
                   cannot be dragged at all on the canvas: the press starts a
                   node-drag gesture, and that gesture installs a capture-phase
                   `dragstart` killer on the window, so the browser's own drag
                   never begins. Only the tiles opt out — the board's background
                   keeps dragging the node, which is what moves the whole board
                   now that it has no grip handle. */
                aria-pressed={selected.has(item.id) || undefined}
                className={`
                    ${styles.tile}
                    ${dragItemId === item.id ? styles.tileDragging : ''}
                    ${resizingTileId === item.id ? styles.tileResizing : ''}
                    ${adjusting ? styles.tileAdjusting : ''}
                    ${selected.has(item.id) ? styles.tileSelected : ''}
                    mediaViewTarget nodrag
                `}
                style={tileVars}
                /* Not draggable while adjusting: the press is a pan of the
                   picture inside its frame, and a native drag starting under it
                   would rip the tile off the board instead. */
                draggable={!readOnly && !adjusting}
                onDragStart={(e) => {
                    if (readOnly) return;
                    // Claim this drag: without it the wrapper starts a block
                    // drag and reordering a tile would fling the whole board
                    // into another card.
                    e.stopPropagation();
                    clearDragPreview();   // stale one from an aborted drag
                    // Pin the shapes before anything moves — see `pinComposition`.
                    pinComposition();
                    e.dataTransfer.effectAllowed = 'copyMove';
                    e.dataTransfer.setData(GALLERY_ITEM_MIME, item.id);

                    /* Also dressed as an ordinary block drag, so a tile can
                       leave the board: the canvas and every block editor
                       already know how to receive one of these, and none of
                       them needs to learn what a board is. `sourceNodeId` is
                       deliberately null — the generic cleanup would hunt for
                       the tile among the node's top-level blocks and never find
                       it. The hook below is what actually takes it off this
                       board. */
                    /* Dragging a tile that is part of a selection carries the
                       whole selection. Picking up one picture and silently
                       leaving the other five behind would make the selection
                       look decorative — and moving a cluster to another board
                       is the main reason to have made one. */
                    const carried = selected.has(item.id) && selectedIds.length > 1
                        ? items.filter((i) => selected.has(i.id))
                        : [item];

                    e.dataTransfer.setData('application/chnk-it-block-id', item.id);
                    e.dataTransfer.setData('application/reactflow-block-type', item.type);
                    e.dataTransfer.setData(GALLERY_DRAG_MIME, '1');
                    e.dataTransfer.setData('application/chnk-it-block-data', JSON.stringify({
                        block: item,
                        blocks: carried,
                        sourceNodeId: null,
                    }));
                    window.chnkItGalleryItemTaken = (ids) => {
                        clearDragPreview();
                        setItems(getGalleryItems(block).filter((i) => !ids.includes(i.id)));
                    };

                    /* Our own thumbnail instead of the browser's
                       zoom-dependent snapshot of the tile. Anchored at its
                       centre so it sits under the cursor rather than hanging
                       off one corner. */
                    const preview = buildDragPreview(e.currentTarget, item);
                    e.dataTransfer.setDragImage(preview, DRAG_PREVIEW_W / 2, DRAG_PREVIEW_H / 2);
                    dragPreviewRef.current = preview;

                    setDragItemId(item.id);
                }}
                onDragEnd={() => {
                    // Snaps the preview back to the real order, which is the
                    // correct answer for a drag abandoned mid-air: nothing was
                    // committed, so nothing should be left rearranged.
                    clearDropPreview();
                    clearDragPreview();
                    // Dropped nowhere, or somewhere that didn't want it: the
                    // tile stays put and the hook must not outlive this drag,
                    // or the next drop would eat a picture.
                    window.chnkItGalleryItemTaken = null;
                }}
                onDragOver={onTileDragOver}
                onDrop={(e) => onTileDrop(e, item.id)}
                /* Double-click recentres — the way out of a crop you dragged
                   somewhere you didn't mean. */
                onDoubleClick={adjusting
                    ? (e) => { e.stopPropagation(); setFocal(item.id, undefined); }
                    : () => setLightboxId(item.id)}
                onClick={adjusting ? undefined : (e) => {
                    /* Modifier-click selects; a plain click still opens the
                       picture, which is the gesture the board is used for most
                       and must not change meaning depending on hidden state. */
                    if (!readOnly && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                        e.stopPropagation();
                        e.preventDefault();
                        selectFromClick(item.id, e);
                        return;
                    }
                    setLightboxId(item.id);
                }}
            >
                <TileMedia item={item} onRatio={noteRatio} focal={focal} />

                {adjusting && (
                    /* The crop's anchor, shown only while placing it. Marking
                       where the picture is held from is what makes the drag
                       feel like aiming rather than nudging. */
                    <span
                        className={styles.focalMark}
                        style={{ left: `${focal?.x ?? 50}%`, top: `${focal?.y ?? 50}%` }}
                        aria-hidden="true"
                    />
                )}

                {/* The size *button* is gone: the corner handle below does the
                    same job, and two controls for one property meant two
                    discovery paths for it and neither one obvious. The handle
                    wins because dragging a corner is what resizing looks like
                    everywhere else — the button only ever cycled through the
                    same four shapes in a fixed order. Its one advantage,
                    steppability, is now on the keyboard instead. */}
                {!readOnly && (
                    <button
                        type="button"
                        className={`${styles.tileBtn} ${styles.tileRemove} nodrag`}
                        title="Remove from board"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                    >
                        <X size={13} />
                    </button>
                )}
                {!readOnly && layout === 'bento' && (
                    <div
                        className={`${styles.tileResizeHandle} nodrag ${resizingTileId === item.id ? styles.isResizing : ''}`}
                        title={`Size: ${spanLabel(getManualSpan(item))} — drag to resize, double-click for auto`}
                        onClick={(e) => e.stopPropagation()}
                        /* The way back to the board's rhythm, and the same
                           gesture the node's own resize handle uses to give up
                           a hand-dragged size. */
                        onDoubleClick={(e) => { e.stopPropagation(); setSpan(item.id, undefined); }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            (e.target as HTMLElement).setPointerCapture(e.pointerId);
                            setResizingTileId(item.id);
                            setResizeStart({ x: e.clientX, y: e.clientY, span });
                        }}
                        onPointerMove={(e) => {
                            if (resizingTileId !== item.id || !resizeStart) return;
                            e.stopPropagation();

                            const dx = e.clientX - resizeStart.x;
                            const dy = e.clientY - resizeStart.y;

                            const currentIsWide = resizeStart.span === 'wide' || resizeStart.span === 'lg';
                            const currentIsTall = resizeStart.span === 'tall' || resizeStart.span === 'lg';

                            let newIsWide = currentIsWide;
                            let newIsTall = currentIsTall;

                            if (dx > 40) newIsWide = true;
                            if (dx < -40) newIsWide = false;

                            if (dy > 40) newIsTall = true;
                            if (dy < -40) newIsTall = false;

                            let newSpan: GallerySpan = 'sm';
                            if (newIsWide && newIsTall) newSpan = 'lg';
                            else if (newIsWide) newSpan = 'wide';
                            else if (newIsTall) newSpan = 'tall';

                            if (newSpan !== span) {
                                setSpan(item.id, newSpan);
                            }
                        }}
                        onPointerUp={(e) => {
                            e.stopPropagation();
                            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                            setResizingTileId(null);
                            setResizeStart(null);
                        }}
                    >
                        {/* The same corner arc a card and a canvas node are
                            resized by. Resizing a tile is the same gesture on
                            the same kind of thing, and it was wearing a
                            different mark for no reason — a chevron that
                            looked like a scrollbar corner and read as chrome
                            rather than as a grip. */}
                        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="gallery-tile-arc-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="var(--accent)" />
                                    <stop offset="100%" stopColor="var(--secondary)" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M 8 32 A 24 24 0 0 1 32 8"
                                stroke="url(#gallery-tile-arc-gradient)"
                                strokeWidth="6"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>
                )}
            </div>
        );
    };

    /* A board with pictures on it is only its pictures — adding is the panel's
       + button. What is left here is the empty case, which still needs a
       surface: with nothing in the grid at all the block has no height, so
       there is nothing to drop onto, nothing to click to focus for a paste, and
       nothing on screen to say the board exists. This is a hint, not a tile —
       it never appears alongside a picture. */
    const emptyHint = readOnly || items.length > 0 ? null : (
        <div className={styles.emptyBoard}>
            Drop images here, or use + above
        </div>
    );

    return (
        <div
            className={`${styles.gallery} ${compact ? styles.compact : ''}`}
            contentEditable={false}
            suppressContentEditableWarning
            /* Catches the paste from whichever descendant holds focus — a tile,
               the add button, the grid itself. */
            onPaste={onPaste}
        >
            {/* The title sits above the frame, not in it — a caption for the
                board rather than a bar competing with the pictures. */}
            {(showToolbar || block.content) && (
                <div className={styles.titleRow} onMouseDown={(e) => e.stopPropagation()}>
                    <input
                        className={`${styles.title} nodrag nopan`}
                        value={block.content}
                        placeholder="Untitled board"
                        readOnly={readOnly}
                        // Sizes the field to its text so the count sits beside the
                        // name rather than at the far edge of a wide board.
                        size={Math.max(14, block.content.length + 1)}
                        onChange={(e) => onReplace?.({ content: e.target.value })}
                        // The editor listens globally for Enter / Backspace / Escape to
                        // split and merge blocks; without this, typing a title edits
                        // the document structure instead of the title.
                        onKeyDown={(e) => e.stopPropagation()}
                        onKeyUp={(e) => e.stopPropagation()}
                    />
                    <span className={styles.count}>{items.length}</span>
                </div>
            )}

            <div className={styles.board}>
            <div
                ref={gridRef}
                /* The node's resize handle measures this element to work out how
                   much of a dragged node height is board and how much is chrome. */
                data-gallery-grid=""
                className={`
                    ${styles.grid}
                    ${LAYOUT_CLASS[layout]}
                    ${fit === 'contain' ? styles.fitContain : ''}
                    ${isFileDragOver ? styles.fileDragOver : ''}
                `}
                style={gridVars}
                /* Focusable so that clicking the board's empty space makes it
                   the paste target — otherwise the only way to paste into a
                   board is to first click one of the pictures already on it,
                   which is exactly backwards when the board is empty.
                   -1: reachable by click, skipped by Tab, which belongs to the
                   tiles. */
                tabIndex={-1}
                /* Rubber band from the board's own background. Only from the
                   background — starting one on a tile would fight the drag that
                   rearranges the board, which is the more important gesture. */
                onPointerDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    e.currentTarget.focus();
                    if (readOnly || e.button !== 0) return;
                    const host = e.currentTarget;
                    const box = host.getBoundingClientRect();
                    /* The board may sit in the canvas's scaled viewport, where a
                       client rect is in screen pixels but the overlay is drawn
                       in the board's own. Their ratio is the scale, whatever
                       produced it. */
                    const scale = host.offsetWidth > 0 ? box.width / host.offsetWidth : 1;
                    const local = (cx: number, cy: number) => ({
                        x: (cx - box.left) / scale,
                        y: (cy - box.top) / scale,
                    });
                    const start = local(e.clientX, e.clientY);
                    host.setPointerCapture(e.pointerId);
                    // A plain press on the background is also how you let go of
                    // a selection.
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
                        // Intersection, not containment: a band has to be able to
                        // catch a large tile without enclosing the whole of it.
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
                }}
                onDragOver={onGridDragOver}
                onDragLeave={(e) => {
                    // Only when the pointer has genuinely left the board, not on
                    // every crossing between two tiles inside it.
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setIsFileDragOver(false);
                    /* Carried back out again: the board closes up and shows its
                       real arrangement, so it never sits holding a gap open for
                       a picture that went somewhere else. The frozen layout
                       goes with it — the board is back in its true order now,
                       so a picture carried in again measures that. */
                    setDropAt(null);
                    forgetDragGeometry();
                }}
                onDrop={onGridDrop}
            >
                {masonry
                    ? masonry.cols.map((col, ci) => (
                        <div key={`col-${ci}`} className={styles.masonryCol}>
                            {col.map(({ item, index }) => renderTile(item, index))}
                        </div>
                    ))
                    : boardItems.map(renderTile)}
                {emptyHint}
                {marquee && (
                    <div
                        className={styles.marquee}
                        aria-hidden="true"
                        style={{
                            left: Math.min(marquee.x0, marquee.x1),
                            top: Math.min(marquee.y0, marquee.y1),
                            width: Math.abs(marquee.x1 - marquee.x0),
                            height: Math.abs(marquee.y1 - marquee.y0),
                        }}
                    />
                )}
            </div>

            {showToolbar && (
                /* Floating control panel — the board's chrome lives over the
                   pictures on hover rather than taking a permanent bar, so at
                   rest a board is nothing but its images. */
                /* Grouped by what the control *is*, not by what fits. Seven
                   identical buttons in a row said nothing about which choices
                   were exclusive, which were toggles, and which left the page.
                   Now: a segmented control for the one-of-three layout, then
                   the display toggles, then the things that aren't editing at
                   all, then the single primary action. */
                <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
                    {/* `nodrag` on the strip rather than each tab — React Flow
                        looks for the nearest such ancestor, so one is enough
                        to stop a click here from dragging the node. */}
                    <Tabs
                        className="nodrag"
                        items={LAYOUT_TABS}
                        value={layout}
                        onChange={(id) => commit({ galleryLayout: id })}
                        iconOnly
                        radius="control"
                        semantics="radio"
                        aria-label="Board layout"
                    />

                    <span className={styles.panelDivider} />

                    <button
                        type="button"
                        className={`${styles.panelBtn} ${fit === 'contain' ? styles.panelActive : ''} nodrag`}
                        title={fit === 'cover' ? 'Cropped to fill — click to show whole frames' : 'Whole frames — click to crop to fill'}
                        aria-label="Whole frames"
                        aria-pressed={fit === 'contain'}
                        onClick={() => commit({ galleryFit: (fit === 'cover' ? 'contain' : 'cover') as GalleryFit })}
                    >
                        <Scaling size={16} />
                    </button>
                    {canAdjustFocus && (
                        <button
                            type="button"
                            className={`${styles.panelBtn} ${focusMode ? styles.panelActive : ''} nodrag`}
                            title={focusMode
                                ? 'Setting focal points — drag a picture to aim its crop, double-click to recentre, Esc to finish'
                                : 'Set focal points — choose what stays in frame when a picture is cropped'}
                            aria-label="Set focal points"
                            aria-pressed={focusMode}
                            onClick={() => setFocusMode((v) => !v)}
                        >
                            <Crosshair size={16} />
                        </button>
                    )}
                    {/* Only offered once there is something to undo — on an
                        untouched board it would be a control for a state the
                        board is already in. */}
                    {layout === 'bento' && hasManualSpans(items) && (
                        <button
                            type="button"
                            className={`${styles.panelBtn} nodrag`}
                            title="Reset tile sizes — hand the board back to its automatic rhythm"
                            aria-label="Reset tile sizes"
                            onClick={() => setItems(clearManualSpans(items))}
                        >
                            <RotateCcw size={15} />
                        </button>
                    )}

                    {items.length > 0 && (
                        <>
                            <span className={styles.panelDivider} />
                            <button
                                type="button"
                                className={`${styles.panelPresent} nodrag`}
                                title="Present this board full screen"
                                aria-label="Present this board full screen"
                                onClick={() => setPresenting(true)}
                            >
                                <Expand size={15} />
                            </button>
                        </>
                    )}

                    <span className={styles.panelDivider} />
                    <button
                        type="button"
                        className={`${styles.panelAdd} nodrag`}
                        title="Add media"
                        aria-label="Add media"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Plus size={18} />
                    </button>
                </div>
            )}
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}

            {!readOnly && selectedIds.length > 0 && (
                /* Under the board, where the undo bar goes — the actions belong
                   to the selection, not to any one picture, so putting them on
                   a tile would be a lie about their scope. */
                <div className={styles.selectionBar} role="status">
                    <span className={styles.selectionCount}>
                        {selectedIds.length} selected
                    </span>
                    {layout === 'bento' && (
                        <div className={styles.selectionSizes}>
                            {(['sm', 'wide', 'tall', 'lg'] as GallerySpan[]).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    className={`${styles.selectionSize} nodrag`}
                                    title={`Make ${selectedIds.length} ${spanLabel(s).toLowerCase()}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => setSpanMany(selectedIds, s)}
                                >
                                    {spanLabel(s)}
                                </button>
                            ))}
                            <button
                                type="button"
                                className={`${styles.selectionSize} nodrag`}
                                title="Hand these back to the board's automatic rhythm"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => setSpanMany(selectedIds, undefined)}
                            >
                                Auto
                            </button>
                        </div>
                    )}
                    <button
                        type="button"
                        className={`${styles.selectionRemove} nodrag`}
                        title="Remove these from the board"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => { removeMany(selectedIds); clearSelection(); }}
                    >
                        <X size={13} />
                        Remove
                    </button>
                    <button
                        type="button"
                        className={`${styles.undoDismiss} nodrag`}
                        aria-label="Clear selection"
                        title="Clear selection (Esc)"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={clearSelection}
                    >
                        <X size={13} />
                    </button>
                </div>
            )}

            {undoable && (
                /* `status`, not `alert`: a removal the user just performed is
                   confirmation, not an interruption, and `alert` would cut off
                   whatever a screen reader was already saying. */
                <div className={styles.undoBar} role="status">
                    <span className={styles.undoText}>
                        {undoable.length === 1
                            ? `Removed ${undoable[0].item.metadata?.name || 'picture'}`
                            : `Removed ${undoable.length} pictures`}
                    </span>
                    <button
                        type="button"
                        className={`${styles.undoBtn} nodrag`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={undoRemove}
                    >
                        <Undo2 size={13} />
                        Undo
                    </button>
                    <button
                        type="button"
                        className={`${styles.undoDismiss} nodrag`}
                        aria-label="Dismiss"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={clearUndo}
                    >
                        <X size={13} />
                    </button>
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                    if (e.target.files?.length) void addFiles(e.target.files);
                    e.target.value = '';
                }}
            />

            {active && (
                /* Keyed by the picture: stepping to the next one remounts the
                   viewer, so it opens fit to screen instead of inheriting the
                   previous image's 300% zoom and landing mid-crop. */
                <MediaLightbox
                    key={active.id}
                    src={active.content}
                    type={active.type === 'video' ? 'video' : 'image'}
                    name={active.metadata?.name}
                    position={{ index: openIndex, total: viewable.length }}
                    onPrev={() => step(-1)}
                    onNext={() => step(1)}
                    onClose={() => setLightboxId(null)}
                />
            )}

            {presenting && (
                <BoardPresenter block={block} onClose={() => setPresenting(false)} />
            )}
        </div>
    );
});

/**
 * The board, full screen, with nothing else on the wall.
 *
 * Boards get shown to people, and the only way to do that until now was the
 * lightbox — which is one picture at a time, and so shows everything except the
 * thing a moodboard actually is: the arrangement. This shows the composition.
 *
 * It renders a read-only `GalleryBlock` rather than a second layout engine, so
 * bento, grid and masonry all present exactly as they were arranged, and the
 * pictures keep opening into the lightbox on click. The stored board height is
 * dropped on the way in — a height dragged to fit inside a card is meaningless
 * against a whole screen — and the title moves into the presenter's own bar so
 * the board itself arrives with no chrome at all.
 */
function BoardPresenter({ block, onClose }: { block: Block; onClose: () => void }) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            /* Capture phase and stopped here: the editor and the canvas both
               listen for Escape, and without this closing the presentation
               would also clear the selection behind it. */
            e.stopPropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        // The page behind must not scroll under a full-screen surface.
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey, true);
            document.body.style.overflow = prev;
        };
    }, [onClose]);

    const presented = useMemo(() => ({
        ...block,
        content: '',
        metadata: { ...block.metadata, galleryHeight: undefined },
    }), [block]);

    const count = getGalleryItems(block).length;

    return createPortal(
        <div
            className={styles.present}
            role="dialog"
            aria-modal="true"
            aria-label={block.content || 'Board'}
        >
            <div className={styles.presentBar}>
                <span className={styles.presentTitle}>{block.content || 'Untitled board'}</span>
                <span className={styles.presentCount}>{count}</span>
                <button
                    ref={closeRef}
                    type="button"
                    className={styles.presentClose}
                    onClick={onClose}
                    aria-label="Close presentation"
                    title="Close (Esc)"
                >
                    <X size={16} />
                </button>
            </div>
            <div className={styles.presentStage}>
                <GalleryBlock block={presented} readOnly />
            </div>
        </div>,
        document.body,
    );
}

/**
 * Where `cover` should crop from. Absent means centred, which is the browser's
 * own default, so an untouched picture carries no inline style at all.
 */
const focalStyle = (focal?: Focal): React.CSSProperties | undefined => (
    focal ? { objectPosition: `${focal.x}% ${focal.y}%` } : undefined
);

/** One tile's contents. Video shows its poster frame — a board of playing
 *  videos is unreadable — and plays in the lightbox instead.
 *
 *  `onRatio` is how masonry learns each picture's true shape: the board can't
 *  know it until the bitmap decodes, and asking the DOM afterwards would mean a
 *  measure-relayout pass on every load. */
const TileMedia = ({ item, onRatio, focal }: {
    item: Block;
    onRatio?: (id: string, ratio: number) => void;
    /** Passed in rather than read off the item so a focal point being dragged
     *  can preview live without a store write per pointer move. */
    focal?: Focal;
}) => {
    if (!item.content) {
        return <div className={styles.tileFallback}><ImageOff size={18} /></div>;
    }
    if (item.type === 'video') {
        return (
            <>
                <AssetVideo
                    className={styles.tileMedia}
                    src={item.content}
                    preload="metadata"
                    muted
                    playsInline
                    style={focalStyle(focal)}
                    onLoadedMetadata={(e) => onRatio?.(
                        item.id, e.currentTarget.videoWidth / e.currentTarget.videoHeight,
                    )}
                />
                <span className={styles.playBadge}><Play size={12} fill="currentColor" /></span>
            </>
        );
    }
    if (item.type === 'image') {
        return (
            <AssetImage
                className={styles.tileMedia}
                /* The thumbnail when there is one. The original is still what
                   the lightbox opens — this is only what the tile paints. */
                src={displaySrc(item.content, item.metadata?.thumb)}
                alt={item.metadata?.name || ''}
                loading="lazy"
                draggable={false}
                style={focalStyle(focal)}
                onLoad={(e) => onRatio?.(
                    item.id, e.currentTarget.naturalWidth / e.currentTarget.naturalHeight,
                )}
            />
        );
    }
    return (
        <div className={styles.tileFile}>
            <FileText size={20} />
            <span>{item.metadata?.name || 'File'}</span>
        </div>
    );
};
