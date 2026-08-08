import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockMetadata } from './types';
import { isMediaType } from './mediaTypes';

/**
 * A gallery is a bento container for media — the moodboard.
 *
 * Dropping media on media used to concatenate two blocks into a vertical fused
 * stack, which is the wrong shape for pictures: a visual thinker arranging
 * references wants to see them *beside* each other, at different weights, all at
 * once. So media meeting media anywhere in the app produces one of these instead.
 *
 * Its items are ordinary `image` / `video` / `file` blocks kept in
 * `metadata.items`, not a new leaf shape. That is deliberate: absorbing a media
 * block into a gallery is then the identity function, releasing one back out is
 * too, and everything that already walks blocks (export, hydration, the
 * lightbox) keeps working on the contents.
 */

export type GalleryLayout = 'bento' | 'grid' | 'masonry';

/** Tile footprints, in grid cells. `lg` is the hero. */
export type GallerySpan = 'sm' | 'wide' | 'tall' | 'lg';

/** How a tile fills its cell. `cover` crops to a tight mosaic (the moodboard
 *  look); `contain` shows whole frames and is what you want for diagrams. */
export type GalleryFit = 'cover' | 'contain';

export const GALLERY_DEFAULT_LAYOUT: GalleryLayout = 'bento';
export const GALLERY_DEFAULT_FIT: GalleryFit = 'cover';

export const isGalleryType = (type?: string): boolean => type === 'gallery';

/** Canvas footprint for a gallery node. Matches --block-node-max: wide enough
 *  for four bento columns, which is where the rhythm starts to read. */
export const GALLERY_NODE_WIDTH = 432;

/**
 * Set on the drag payload when everything being dragged could join a gallery.
 *
 * It carries no value — its *presence* is the signal. `dataTransfer.getData` is
 * blocked during `dragover` (only `types` is readable), so a block being dragged
 * over another has no way to inspect what it is. A dedicated MIME key is the one
 * bit of information a drop target can read before the drop, and it's what lets
 * the target offer the "merge into a board" band only when that's really on offer.
 * Lowercase: browsers normalise the key.
 */
export const GALLERY_DRAG_MIME = 'application/chnk-it-gallery-able';

/** Marks a drag as a tile leaving (or moving within) a specific board. Its value
 *  is the item id — readable only on drop, like every other dataTransfer value. */
export const GALLERY_ITEM_MIME = 'application/chnk-it-gallery-item';

/**
 * Tell the board that something else took the tile it was dragging, so it can
 * drop it from its items.
 *
 * A tile is not a top-level block — it lives inside the board's
 * `metadata.items` — so the generic "filter the dragged ids out of the source
 * node's content" cleanup that every other drop path uses looks in the wrong
 * place and silently finds nothing, leaving the picture in two places at once.
 * Drop targets call this instead; it is a no-op for any drag that didn't start
 * in a board, which is why it can sit unconditionally on the common paths.
 */
export const claimGalleryItem = (ids: string[]): void => {
    const take = window.chnkItGalleryItemTaken;
    if (typeof take !== 'function') return;
    window.chnkItGalleryItemTaken = null;
    take(ids);
};

export const getGalleryItems = (block?: Block | null): Block[] =>
    Array.isArray(block?.metadata?.items) ? (block.metadata.items as Block[]) : [];

export const getGalleryLayout = (block?: Block | null): GalleryLayout =>
    (block?.metadata?.galleryLayout as GalleryLayout) ?? GALLERY_DEFAULT_LAYOUT;

export const getGalleryFit = (block?: Block | null): GalleryFit =>
    (block?.metadata?.galleryFit as GalleryFit) ?? GALLERY_DEFAULT_FIT;

/** A block a gallery can hold or swallow: any media, or another gallery. */
export const isGalleryMember = (block?: Block | null): boolean =>
    !!block && (isMediaType(block.type) || isGalleryType(block.type));

/** Every block in the set belongs in a gallery (and the set isn't empty). */
export const canAbsorbIntoGallery = (blocks?: Block[] | null): boolean =>
    Array.isArray(blocks) && blocks.length > 0 && blocks.every(isGalleryMember);

/**
 * Flatten a set of blocks into gallery items: a gallery contributes its items, a
 * piece of media contributes itself. Unresolved/empty media placeholders are
 * dropped — a moodboard of "add media" tiles is noise, not content.
 */
export const toGalleryItems = (blocks: Block[]): Block[] =>
    blocks.flatMap((b) => (isGalleryType(b.type) ? getGalleryItems(b) : (b.content?.trim() ? [b] : [])));

