import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockMetadata } from '../types';
import { ingestFiles } from '../../../services/assets';
import {
    clearManualSpans, getGalleryFit, getGalleryItems, getGalleryLayout,
    getManualSpan, hasManualSpans, nextSpan, withResolvedSpans,
    GALLERY_DRAG_MIME, GALLERY_ITEM_MIME,
    type GalleryLayout, type GallerySpan,
} from './galleryTypes';
import { endDragSession, startDragSession } from '../drag/dragSession';
import { useTileFlip } from './tile/useTileFlip';
import { useBoardLayout } from './board/hooks/useBoardLayout';
import { BoardPresenter } from './board/BoardPresenter';
import { BoardPanel } from './board/BoardPanel';
import { SelectionBar, UndoBar } from './board/BoardBars';
import { buildDragPreview, DRAG_PREVIEW_H, DRAG_PREVIEW_W } from './dragPreview';
import { type Focal } from './tile/focalPoint';
import { GalleryTile, type TileActions } from './tile/GalleryTile';
import { useThumbnailSweep } from './hooks/useThumbnailSweep';
import { useRemovalUndo } from './hooks/useRemovalUndo';
import { useBoardSelection } from './board/hooks/useBoardSelection';
import { useBoardDrop } from './board/hooks/useBoardDrop';
import { MediaLightbox } from '../../../app/shell/media/lightbox/MediaLightbox';
import styles from './GalleryBlock.module.css';

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
 *
 * This file composes the board; each thing the board does lives in gallery/:
 * carrying pictures (useBoardDrop), choosing them (useBoardSelection), taking
 * them off and back (useRemovalUndo), thumbnails (useThumbnailSweep), the
 * layout maths (useBoardLayout), one tile (GalleryTile), the controls
 * (BoardPanel, BoardBars) and the full-screen view (BoardPresenter).
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
    /* Natural aspect ratios, reported by each bitmap as it decodes. Only masonry
       reads them, but they are collected in every layout: switching to masonry
       must not wait on a second round of load events for pictures the browser
       has already cached. */
    const [ratios, setRatios] = useState<Record<string, number>>({});
    const [lightboxId, setLightboxId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [resizingTileId, setResizingTileId] = useState<string | null>(null);
    const [resizeStart, setResizeStart] = useState<{ x: number, y: number, span: GallerySpan } | null>(null);
    /* Adjusting the crop is a mode, not a per-tile handle: you go round a board
       fixing several pictures at once, and a handle per tile would be four more
       controls competing for the corner of every thumbnail. Local state, never
       stored — it is a thing you are doing, not a property of the board. */
    const [focusModeRequested, setFocusMode] = useState(false);
    const [presenting, setPresenting] = useState(false);
    /* The focal point under the pointer right now. Held locally so dragging
       previews at pointer rate; only the release writes to the document. */
    const [draftFocal, setDraftFocal] = useState<{ id: string; focal: Focal } | null>(null);

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

    const drop = useBoardDrop({ gridRef, items, layout, readOnly, setItems, addFiles });
    const { dragItemId, setDragItemId, previewItems, pinComposition, clearDropPreview } = drop;

    useThumbnailSweep({
        block,
        items,
        setItems,
        enabled: !readOnly && !!onReplace,
        busy: dragItemId !== null || drop.dropAt !== null,
    });

    const { undoable, removeMany, removeItem, undoRemove, clearUndo } = useRemovalUndo({ block, items, setItems });
    const { selectedIds, selected, clearSelection, selectFromClick, marquee, onBoardPointerDown } =
        useBoardSelection({ items, readOnly });

    /**
     * Paste straight onto the board.
     *
     * Without this the editor's own paste handling wins and a copied image
     * becomes a *separate* media block below the card — which then has to be
     * dragged back onto the board by hand. Copy-paste is how references are
     * actually collected, so the board has to be a paste target in its own
     * right. It only claims the event when the clipboard actually carries
     * media, so pasting text into the board's title still pastes text.
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

    /** Rewrite some of the pictures' metadata in one commit. */
    const patchItems = useCallback((ids: string[], patch: Partial<BlockMetadata>) => {
        const set = new Set(ids);
        setItems(items.map((i) => (set.has(i.id) ? { ...i, metadata: { ...i.metadata, ...patch } } : i)));
    }, [items, setItems]);

    /* Steps the tile's own span, `auto` included — see `nextSpan`. Reached from
       the keyboard; the pointer gets the corner handle. */
    const cycleSpan = useCallback((id: string) => {
        const item = items.find((i) => i.id === id);
        if (item) patchItems([id], { span: nextSpan(getManualSpan(item)) });
    }, [items, patchItems]);

    const setFocal = useCallback((id: string, focal: Focal | undefined) => patchItems([id], { focal }), [patchItems]);

    /** `undefined` hands the tile back to the board's automatic rhythm. */
    const setSpan = useCallback((id: string, span: GallerySpan | undefined) => patchItems([id], { span }), [patchItems]);

    // Whole frames are already fully visible, so there is no crop to place.
    const canAdjustFocus = fit === 'cover';
    /* Derived, not reset: switching to whole frames simply leaves the mode
       behind, and switching back does not resurrect it (the raw flag is
       cleared by the same click that changes the fit). */
    const focusMode = focusModeRequested && canAdjustFocus;

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
        const pinned = withResolvedSpans(items, layout);
        const without = pinned.filter((_, i) => i !== from);
        setItems([...without.slice(0, to), pinned[from], ...without.slice(to)]);
        requestAnimationFrame(() => {
            gridRef.current
                ?.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(id)}"]`)
                ?.focus();
        });
    }, [items, setItems, layout]);

    /** What actually gets laid out: the preview while dragging, else the board. */
    const boardItems = previewItems ?? items;

    const { width, columns, scatter, masonry, rowSize, gridVars } = useBoardLayout({
        gridRef,
        boardItems,
        itemCount: items.length,
        layout,
        ratios,
        boardHeight: typeof block.metadata?.galleryHeight === 'number' ? block.metadata.galleryHeight : undefined,
    });

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

    /* Seen to move when the order or the layout changes; silently re-measured
       when anything else shifts the tiles. See `useTileFlip`. */
    const flipSignature = `${layout}|${boardItems.map((i) => i.id).join(',')}`;
    useTileFlip(gridRef, flipSignature, [flipSignature, columns, rowSize, width, ratios]);

    /* What a tile can ask of the board. Built once so a tile only re-renders
       when its own picture, size or state changes — on a board being dragged
       through, that is the difference between repainting one tile and all of
       them. */
    const tileActions = useMemo<TileActions>(() => ({
        open: (id) => setLightboxId(id),
        remove: removeItem,
        removeMany,
        clearSelection,
        selectFromClick,
        moveBy,
        cycleSpan,
        setSpan,
        setFocal,
        setDraftFocal,
        noteRatio,
        onDragOver: drop.onTileDragOver,
        onDrop: drop.onTileDrop,
        beginResize: (id, start) => {
            setResizingTileId(id);
            setResizeStart(start);
        },
        endResize: () => {
            setResizingTileId(null);
            setResizeStart(null);
        },
        beginDrag: (e, item) => {
            if (readOnly) return;
            // Claim this drag: without it the wrapper starts a block drag and
            // reordering a tile would fling the whole board into another card.
            e.stopPropagation();
            clearDragPreview();   // stale one from an aborted drag
            // Pin the shapes before anything moves — see `pinComposition`.
            pinComposition();
            e.dataTransfer.effectAllowed = 'copyMove';

            /* Dragging a tile that is part of a selection carries the whole
               selection: picking up one picture and silently leaving the other
               five behind would make the selection look decorative — and moving
               a cluster to another board is the main reason to make one. */
            const carried = selected.has(item.id) && selectedIds.length > 1
                ? items.filter((i) => selected.has(i.id))
                : [item];

            /* Also dressed as an ordinary block drag, so a tile can leave the
               board: the canvas and every block editor already know how to
               receive one of these. `sourceNodeId` is deliberately null — the
               generic cleanup would hunt for the tile among the node's
               top-level blocks and never find it; the hook below is what takes
               it off this board. */
            startDragSession(e.dataTransfer, {
                [GALLERY_ITEM_MIME]: item.id,
                'application/chnk-it-block-id': item.id,
                'application/reactflow-block-type': item.type,
                [GALLERY_DRAG_MIME]: '1',
                'application/chnk-it-block-data': JSON.stringify({
                    block: item,
                    blocks: carried,
                    sourceNodeId: null,
                }),
            });
            window.chnkItGalleryItemTaken = (ids) => {
                clearDragPreview();
                setItems(getGalleryItems(block).filter((i) => !ids.includes(i.id)));
            };

            /* Our own thumbnail instead of the browser's zoom-dependent
               snapshot, anchored at its centre so it sits under the cursor. */
            const preview = buildDragPreview(e.currentTarget as HTMLElement, item);
            e.dataTransfer.setDragImage(preview, DRAG_PREVIEW_W / 2, DRAG_PREVIEW_H / 2);
            dragPreviewRef.current = preview;

            setDragItemId(item.id);
        },
        endDrag: () => {
            // Snaps the preview back to the real order, the right answer for a
            // drag abandoned mid-air: nothing was committed, so nothing stays
            // rearranged.
            clearDropPreview();
            clearDragPreview();
            endDragSession();
            // Dropped nowhere, or somewhere that didn't want it: the hook must
            // not outlive this drag, or the next drop would eat a picture.
            window.chnkItGalleryItemTaken = null;
        },
    }), [
        removeItem, removeMany, clearSelection, selectFromClick, moveBy, cycleSpan, setSpan, setFocal,
        noteRatio, readOnly, clearDragPreview, pinComposition, selected, selectedIds.length, items,
        block, setItems, clearDropPreview, setDragItemId, drop.onTileDragOver, drop.onTileDrop,
    ]);

    /** One tile, or the inert gap held open for an arriving picture. */
    const renderTile = (item: Block, index: number) => (
        <GalleryTile
            key={item.id}
            item={item}
            index={index}
            total={boardItems.length}
            layout={layout}
            columns={columns}
            ratio={ratios[item.id]}
            place={scatter?.places.get(item.id)}
            readOnly={readOnly}
            isSelected={selected.has(item.id)}
            selectionSize={selectedIds.length}
            isDragging={dragItemId === item.id}
            isResizing={resizingTileId === item.id}
            draftFocal={draftFocal?.id === item.id ? draftFocal.focal : null}
            adjustingFocus={focusMode && !readOnly && (item.type === 'image' || item.type === 'video')}
            resizeStart={resizeStart}
            actions={tileActions}
        />
    );

    const compact = !!disableMediaControls;
    const showToolbar = !readOnly;

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
                        ${drop.isFileDragOver ? styles.fileDragOver : ''}
                    `}
                    style={gridVars}
                    /* Focusable so that clicking the board's empty space makes it
                       the paste target — otherwise the only way to paste into a
                       board is to first click one of the pictures already on it,
                       which is exactly backwards when the board is empty.
                       -1: reachable by click, skipped by Tab, which belongs to the
                       tiles. */
                    tabIndex={-1}
                    onPointerDown={onBoardPointerDown}
                    onDragOver={drop.onGridDragOver}
                    onDragLeave={drop.onGridDragLeave}
                    onDrop={drop.onGridDrop}
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
                    <BoardPanel
                        layout={layout}
                        fit={fit}
                        canAdjustFocus={canAdjustFocus}
                        focusMode={focusMode}
                        canResetSpans={layout === 'bento' && hasManualSpans(items)}
                        hasItems={items.length > 0}
                        onLayout={(id) => commit({ galleryLayout: id })}
                        onToggleFit={() => commit({ galleryFit: fit === 'cover' ? 'contain' : 'cover' })}
                        onToggleFocusMode={() => setFocusMode((v) => !v)}
                        onResetSpans={() => setItems(clearManualSpans(items))}
                        onPresent={() => setPresenting(true)}
                        onAdd={() => fileInputRef.current?.click()}
                    />
                )}
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}

            {!readOnly && selectedIds.length > 0 && (
                <SelectionBar
                    count={selectedIds.length}
                    showSizes={layout === 'bento'}
                    onSize={(span) => patchItems(selectedIds, { span })}
                    onRemove={() => { removeMany(selectedIds); clearSelection(); }}
                    onClear={clearSelection}
                />
            )}

            {undoable && <UndoBar removed={undoable} onUndo={undoRemove} onDismiss={clearUndo} />}

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
                /* The same board, read-only and free of its dragged height —
                   see BoardPresenter for why it is not a second layout engine. */
                <BoardPresenter block={block} onClose={() => setPresenting(false)}>
                    <GalleryBlock
                        block={{ ...block, content: '', metadata: { ...block.metadata, galleryHeight: undefined } }}
                        readOnly
                    />
                </BoardPresenter>
            )}
        </div>
    );
});
