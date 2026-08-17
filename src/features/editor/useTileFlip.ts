import { useLayoutEffect, useRef } from 'react';

/**
 * FLIP animation for a set of tiles that change places.
 *
 * Reordering a board used to be instantaneous in the worst sense: the pictures
 * teleported, and with a dense bento pack a single move can shuffle half the
 * composition, so what actually happened was unreadable. FLIP makes the
 * rearrangement legible — you see which picture went where — which is the
 * difference between trusting a drag and re-checking it afterwards.
 *
 * First/Last/Invert/Play: measure before, let the browser lay out, measure
 * after, apply the inverse transform, then animate it away. The layout engine
 * is never fought — the tiles are already in their final places, and only the
 * paint is walked back.
 */

/** Long enough to follow a tile across the board, short enough to stay out of
 *  the way of the next drag. */
const FLIP_MS = 260;

/** Decelerating: fast off the mark, settling into place. */
const FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/** Below this, a "move" is a sub-pixel reflow and animating it only smears. */
const MIN_DELTA_PX = 1;
const MIN_SCALE_DELTA = 0.01;

type Rect = { left: number; top: number; width: number; height: number };

/**
 * @param containerRef the element holding the tiles
 * @param signature    changes exactly when the tiles should be seen to move —
 *                     order and layout. Anything else that shifts them (a
 *                     resize) refreshes the measurements without animating,
 *                     because a board being dragged wider is not a
 *                     rearrangement and animating every frame of it would
 *                     smear the whole composition.
 * @param deps         everything that can move a tile, animated or not
 */
export function useTileFlip(
    containerRef: React.RefObject<HTMLElement | null>,
    signature: string,
    deps: unknown[],
) {
    const prev = useRef<Map<string, Rect>>(new Map());
    const prevSignature = useRef<string | null>(null);

    useLayoutEffect(() => {
        const host = containerRef.current;
        if (!host) return;

        const tiles = host.querySelectorAll<HTMLElement>('[data-tile-id]');
        const next = new Map<string, Rect>();

        /* The board can be inside the canvas's scaled viewport, where a
           bounding rect is in screen pixels but a CSS translate is in the
           element's own. Taken straight, every animation would be wrong by the
           zoom factor — far too short zoomed out, overshooting zoomed in.
           `offsetWidth` is unscaled by definition, so their ratio is the scale,
           whatever produced it. */
        const probe = tiles[0];
        const scale = probe && probe.offsetWidth > 0
            ? probe.getBoundingClientRect().width / probe.offsetWidth
            : 1;

        const animate = prevSignature.current !== null
            && prevSignature.current !== signature
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        for (const tile of tiles) {
            const id = tile.dataset.tileId;
            if (!id) continue;
            const r = tile.getBoundingClientRect();
            const now: Rect = { left: r.left, top: r.top, width: r.width, height: r.height };
            next.set(id, now);
            if (!animate) continue;

            const was = prev.current.get(id);
            // No previous position: it has just arrived, and sliding it in from
            // wherever the last tile happened to be would be a lie.
            if (!was || now.width === 0 || now.height === 0) continue;

            /* Centre to centre, not corner to corner.
               `transform-origin` is the element's middle, so a transform that
               both translates and scales moves the *centre* by its translation
               — pairing a top-left delta with a centred scale leaves the tile
               out by half the change in size, in both axes. On a dense bento
               re-pack, where tiles routinely change footprint as they move,
               that reads as pictures flinging themselves out of the board and
               snapping back. Centres are also the one measurement a rotation
               doesn't disturb, which is what the collage needs. */
            const dx = ((was.left + was.width / 2) - (now.left + now.width / 2)) / scale;
            const dy = ((was.top + was.height / 2) - (now.top + now.height / 2)) / scale;
            const sx = was.width / now.width;
            const sy = was.height / now.height;

            if (Math.abs(dx) < MIN_DELTA_PX && Math.abs(dy) < MIN_DELTA_PX
                && Math.abs(sx - 1) < MIN_SCALE_DELTA && Math.abs(sy - 1) < MIN_SCALE_DELTA) {
                continue;
            }

            /* `transform` only — never width/height — so this stays on the
               compositor and a board of thirty tiles does not relayout thirty
               times per frame. The picture inside is scaled with the tile,
               which is the honest read: the frame is what changed size. */
            tile.animate(
                [
                    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
                    { transform: 'none' },
                ],
                { duration: FLIP_MS, easing: FLIP_EASING, composite: 'replace' },
            );
        }

        prev.current = next;
        prevSignature.current = signature;
        // `signature` is inside `deps` at the call site; listing both would make
        // the hook re-run twice for one change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