/** Two items with the same id would collide as React keys and on reorder. */
const withUniqueIds = (items: Block[]): Block[] => {
    const seen = new Set<string>();
    return items.map((item) => {
        if (item.id && !seen.has(item.id)) {
            seen.add(item.id);
            return item;
        }
        return { ...item, id: uuidv4() };
    });
};

export const createGalleryMetadata = (items: Block[] = [], extra?: BlockMetadata): BlockMetadata => ({
    ...extra,
    items: withUniqueIds(items),
    galleryLayout: extra?.galleryLayout ?? GALLERY_DEFAULT_LAYOUT,
    galleryFit: extra?.galleryFit ?? GALLERY_DEFAULT_FIT,
});

export const createGalleryBlock = (items: Block[] = [], title = ''): Block => ({
    id: uuidv4(),
    type: 'gallery',
    content: title,
    metadata: createGalleryMetadata(items),
});

/**
 * The single rule behind every "media dropped on media" path.
 *
 * Returns the gallery block that should replace `targetBlocks`, or null when
 * this pairing isn't a gallery and the caller should fall back to its normal
 * fusion/insert behaviour. Null is the common case — one text block landing on
 * another must not silently become a moodboard.
 *
 * A brand-new gallery needs two items to be worth making; an existing gallery
 * absorbs even a single one.
 */
export const mergeIntoGallery = (targetBlocks: Block[], sourceBlocks: Block[]): Block | null => {
    if (!canAbsorbIntoGallery(targetBlocks) || !canAbsorbIntoGallery(sourceBlocks)) return null;

    const existing = targetBlocks.find((b) => isGalleryType(b.type));
    const items = withUniqueIds([...toGalleryItems(targetBlocks), ...toGalleryItems(sourceBlocks)]);
    if (items.length < (existing ? 1 : 2)) return null;

    // Reuse the target gallery's identity and settings so a merge reads as
    // "these joined the board", not "the board was replaced".
    if (existing) {
        return { ...existing, metadata: { ...existing.metadata, items } };
    }
    return createGalleryBlock(items);
};

/* ------------------------------------------------------------------ *
 * Bento geometry
 * ------------------------------------------------------------------ */

/**
 * The repeating rhythm of an auto-arranged board: a hero, some small tiles, a
 * wide one, a tall one. Rendered with `grid-auto-flow: dense`, so the packer
 * backfills the gaps this pattern leaves and the board never ends ragged.
 */
const BENTO_CYCLE: GallerySpan[] = ['lg', 'sm', 'sm', 'wide', 'tall', 'sm'];

/** Small boards get hand-tuned arrangements — a cycle of six reads as debris at n=2. */
export const autoSpan = (index: number, total: number): GallerySpan => {
    if (total <= 2) return 'lg';
    if (total === 3) return index === 0 ? 'lg' : 'tall';
    if (total === 4) return index === 0 ? 'lg' : index === 3 ? 'wide' : 'sm';
    return BENTO_CYCLE[index % BENTO_CYCLE.length];
};

/** A hand-set span (the tile's size control) always beats the auto rhythm. */
export const resolveSpan = (item: Block, index: number, total: number, layout: GalleryLayout): GallerySpan => {
    if (layout !== 'bento') return 'sm';
    const manual = item.metadata?.span as GallerySpan | undefined;
    if (manual && SPAN_CELLS[manual]) return manual;
    return autoSpan(index, total);
};

const SPAN_CELLS: Record<GallerySpan, [number, number]> = {
    sm: [1, 1],
    wide: [2, 1],
    tall: [1, 2],
    lg: [2, 2],
};

/** Grid cells for a span, clamped so a wide tile can't overflow a narrow board. */
export const spanCells = (span: GallerySpan, columns: number): { cols: number; rows: number } => {
    const [c, r] = SPAN_CELLS[span] ?? SPAN_CELLS.sm;
    return { cols: Math.min(c, Math.max(1, columns)), rows: r };
};

/** What the tile's size button steps through. */
export const SPAN_CYCLE: GallerySpan[] = ['sm', 'wide', 'tall', 'lg'];

export const nextSpan = (current: GallerySpan): GallerySpan =>
    SPAN_CYCLE[(SPAN_CYCLE.indexOf(current) + 1) % SPAN_CYCLE.length];

/**
 * Columns for a measured width. A gallery has to read at both ends of a very
 * wide range — a 432px canvas node and a full-screen card — and a fixed count
 * fails at one of them, so this is measured rather than declared.
 */
