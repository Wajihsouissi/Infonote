/**
 * Reconciling dnd-kit's measurements with the canvas zoom.
 *
 * dnd-kit measures everything with `getBoundingClientRect`, so every distance
 * it reports is already multiplied by the canvas zoom. Feeding one of those
 * numbers back as a CSS translate *inside* the zoomed pane multiplies it a
 * second time: at 50% zoom a card asked to move one slot moves half of one, at
 * 200% it moves two. Dividing the transform by the zoom cancels the extra
 * factor and the card lands exactly where the placeholder opened.
 *
 * Two things deliberately do NOT get this treatment:
 *  - Collision detection, which compares client rects against a client-space
 *    pointer. Both sides carry the same zoom, so it cancels on its own.
 *  - The drag overlay, which is portalled out of the pane to `document.body`
 *    and therefore lives in unscaled client space already. Correcting it there
 *    would introduce the very error this fixes.
 *
 * The board reads the zoom once, when a drag begins, and publishes it here.
 * Nothing re-reads it mid-gesture: the canvas cannot be zoomed while a card is
 * held, and subscribing every card to the viewport would re-render the whole
 * board on every turn of the wheel.
 */

import { createContext, useContext } from 'react';
import type { Transform } from '@dnd-kit/utilities';

export const KanbanZoomContext = createContext<number>(1);

/** The canvas zoom in force for this board, or 1 outside one. */
export const useKanbanZoom = (): number => {
    const zoom = useContext(KanbanZoomContext);
    // A zero or negative zoom is not reachable through the UI, but dividing by
    // it would put the card at infinity, so it is worth the one comparison.
    return zoom > 0 ? zoom : 1;
};

/** `transform` corrected for the canvas zoom, ready for `CSS.Translate`. */
export const unscale = (transform: Transform | null, zoom: number): Transform | null =>
    transform ? { ...transform, x: transform.x / zoom, y: transform.y / zoom } : null;
