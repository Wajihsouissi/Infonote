import { memo } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { X } from '../../../components/icons';
import { ResizeArc } from '../../../components/ui/ResizeArc';
import {
    clampTileRatio, getManualSpan, resolveSpan, spanCells, spanLabel,
    type GalleryLayout, type GallerySpan,
} from '../galleryTypes';
import styles from '../GalleryBlock.module.css';
import tileStyles from './GalleryTile.module.css';
import type { Block } from '../types';
import { TileMedia } from './TileMedia';
import { clampPct, focalFromPointer, type Focal } from './focalPoint';

/** The empty slot held open for a picture arriving from outside the board. */
export const SLOT_ID = '__gallery-drop-slot__';


/** Everything a tile can ask the board to do. Stable, so a tile only
 *  re-renders when its own picture or state changes. */
export interface TileActions {
    open: (id: string) => void;
    remove: (id: string) => void;
    removeMany: (ids: string[]) => void;
    clearSelection: () => void;
    selectFromClick: (id: string, e: ReactMouseEvent) => void;
    moveBy: (id: string, delta: number) => void;
    cycleSpan: (id: string) => void;
    setSpan: (id: string, span: GallerySpan | undefined) => void;
    setFocal: (id: string, focal: Focal | undefined) => void;
    setDraftFocal: (draft: { id: string; focal: Focal } | null) => void;
    noteRatio: (id: string, ratio: number) => void;
    beginDrag: (e: ReactDragEvent, item: Block) => void;
    endDrag: () => void;
    onDragOver: (e: ReactDragEvent) => void;
    onDrop: (e: ReactDragEvent, id: string) => void;
    beginResize: (id: string, start: { x: number; y: number; span: GallerySpan }) => void;
    endResize: () => void;
}

interface GalleryTileProps {
    item: Block;
    index: number;
    /** How many tiles the board is laying out, which decides automatic spans. */
    total: number;
    layout: GalleryLayout;
    columns: number;
    /** Natural aspect ratio, for masonry. */
    ratio: number | undefined;
    place: { x: number; y: number; w: number; h: number; rot: number; z: number } | undefined;
    readOnly?: boolean;
    isSelected: boolean;
    selectionSize: number;
    isDragging: boolean;
    isResizing: boolean;
    /** Live crop position while one is being dragged. */
    draftFocal: Focal | null;
    adjustingFocus: boolean;
    resizeStart: { x: number; y: number; span: GallerySpan } | null;
    actions: TileActions;
}

