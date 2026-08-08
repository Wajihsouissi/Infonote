import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    LayoutGrid, Rows3, Squircle, Plus, X, Scaling, Play, FileText, ImageOff,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockMetadata } from './types';
import { readMediaFile } from './mediaTypes';
import {
    cellSizeForHeight, claimGalleryItem, columnsForWidth, getGalleryFit, getGalleryItems,
    getGalleryLayout, nextSpan, packBoard, resolveSpan, spanCells, toGalleryItems,
    GALLERY_DRAG_MIME, GALLERY_ITEM_MIME,
    type GalleryFit, type GalleryLayout, type GallerySpan,
} from './galleryTypes';
import { endBlockDrag } from './blockDragLock';
import { MediaLightbox } from '../ui/MediaLightbox';
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

/** Gap between tiles, in px. Mirrored by --gal-gap in the stylesheet. */
const GAP = 8;

const LAYOUTS: { id: GalleryLayout; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'bento', label: 'Bento — mixed sizes', icon: Squircle },
    { id: 'grid', label: 'Grid — equal tiles', icon: LayoutGrid },
    { id: 'masonry', label: 'Masonry — natural heights', icon: Rows3 },
];

const LAYOUT_CLASS: Record<GalleryLayout, string> = {
    bento: styles.layoutBento,
    grid: styles.layoutGrid,
    masonry: styles.layoutMasonry,
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
    const [columns, setColumns] = useState(3);
    const [cell, setCell] = useState(120);
    const [lightboxId, setLightboxId] = useState<string | null>(null);
    const [dragItemId, setDragItemId] = useState<string | null>(null);
    const [dropHint, setDropHint] = useState<{ id: string; side: 'before' | 'after' } | null>(null);
    const [isFileDragOver, setIsFileDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* One observer per board. Width drives both the column count and the row
       height, so a tile that spans two columns is twice as wide AND twice as
       tall — the thing that makes a bento look composed rather than accidental. */
    useLayoutEffect(() => {
        const el = gridRef.current;
        if (!el) return;
        const measure = (width: number) => {
            if (width <= 0) return;
            const cols = columnsForWidth(width);
            setColumns(cols);
            setCell(Math.max(48, Math.round((width - (cols - 1) * GAP) / cols)));
        };
        measure(el.getBoundingClientRect().width);
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) measure(entry.contentRect.width);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const commit = useCallback((patch: Partial<BlockMetadata>) => {
        onReplace?.({ metadata: { ...block.metadata, ...patch } });
    }, [block.metadata, onReplace]);

    const setItems = useCallback((next: Block[]) => commit({ items: next }), [commit]);

    const addFiles = useCallback(async (files: FileList | File[]) => {
        const list = Array.from(files);
        if (list.length === 0) return;
        setError(null);
        const added: Block[] = [];
        const failures: string[] = [];
        // Read every file before writing once — a per-file commit would make each
        // read race the previous state and silently drop all but the last.
        for (const file of list) {
            try {
                const { url, type } = await readMediaFile(file);
                added.push({
                    id: uuidv4(),
                    type,
                    content: url,
                    metadata: { name: file.name, size: file.size, type: file.type },
                });
            } catch (e) {
                failures.push(e instanceof Error ? e.message : `Could not read ${file.name}.`);
            }
        }
        if (added.length) setItems([...getGalleryItems(block), ...added]);
        if (failures.length) setError(failures[0]);
    }, [block, setItems]);

    const removeItem = useCallback((id: string) => {
        setItems(items.filter((i) => i.id !== id));
    }, [items, setItems]);

    const cycleSpan = useCallback((id: string, current: GallerySpan) => {
        setItems(items.map((i) => (
            i.id === id ? { ...i, metadata: { ...i.metadata, span: nextSpan(current) } } : i
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

    const onTileDragOver = (e: React.DragEvent, id: string) => {
        if (readOnly) return;
        const own = isOwnItemDrag(e);
        if (!own && !isIncomingMedia(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = own ? 'move' : 'copy';
        const rect = e.currentTarget.getBoundingClientRect();
        const side = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
        if (dropHint?.id !== id || dropHint.side !== side) setDropHint({ id, side });
    };

    const onTileDrop = (e: React.DragEvent, id: string) => {
        if (readOnly) return;
        const own = isOwnItemDrag(e);
        if (!own && !isIncomingMedia(e)) return;
        e.preventDefault();
        e.stopPropagation();

        const side = dropHint?.id === id ? dropHint.side : 'after';
        setDropHint(null);
        setDragItemId(null);

        if (own) {
            const sourceId = e.dataTransfer.getData(GALLERY_ITEM_MIME);
            if (sourceId) reorder(sourceId, id, side);
            return;
        }
        const at = items.findIndex((i) => i.id === id);
        takeIncoming(e, at === -1 ? items.length : at + (side === 'after' ? 1 : 0));
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
        setDropHint(null);
        setDragItemId(null);

        // Dropped on the board's padding rather than on a tile: send it to the end.
        if (own) {
            const sourceId = e.dataTransfer.getData(GALLERY_ITEM_MIME);
            const last = items[items.length - 1];
            if (sourceId && last && sourceId !== last.id) reorder(sourceId, last.id, 'after');
            return;
        }
        takeIncoming(e, items.length);
    };

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

    /* Row count drives the height solve; the hole is what the add tile expands
       into, so the board always ends on a clean rectangle instead of a notch. */
    const { rows, hole } = useMemo(() => {
        const shapes = items.map((item, i) => spanCells(resolveSpan(item, i, items.length, layout), columns));
        if (layout === 'grid') {
            const cols = Math.max(1, columns);
            const filled = shapes.length % cols;
            return {
                rows: Math.ceil((shapes.length + 1) / cols),
                hole: { cols: filled === 0 ? cols : cols - filled, rows: 1 },
            };
        }
        return packBoard(shapes, columns);
    }, [items, layout, columns]);

    // Masonry has no rows to solve — CSS columns own its flow — so a set height
    // is a viewport it scrolls inside rather than something the tiles fill.
    const scalesToFit = boardHeight !== undefined && layout !== 'masonry';
    const rowSize = scalesToFit ? cellSizeForHeight(boardHeight, rows, GAP) : cell;

    const gridVars = {
        '--gal-cols': columns,
        '--gal-row': `${rowSize}px`,
        '--gal-gap': `${GAP}px`,
        ...(boardHeight !== undefined ? { height: `${boardHeight}px` } : null),
    } as React.CSSProperties;

    const compact = !!disableMediaControls;
    const showToolbar = !readOnly;

    return (
        <div
            className={`${styles.gallery} ${compact ? styles.compact : ''}`}
            contentEditable={false}
            suppressContentEditableWarning
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
                    ${boardHeight !== undefined ? styles.sized : ''}
                `}
                style={gridVars}
                onDragOver={onGridDragOver}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsFileDragOver(false);
                }}
                onDrop={onGridDrop}
            >
                {items.map((item, index) => {
                    const span = resolveSpan(item, index, items.length, layout);
                    const { cols, rows } = spanCells(span, columns);
                    const tileVars = layout === 'masonry'
                        ? undefined
                        : ({ gridColumn: `span ${cols}`, gridRow: `span ${rows}` } as React.CSSProperties);

                    return (
                        <div
                            key={item.id}
                            className={`
                                ${styles.tile}
                                ${dragItemId === item.id ? styles.tileDragging : ''}
                                ${dropHint?.id === item.id ? (dropHint.side === 'before' ? styles.hintBefore : styles.hintAfter) : ''}
                                mediaViewTarget
                            `}
                            style={tileVars}
                            draggable={!readOnly}
                            onDragStart={(e) => {
                                if (readOnly) return;
                                // Claim this drag: without it the wrapper starts a
                                // block drag and reordering a tile would fling the
                                // whole board into another card.
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = 'copyMove';
                                e.dataTransfer.setData(GALLERY_ITEM_MIME, item.id);

                                /* Also dressed as an ordinary block drag, so a tile
                                   can leave the board: the canvas and every block
                                   editor already know how to receive one of these,
                                   and none of them needs to learn what a board is.
                                   `sourceNodeId` is deliberately null — the generic
                                   cleanup would hunt for the tile among the node's
                                   top-level blocks and never find it. The hook below
                                   is what actually takes it off this board. */
                                e.dataTransfer.setData('application/chnk-it-block-id', item.id);
                                e.dataTransfer.setData('application/reactflow-block-type', item.type);
                                e.dataTransfer.setData(GALLERY_DRAG_MIME, '1');
                                e.dataTransfer.setData('application/chnk-it-block-data', JSON.stringify({
                                    block: item,
                                    blocks: [item],
                                    sourceNodeId: null,
                                }));
                                window.chnkItGalleryItemTaken = (ids) => {
                                    setItems(getGalleryItems(block).filter((i) => !ids.includes(i.id)));
                                };

                                setDragItemId(item.id);
                            }}
                            onDragEnd={() => {
                                setDragItemId(null);
                                setDropHint(null);
                                // Dropped nowhere, or somewhere that didn't want it:
                                // the tile stays put and the hook must not outlive
                                // this drag, or the next drop would eat a picture.
                                window.chnkItGalleryItemTaken = null;
                            }}
                            onDragOver={(e) => onTileDragOver(e, item.id)}
                            onDrop={(e) => onTileDrop(e, item.id)}
                            onDoubleClick={() => setLightboxId(item.id)}
                            onClick={() => setLightboxId(item.id)}
                        >
                            <TileMedia item={item} />

                            {!readOnly && layout === 'bento' && (
                                <button
                                    type="button"
                                    className={`${styles.tileBtn} ${styles.tileSize} nodrag`}
                                    title={`Size: ${span} — click to change`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); cycleSpan(item.id, span); }}
                                >
                                    <Scaling size={13} />
                                </button>
                            )}
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
                            {item.metadata?.name && layout !== 'grid' && (
                                <span className={styles.tileName}>{item.metadata.name}</span>
                            )}
                        </div>
                    );
                })}

                {!readOnly && (
                    <button
                        type="button"
                        className={`${styles.addTile} nodrag`}
                        /* Sized to the hole the pack left, so the board ends on a
                           clean rectangle and the drop target is as big as the
                           room going spare. */
                        style={layout === 'masonry' ? undefined : {
                            gridColumn: `span ${hole.cols}`,
                            gridRow: `span ${hole.rows}`,
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        title="Add media to this board"
                    >
                        <Plus size={items.length === 0 ? 22 : 16} />
                        {items.length === 0 && (
                            <span className={styles.addTileText}>
                                Drop images here, or click to browse
                            </span>
                        )}
                    </button>
                )}
            </div>

            {showToolbar && (
                /* Floating control panel — the board's chrome lives over the
                   pictures on hover rather than taking a permanent bar, so at
                   rest a board is nothing but its images. */
                <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
                    {LAYOUTS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            className={`${styles.panelBtn} ${layout === id ? styles.panelActive : ''} nodrag`}
                            title={label}
                            aria-label={label}
                            aria-pressed={layout === id}
                            onClick={() => commit({ galleryLayout: id })}
                        >
                            <Icon size={16} />
                        </button>
                    ))}
                    <button
                        type="button"
                        className={`${styles.panelBtn} ${fit === 'contain' ? styles.panelActive : ''} nodrag`}
                        title={fit === 'cover' ? 'Cropped to fill — click to show whole frames' : 'Whole frames — click to crop to fill'}
                        onClick={() => commit({ galleryFit: (fit === 'cover' ? 'contain' : 'cover') as GalleryFit })}
                    >
                        <Scaling size={16} />
                    </button>
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
        </div>
    );
});

/** One tile's contents. Video shows its poster frame — a board of playing
 *  videos is unreadable — and plays in the lightbox instead. */
const TileMedia = ({ item }: { item: Block }) => {
    if (!item.content) {
        return <div className={styles.tileFallback}><ImageOff size={18} /></div>;
    }
    if (item.type === 'video') {
        return (
            <>
                <video className={styles.tileMedia} src={item.content} preload="metadata" muted playsInline />
                <span className={styles.playBadge}><Play size={12} fill="currentColor" /></span>
            </>
        );
    }
    if (item.type === 'image') {
        return <img className={styles.tileMedia} src={item.content} alt={item.metadata?.name || ''} loading="lazy" draggable={false} />;
    }
    return (
        <div className={styles.tileFile}>
            <FileText size={20} />
            <span>{item.metadata?.name || 'File'}</span>
        </div>
    );
};
