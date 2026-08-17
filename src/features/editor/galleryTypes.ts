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

export type GalleryLayout = 'bento' | 'grid' | 'masonry' | 'scatter';

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
    const manual = getManualSpan(item);
    if (manual) return manual;
    return autoSpan(index, total);
};

/** The tile's own span, if it has been sized by hand. `undefined` means it is
 *  still following the auto rhythm. */
export const getManualSpan = (item: Block): GallerySpan | undefined => {
    const manual = item.metadata?.span as GallerySpan | undefined;
    return manual && SPAN_CELLS[manual] ? manual : undefined;
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

/**
 * What the tile's size control steps through — `undefined` is "auto", the
 * board's own rhythm.
 *
 * Auto being *in* the cycle is the whole point. Without it, one click of the
 * size button (or a stray nudge of the resize handle) pinned that tile to a
 * hand-set span forever, because `resolveSpan` gives a manual span permanent
 * priority — so a board could be knocked out of its composition by accident
 * with no way back to it. Stepping past `lg` hands the tile back to the rhythm.
 */
const SPAN_STEPS: (GallerySpan | undefined)[] = ['sm', 'wide', 'tall', 'lg', undefined];

export const nextSpan = (manual: GallerySpan | undefined): GallerySpan | undefined =>
    SPAN_STEPS[(SPAN_STEPS.indexOf(manual) + 1) % SPAN_STEPS.length];

/** How a tile's current size should be described. */
export const spanLabel = (manual: GallerySpan | undefined): string => (
    manual ? { sm: 'Small', wide: 'Wide', tall: 'Tall', lg: 'Large' }[manual] : 'Auto'
);

/**
 * Pin every tile's *current* shape onto the tile itself.
 *
 * The auto rhythm is indexed by position — slot 0 is the hero, slot 3 is wide —
 * so shapes belong to slots, not to pictures. That is right for a board nobody
 * has touched: whatever you drop in comes out composed. It is wrong the moment
 * someone starts arranging, because moving one picture then re-shapes every
 * picture after it, and a drag where six tiles change size while you aim is
 * impossible to aim with.
 *
 * So the first deliberate rearrangement freezes the composition: from then on
 * shapes travel with their pictures and a move is only a move. `Reset tile
 * sizes` in the panel is the way back to the rhythm — which is exactly what
 * that control is for.
 *
 * A no-op outside bento, where spans are not read at all.
 */
export const withResolvedSpans = (items: Block[], layout: GalleryLayout): Block[] => {
    if (layout !== 'bento') return items;
    const total = items.length;
    return items.map((item, index) => {
        const span = resolveSpan(item, index, total, layout);
        return item.metadata?.span === span
            ? item
            : { ...item, metadata: { ...item.metadata, span } };
    });
};

/** Hand the whole board back to the auto rhythm. */
export const clearManualSpans = (items: Block[]): Block[] => items.map((item) => (
    item.metadata?.span === undefined
        ? item
        : { ...item, metadata: { ...item.metadata, span: undefined } }
));

/** Whether anything on the board has been sized by hand. */
export const hasManualSpans = (items: Block[]): boolean =>
    items.some((item) => getManualSpan(item) !== undefined);

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

/* ------------------------------------------------------------------ *
 * Masonry geometry
 * ------------------------------------------------------------------ */

/**
 * Masonry columns for a measured width.
 *
 * Deliberately not `columnsForWidth`. Bento columns are cells in a square
 * rhythm, so more of them is finer grain; a masonry column is the full width a
 * picture gets, and below roughly 200px a portrait shot is a thumbnail nobody
 * can read. So this targets a column *width* (~260px) rather than a count, and
 * a 432px canvas node lands on two generous columns instead of three cramped
 * ones.
 */
export const masonryColumnsForWidth = (width: number): number => {
    if (width < 260) return 1;
    if (width < 520) return 2;
    if (width < 820) return 3;
    if (width < 1120) return 4;
    return 5;
};

/**
 * Aspect-ratio bounds for a masonry tile, as width / height.
 *
 * Uncropped natural heights are the whole point of masonry, right up until one
 * 1:4 phone screenshot occupies a column on its own and the board turns into a
 * ladder. Everything between a portrait 2:3 and a landscape 2:1 passes through
 * untouched — which is nearly every real photograph — and only the extremes get
 * trimmed back into the composition by the tile's `cover`.
 */
export const MASONRY_MIN_RATIO = 0.62;
export const MASONRY_MAX_RATIO = 2.1;

/** What a tile assumes before its bitmap reports in: 4:3, so the column has a
 *  sensible height from the first paint and nothing jumps when it loads. */
export const MASONRY_FALLBACK_RATIO = 4 / 3;

export const clampTileRatio = (ratio?: number): number => {
    if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return MASONRY_FALLBACK_RATIO;
    return Math.min(MASONRY_MAX_RATIO, Math.max(MASONRY_MIN_RATIO, ratio));
};

/**
 * Deal items into masonry columns, shortest column first.
 *
 * CSS `columns` — what this replaces — fills column by column, so on a board of
 * nine the first three pictures stack down the left edge and the order you
 * arranged them in is unreadable. Dealing in item order to whichever column is
 * currently shortest keeps the sequence running left-to-right the way it reads,
 * and still ends the columns level, which is the only thing the CSS version was
 * actually buying.
 *
 * Heights are in column-width units (`1 / ratio`), so no pixel measurement is
 * needed and the result is identical at every zoom.
 */
export const dealMasonry = <T,>(
    entries: T[],
    columns: number,
    ratioOf: (entry: T) => number,
    gapUnits = 0.05,
): { columns: T[][]; heights: number[] } => {
    const width = Math.max(1, columns);
    const cols: T[][] = Array.from({ length: width }, () => []);
    const heights = new Array<number>(width).fill(0);
    for (const entry of entries) {
        let target = 0;
        for (let i = 1; i < width; i++) {
            // Strictly shorter, so equal columns fill left to right.
            if (heights[i] < heights[target] - 1e-6) target = i;
        }
        cols[target].push(entry);
        heights[target] += 1 / clampTileRatio(ratioOf(entry)) + gapUnits;
    }
    return { columns: cols, heights };
};

/* ------------------------------------------------------------------ *
 * Scatter geometry — the pinned collage
 * ------------------------------------------------------------------ */

/**
 * A stable pseudo-random number in [0, 1) from an id and a channel.
 *
 * Seeded from the picture's own id rather than its position, which is the whole
 * trick: a tile's tilt and its size are properties of the *picture*, so
 * rearranging the board moves the cards around without re-rolling how any of
 * them looks. `Math.random()` would reshuffle the entire collage on every
 * render, and an index-based seed would reshuffle it on every drag.
 *
 * FNV-1a: three lines, no dependency, and well enough distributed that two
 * adjacent uuids don't land on the same tilt.
 */
const hash01 = (seed: string, salt: number): number => {
    let h = (2166136261 ^ salt) >>> 0;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
};

/** Where one tile sits on the collage, in the board's own pixels. */
export interface ScatterPlacement {
    x: number;
    y: number;
    w: number;
    h: number;
    /** Tilt in degrees, applied with the `rotate` property so `transform`
     *  stays free for FLIP. */
    rot: number;
    /** Stacking order — later pictures lie on top of earlier ones. */
    z: number;
}

/** Room left around the collage for the tilt to bleed into. */
const SCATTER_PAD = 10;

/** Tilt range, in degrees. Past about four the board stops reading as pinned
 *  paper and starts reading as broken. */
const SCATTER_TILT = 3.2;

/** Tile width as a fraction of its lane. Over 1 on purpose: cards wider than
 *  their lane are what make neighbours overlap. */
const SCATTER_MIN_SCALE = 0.84;
const SCATTER_MAX_SCALE = 1.26;

/** Sideways wander, as a fraction of the lane. */
const SCATTER_DRIFT = 0.34;

/** How far a card laps over the one above it, as a fraction of its own height. */
const SCATTER_MIN_LAP = 0.04;
const SCATTER_MAX_LAP = 0.18;

/** Stagger on the top edge, so the collage doesn't start on a ruled line. */
const SCATTER_HEAD = 0.22;

/**
 * Roughly one card in five is enlarged, and by how much.
 *
 * Without it every card lands within a hand's breadth of the lane width and the
 * pile reads as a slightly untidy grid. A collage needs a few pictures that are
 * plainly the loud ones for the eye to have somewhere to start.
 */
const SCATTER_HERO_ODDS = 0.8;
const SCATTER_HERO_SCALE = 1.34;

/**
 * Lanes for a measured width.
 *
 * Wider than masonry's columns: cards overflow their lane and overlap their
 * neighbours, so a lane is a loose track a picture is aimed down rather than a
 * box it fills. Too many of them and the overlap disappears into a grid.
 */
export const scatterLanesForWidth = (width: number): number => {
    if (width < 300) return 1;
    if (width < 560) return 2;
    if (width < 900) return 3;
    if (width < 1240) return 4;
    return 5;
};

/**
 * Deal the board into an overlapping, tilted collage — pictures pinned to a
 * wall rather than filed into cells.
 *
 * Bento, grid and masonry all share one premise: tiles tessellate, and nothing
 * ever covers anything else. That is right for comparing references and wrong
 * for composing with them — a moodboard is normally *built* by sliding pictures
 * partly over each other until the group reads as one image. This is that
 * board.
 *
 * Placement is still a shortest-lane deal in item order, exactly as masonry is,
 * so the sequence you arranged the board in still runs left to right and the
 * collage still ends roughly level. Everything that makes it look hand-pinned —
 * each card's size, its drift off the lane centre, how far it laps over its
 * neighbour, its tilt — is seeded from the picture's own id, so it is stable
 * across renders and travels with the picture when the board is rearranged.
 */
export const dealScatter = (
    entries: { id: string; ratio: number }[],
    width: number,
    lanes: number,
): { places: Map<string, ScatterPlacement>; height: number } => {
    const count = Math.max(1, lanes);
    const usable = Math.max(40, width - SCATTER_PAD * 2);
    const laneW = usable / count;
    const bottoms = new Array<number>(count).fill(0);
    const places = new Map<string, ScatterPlacement>();

    entries.forEach((entry, index) => {
        const r = (salt: number) => hash01(entry.id, salt);

        // Shortest lane first, so a card lands in the gap the eye expects and
        // the lanes stay level.
        let lane = 0;
        for (let i = 1; i < count; i++) if (bottoms[i] < bottoms[lane] - 1e-6) lane = i;

        const hero = r(5) > SCATTER_HERO_ODDS ? SCATTER_HERO_SCALE : 1;
        const w = Math.min(
            usable,
            laneW * hero * (SCATTER_MIN_SCALE + r(1) * (SCATTER_MAX_SCALE - SCATTER_MIN_SCALE)),
        );
        const h = w / clampTileRatio(entry.ratio);

        const centre = lane * laneW + laneW / 2 + (r(2) - 0.5) * laneW * SCATTER_DRIFT;
        const x = Math.max(0, Math.min(usable - w, centre - w / 2));

        // The first card in a lane hangs from the top edge; every one after it
        // laps over whatever it landed on.
        const y = Math.max(0, bottoms[lane] === 0
            ? h * SCATTER_HEAD * r(3)
            : bottoms[lane] - h * (SCATTER_MIN_LAP + r(3) * (SCATTER_MAX_LAP - SCATTER_MIN_LAP)));

        bottoms[lane] = y + h;
        places.set(entry.id, {
            x: x + SCATTER_PAD,
            y: y + SCATTER_PAD,
            w,
            h,
            rot: (r(4) * 2 - 1) * SCATTER_TILT,
            z: index + 1,
        });
    });

    return { places, height: Math.max(0, ...bottoms) + SCATTER_PAD * 2 };
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
 *
 * It used to also hunt for the largest rectangular hole the dense pack left, to
 * grow the add tile into. There is no add tile any more — media arrives from
 * the panel's own button — so a ragged tail is simply the shape the pictures
 * make, which is what a dense pack is for.
 */
export const packBoard = (spans: { cols: number; rows: number }[], columns: number): number => {
    const width = Math.max(1, columns);
    if (spans.length === 0) return 1;
    // A huge board is going to scroll whatever cell size we pick, so the exact
    // pack buys nothing — the naive bound is close enough and O(1).
    if (spans.length > PACK_LIMIT) {
        const cells = spans.reduce((sum, s) => sum + Math.min(s.cols, width) * s.rows, 0);
        return Math.ceil(cells / width);
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

    return used;
};

/** The cell size that makes `rows` of tiles exactly fill `height`. */
export const cellSizeForHeight = (height: number, rows: number, gap: number): number => {
    if (rows <= 0) return GALLERY_MIN_ROW;
    return Math.max(GALLERY_MIN_ROW, (height - (rows - 1) * gap) / rows);
};
