import type { Block } from '../types';

/**
 * The thumbnail the browser carries under the cursor during a tile drag.
 *
 * Built by hand rather than left to the browser: its default is a screenshot
 * of the element, which on a board means a full-size tile obscuring the very
 * composition the drop is being judged against.
 */

export const DRAG_PREVIEW_W = 132;
export const DRAG_PREVIEW_H = 96;

/**
 * The thumbnail shown under the cursor while a tile is being dragged.
 *
 * Without one, the browser snapshots the tile where it sits — inside the
 * canvas's scaled viewport — so the thing following the cursor is whatever size
 * the current zoom happened to make it: a postage stamp zoomed out, a slab
 * zoomed in, and blurry either way. A preview built outside that transform is
 * the same crisp size at every zoom.
 *
 * The tile's own `<img>` is cloned rather than a fresh one created: its bitmap
 * is already decoded, and the browser snapshots this element the instant
 * `dragstart` returns — a new `<img>`, even from a data URL, can still be
 * undecoded at that moment and snapshot blank.
 */
export function buildDragPreview(tile: HTMLElement, item: Block): HTMLElement {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    /* Parked offscreen: it must be laid out and painted to be snapshotted, so it
       cannot be `display:none` or detached.
       The corner echoes --media-radius scaled down — the preview is about a
       third of a tile, and a tile's full corner on something this small rounds
       it away into a lozenge. */
    host.style.cssText = `
        position:fixed; top:0; left:-10000px;
        width:${DRAG_PREVIEW_W}px; height:${DRAG_PREVIEW_H}px;
        border-radius:16px; overflow:hidden; pointer-events:none;
        background:#111; box-shadow:0 10px 24px rgba(0,0,0,.4);
    `;

    const img = tile.querySelector('img');
    if (img) {
        const clone = img.cloneNode(true) as HTMLImageElement;
        clone.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        clone.removeAttribute('class');
        host.appendChild(clone);
    } else {
        // Video and file tiles have no bitmap to clone — a labelled plate reads
        // better than an empty box.
        const label = document.createElement('div');
        label.textContent = item.metadata?.name || item.type;
        label.style.cssText = `
            width:100%; height:100%; display:flex; align-items:center;
            justify-content:center; padding:8px; box-sizing:border-box;
            font: 500 11px/1.3 system-ui, sans-serif; color:#fff;
            text-align:center; word-break:break-word;
        `;
        host.appendChild(label);
    }

    document.body.appendChild(host);
    return host;
}
