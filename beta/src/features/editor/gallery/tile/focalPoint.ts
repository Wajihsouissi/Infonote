import type { CSSProperties } from 'react';

/**
 * Where a picture is anchored inside its frame.
 *
 * A moodboard crops every tile to its cell, so the interesting part of a
 * picture is often the part that gets cut. The focal point is what the reader
 * drags to say "keep this bit", and it is stored as percentages so it survives
 * the tile being resized or the whole board being re-laid out.
 */

/** A picture's focal point, in percent of its own frame — `object-position`. */
export type Focal = { x: number; y: number };

export const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** The point of the picture the pointer is over, as `object-position` percents. */
export const focalFromPointer = (el: HTMLElement, clientX: number, clientY: number): Focal => {
    const r = el.getBoundingClientRect();
    return {
        x: clampPct(((clientX - r.left) / Math.max(1, r.width)) * 100),
        y: clampPct(((clientY - r.top) / Math.max(1, r.height)) * 100),
    };
};

/**
 * Where `cover` should crop from. Absent means centred, which is the browser's
 * own default, so an untouched picture carries no inline style at all.
 */
export const focalStyle = (focal?: Focal): CSSProperties | undefined => (
    focal ? { objectPosition: `${focal.x}% ${focal.y}%` } : undefined
);