export const GalleryTile = memo(function GalleryTile({
    item, index, total, layout, columns, ratio, place, readOnly,
    isSelected, selectionSize, isDragging, isResizing, draftFocal, adjustingFocus, resizeStart, actions,
}: GalleryTileProps) {
    const span = resolveSpan(item, index, total, layout);
    const { cols, rows: tileRows } = spanCells(span, columns);
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
        } as CSSProperties)
        : layout === 'masonry'
            ? ({ aspectRatio: clampTileRatio(ratio) } as CSSProperties)
            : ({ gridColumn: `span ${cols}`, gridRow: `span ${tileRows}` } as CSSProperties);

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
    const adjusting = adjustingFocus;
    const focal = draftFocal ?? item.metadata?.focal;

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
                        actions.setFocal(item.id, {
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
                    actions.open(item.id);
                    return;
                }

                /* Modifier + arrow moves the tile. Unmodified arrows are
                   left alone deliberately — they are how you walk a board,
                   and a board where arrowing to look at the next picture
                   rearranged it would be unusable. */
                if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    e.preventDefault();
                    e.stopPropagation();
                    actions.moveBy(item.id, e.key === 'ArrowRight' ? 1 : -1);
                    return;
                }
                // Home/End send it to the ends, the same as any list.
                if ((e.ctrlKey || e.metaKey) && (e.key === 'Home' || e.key === 'End')) {
                    e.preventDefault();
                    e.stopPropagation();
                    actions.moveBy(item.id, e.key === 'End' ? total : -total);
                    return;
                }
                /* The size button used to live in the tile's corner; this
                   is where its steppability went. Bento only — the other
                   layouts have no per-tile size to step. */
                if (e.key === 's' && layout === 'bento') {
                    e.preventDefault();
                    e.stopPropagation();
                    actions.cycleSpan(item.id);
                    return;
                }
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    e.stopPropagation();
                    // Whatever the selection is, if this tile is in it.
                    if (isSelected && selectionSize > 1) {
                        actions.removeMany([item.id]);
                        actions.clearSelection();
                    } else {
                        actions.remove(item.id);
                    }
                    return;
                }
                if (e.key !== 'Enter' && e.key !== ' ') return;
                // Space scrolls the page by default, and the editor's own
                // key handling treats Enter as a block split.
                e.preventDefault();
                e.stopPropagation();
                actions.open(item.id);
            }}
            onPointerDown={adjusting ? (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                actions.setDraftFocal({
                    id: item.id,
                    focal: focalFromPointer(e.currentTarget, e.clientX, e.clientY),
                });
            } : undefined}
            onPointerMove={adjusting ? (e) => {
                if (!draftFocal) return;
                e.stopPropagation();
                actions.setDraftFocal({
                    id: item.id,
                    focal: focalFromPointer(e.currentTarget, e.clientX, e.clientY),
                });
            } : undefined}
            onPointerUp={adjusting ? (e) => {
                if (!draftFocal) return;
                e.stopPropagation();
                e.currentTarget.releasePointerCapture(e.pointerId);
                // One write for the whole gesture, not one per frame.
                actions.setFocal(item.id, draftFocal);
                actions.setDraftFocal(null);
            } : undefined}
            /* `nodrag` is React Flow's opt-out, and without it a tile
               cannot be dragged at all on the canvas: the press starts a
               node-drag gesture, and that gesture installs a capture-phase
               `dragstart` killer on the window, so the browser's own drag
               never begins. Only the tiles opt out — the board's background
               keeps dragging the node, which is what moves the whole board
               now that it has no grip handle. */
            aria-pressed={isSelected || undefined}
            className={`
                ${styles.tile}
                ${isDragging ? styles.tileDragging : ''}
                ${isResizing ? tileStyles.tileResizing : ''}
                ${adjusting ? styles.tileAdjusting : ''}
                ${isSelected ? styles.tileSelected : ''}
                mediaViewTarget nodrag
            `}
            style={tileVars}
            /* Not draggable while adjusting: the press is a pan of the
               picture inside its frame, and a native drag starting under it
               would rip the tile off the board instead. */
            draggable={!readOnly && !adjusting}
            onDragStart={(e) => actions.beginDrag(e, item)}
            onDragEnd={actions.endDrag}
            onDragOver={actions.onDragOver}
            onDrop={(e) => actions.onDrop(e, item.id)}
            /* Double-click recentres — the way out of a crop you dragged
               somewhere you didn't mean. */
            onDoubleClick={adjusting
                ? (e) => { e.stopPropagation(); actions.setFocal(item.id, undefined); }
                : () => actions.open(item.id)}
            onClick={adjusting ? undefined : (e) => {
                /* Modifier-click selects; a plain click still opens the
                   picture, which is the gesture the board is used for most
                   and must not change meaning depending on hidden state. */
                if (!readOnly && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                    e.stopPropagation();
                    e.preventDefault();
                    actions.selectFromClick(item.id, e);
                    return;
                }
                actions.open(item.id);
            }}
        >
            <TileMedia item={item} onRatio={actions.noteRatio} focal={focal} />

            {adjusting && (
                /* The crop's anchor, shown only while placing it. Marking
                   where the picture is held from is what makes the drag
                   feel like aiming rather than nudging. */
                <span
                    className={tileStyles.focalMark}
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
                    className={`${styles.tileBtn} ${tileStyles.tileRemove} nodrag`}
                    title="Remove from board"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); actions.remove(item.id); }}
                >
                    <X size={13} />
                </button>
            )}
            {!readOnly && layout === 'bento' && (
                <div
                    className={`${styles.tileResizeHandle} nodrag ${isResizing ? styles.isResizing : ''}`}
                    title={`Size: ${spanLabel(getManualSpan(item))} — drag to resize, double-click for auto`}
                    onClick={(e) => e.stopPropagation()}
                    /* The way back to the board's rhythm, and the same
                       gesture the node's own resize handle uses to give up
                       a hand-dragged size. */
                    onDoubleClick={(e) => { e.stopPropagation(); actions.setSpan(item.id, undefined); }}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        (e.target as HTMLElement).setPointerCapture(e.pointerId);
                        actions.beginResize(item.id, { x: e.clientX, y: e.clientY, span });
                    }}
                    onPointerMove={(e) => {
                        if (!isResizing || !resizeStart) return;
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
                            actions.setSpan(item.id, newSpan);
                        }
                    }}
                    onPointerUp={(e) => {
                        e.stopPropagation();
                        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                        actions.endResize();
                    }}
                >
                    {/* The same corner arc a card and a canvas node are
                        resized by. Resizing a tile is the same gesture on
                        the same kind of thing, and it was wearing a
                        different mark for no reason — a chevron that
                        looked like a scrollbar corner and read as chrome
                        rather than as a grip. */}
                    <ResizeArc from="var(--accent)" to="var(--secondary)" />
                </div>
            )}
        </div>
    );
});
