/**
 * Prop comparison for canvas node components.
 *
 * React Flow hands every custom node its own absolute position as props
 * (`positionAbsoluteX` / `positionAbsoluteY`) and rewrites them on each frame
 * of a drag. A plain `memo` therefore bails on every pointermove and rebuilds
 * the whole card — header, body, block editor, the lot — for a number none of
 * these components read: the node is moved by a transform on React Flow's own
 * wrapper, not by anything the card renders. On a card with a live editor that
 * render is far longer than a frame, which is why a dragged card used to trail
 * behind the cursor and catch up only when it was dropped.
 *
 * So: compare every prop except the position, and let the transform do the
 * moving. Any node component that starts reading its position must opt out of
 * this and use the default comparison instead.
 */

const IGNORED = new Set(['positionAbsoluteX', 'positionAbsoluteY']);

export function samePropsIgnoringPosition<P extends object>(prev: Readonly<P>, next: Readonly<P>): boolean {
    const prevKeys = Object.keys(prev) as (keyof P & string)[];
    const nextKeys = Object.keys(next) as (keyof P & string)[];
    if (prevKeys.length !== nextKeys.length) return false;

    for (const key of prevKeys) {
        if (IGNORED.has(key)) continue;
        if (!Object.is(prev[key], next[key])) return false;
    }
    return true;
}
