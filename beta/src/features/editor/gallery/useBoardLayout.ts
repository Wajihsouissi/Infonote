import { useLayoutEffect, useMemo, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { Block } from '../types';
import {
    cellSizeForHeight, columnsForWidth, dealMasonry, dealScatter, masonryColumnsForWidth,
    packBoard, resolveSpan, scatterLanesForWidth, spanCells,
    MASONRY_FALLBACK_RATIO, type GalleryLayout,
} from '../galleryTypes';

/** Gap between tiles, in px. Mirrored by --gal-gap in the stylesheet. */
export const GAP = 8;

interface BoardLayoutOptions {
    gridRef: RefObject<HTMLDivElement | null>;
    /** What is actually laid out: the drop preview while dragging, else the board. */
    boardItems: Block[];
    itemCount: number;
    layout: GalleryLayout;
    /** Natural aspect ratios, reported by each bitmap as it decodes. */
    ratios: Record<string, number>;
    /** A hand-dragged height, which the board solves its cell size against. */
    boardHeight: number | undefined;
}

/**
 * How the board arranges itself: how many columns, how big a cell, and — for
 * the free-flowing layouts — where every tile goes.
 *
 * All of it derives from one measurement, the board's width. The column count
 * is derived rather than observed because bento and masonry want different
 * counts from the same width, and re-observing on every layout switch would be
 * a tear-down for nothing.
 */
export function useBoardLayout({ gridRef, boardItems, itemCount, layout, ratios, boardHeight }: BoardLayoutOptions) {
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const el = gridRef.current;
        if (!el) return;
        const measure = (next: number) => {
            if (next > 0) setWidth((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
        };
        measure(el.getBoundingClientRect().width);
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) measure(entry.contentRect.width);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [gridRef]);

    /* Bento counts cells, masonry counts columns of pictures. Before the first
       measurement, three is the sensible guess for both. */
    const columns = useMemo(() => {
        if (width <= 0) return 3;
        if (layout !== 'masonry') return columnsForWidth(width);
        /* Never more columns than pictures: a wide board holding two of them
           would deal one per column and leave the rest of the width as blank
           tracks, which reads as broken rather than sparse. */
        return Math.min(masonryColumnsForWidth(width), Math.max(1, itemCount));
    }, [width, layout, itemCount]);

    /* Width drives the row height too, so a tile spanning two columns is twice
       as wide AND twice as tall — what makes a bento read as composed rather
       than accidental. */
    const cell = useMemo(() => (
        width <= 0 ? 120 : Math.max(48, Math.round((width - (columns - 1) * GAP) / columns))
    ), [width, columns]);

    /* Row count drives the height solve — measured on what is actually laid
       out, so a board holding a slot open doesn't clip it. */
    const rows = useMemo(() => {
        // Neither of the free-flowing layouts has cells to count.
        if (layout === 'masonry' || layout === 'scatter') return 1;
        const total = boardItems.length;
        const shapes = boardItems.map((item, i) => spanCells(resolveSpan(item, i, total, layout), columns));
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

    // Masonry and the collage have no rows to solve — they own their own flow —
    // so a set height is a floor for them rather than something tiles scale into.
    const scalesToFit = boardHeight !== undefined && layout !== 'masonry' && layout !== 'scatter';
    const rowSize = scalesToFit ? cellSizeForHeight(boardHeight, rows, GAP) : cell;

    /* A floor, never a ceiling. The board never scrolls: a moodboard you have to
       scroll is no longer a composition you can see, and the height you dragged
       is a statement about how much room the pictures get, not a window cut over
       a taller board. When the cell-size solve bottoms out — a board dragged
       shorter than its own tiles can be — the board grows past the floor rather
       than clipping what it cannot fit. */
    const gridVars = {
        '--gal-cols': columns,
        '--gal-row': `${rowSize}px`,
        '--gal-gap': `${GAP}px`,
        ...(boardHeight !== undefined ? { minHeight: `${boardHeight}px` } : null),
        /* The collage's own height: its cards are out of flow, so the container
           has no height of its own to give the board. */
        ...(scatter ? { height: `${scatter.height}px` } : null),
    } as CSSProperties;

    return { width, columns, cell, rows, rowSize, scatter, masonry, gridVars };
}