export const columnsForWidth = (width: number): number => {
    if (width < 180) return 1;
    if (width < 300) return 2;
    if (width < 460) return 3;
    if (width < 720) return 4;
    return 5;
};

/** Floor on a tile's cell size. Past this the board is a mosaic of confetti. */
export const GALLERY_MIN_ROW = 28;

/** Above this many tiles the exact pack isn't worth walking — see `packedRows`. */
const PACK_LIMIT = 120;

/**
 * How many grid rows the board will occupy, by replaying CSS
 * `grid-auto-flow: dense` — for each tile in order, the first slot (scanning
 * row by row, then column) that it fits into.
 *
 * This exists so a hand-dragged height can be turned into an exact cell size:
 * the board's height is linear in the cell size (`rows * cell + gaps`), so
 * knowing the row count solves it in one step, with no measure-adjust-remeasure
 * loop and nothing to oscillate. Getting it from the DOM instead would mean
 * laying out, measuring, resizing and laying out again on every drag frame.
 */
export type BoardPack = {
    /** Grid rows the tiles occupy. */
    rows: number;
    /** Largest rectangular hole the pack left, for the add tile to fill. */
    hole: { cols: number; rows: number };
};

export const packBoard = (spans: { cols: number; rows: number }[], columns: number): BoardPack => {
    const width = Math.max(1, columns);
    if (spans.length === 0) return { rows: 1, hole: { cols: width, rows: 1 } };
    // A huge board is going to scroll whatever cell size we pick, so the exact
    // pack buys nothing — the naive bound is close enough and O(1).
    if (spans.length > PACK_LIMIT) {
        const cells = spans.reduce((sum, s) => sum + Math.min(s.cols, width) * s.rows, 0);
        return { rows: Math.ceil(cells / width), hole: { cols: 1, rows: 1 } };
    }

    const grid: boolean[][] = [];
    const row = (r: number) => {
        while (grid.length <= r) grid.push(new Array(width).fill(false));
        return grid[r];
    };
    const free = (r: number, c: number, w: number, h: number) => {
        for (let dr = 0; dr < h; dr++) {
            const line = row(r + dr);
            for (let dc = 0; dc < w; dc++) if (line[c + dc]) return false;
        }
        return true;
    };

    let used = 0;
    for (const span of spans) {
        const w = Math.min(span.cols, width);
        const h = Math.max(1, span.rows);
        // Terminates: an untouched row always fits, and `row()` grows on demand.
        for (let r = 0; ; r++) {
            let placed = false;
            for (let c = 0; c <= width - w; c++) {
                if (!free(r, c, w, h)) continue;
                for (let dr = 0; dr < h; dr++) {
                    const line = row(r + dr);
                    for (let dc = 0; dc < w; dc++) line[c + dc] = true;
                }
                used = Math.max(used, r + h);
                placed = true;
                break;
            }
            if (placed) break;
        }
    }

    /* The dense pack almost always leaves a ragged hole — the tail of the last
       row, or a notch a tall tile stepped around. Left alone it reads as a
       missing tile. Handing the biggest one to the add button turns the flaw
       into the affordance: the board always ends on a clean rectangle, and the
       "drop more here" target grows to whatever room is going spare.
       Grids here are at most 5 wide and a few dozen tall, so the exhaustive
       search is cheaper than the layout pass that follows it. */
    let hole = { cols: 1, rows: 1 };
    let best = 0;
    for (let r = 0; r < used; r++) {
        for (let c = 0; c < width; c++) {
            if (row(r)[c]) continue;
            for (let w = 1; c + w <= width; w++) {
                for (let h = 1; r + h <= used; h++) {
                    if (!free(r, c, w, h)) break;
                    // Squarer wins ties: a 2x2 hole reads as a tile, 4x1 as a seam.
                    const area = w * h;
                    if (area > best || (area === best && Math.abs(w - h) < Math.abs(hole.cols - hole.rows))) {
                        best = area;
                        hole = { cols: w, rows: h };
                    }
                }
            }
        }
    }
    // No hole at all: the add tile starts a fresh row and spans it.
    if (best === 0) return { rows: used + 1, hole: { cols: width, rows: 1 } };
    return { rows: used, hole };
};

/** The cell size that makes `rows` of tiles exactly fill `height`. */
export const cellSizeForHeight = (height: number, rows: number, gap: number): number => {
    if (rows <= 0) return GALLERY_MIN_ROW;
    return Math.max(GALLERY_MIN_ROW, (height - (rows - 1) * gap) / rows);
};
