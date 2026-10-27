import { useEffect, useRef, useState } from 'react';
import { canThumbnail, makeThumbnail } from '../../blocks/media/mediaThumbnail';
import { getGalleryItems } from '../galleryTypes';
import type { Block } from '../../types';

/**
 * Give every picture on the board a downscaled copy to render from.
 *
 * It runs on the board rather than at the point media is added because there
 * are five ways onto a board — the picker, a drop, a paste, a block dragged in
 * from a card, a whole board merged into another — and a boarded picture that
 * missed its thumbnail is indistinguishable from one that never had a chance
 * at one. Sweeping the items covers all five and heals old boards saved before
 * thumbnails existed.
 *
 * `busy` pauses it: never while something is being carried. Encoding a bitmap
 * is the one genuinely expensive thing a board does and it holds the main
 * thread for the length of it, while pinning the composition at the start of a
 * drag changes `items` — exactly what wakes the sweep. The result was a stall
 * on the first frame of every drag on a board with thumbnails outstanding. It
 * picks up again the moment the picture is put down.
 */
export function useThumbnailSweep({ block, items, setItems, enabled, busy }: {
    block: Block;
    items: Block[];
    setItems: (next: Block[]) => void;
    enabled: boolean;
    busy: boolean;
}): void {
    /* `attempted` is what stops it spinning: `makeThumbnail` returns null for
       anything not worth shrinking, and without a record of having asked, every
       commit would re-ask for the same nulls forever. */
    const attempted = useRef<Set<string>>(new Set());
    /* Advances the sweep when a picture turns out not to need a thumbnail.
       Making one changes `items` and re-runs this effect on its own; declining
       to make one changes nothing, so without a nudge the sweep would stop at
       the first picture that was already small enough. */
    const [sweep, setSweep] = useState(0);

    useEffect(() => {
        if (!enabled || busy) return;
        const next = items.find((i) => (
            !i.metadata?.thumb && canThumbnail(i.content) && !attempted.current.has(i.id)
        ));
        if (!next) return;

        /* One picture per run, not a batch. Encoding a dozen bitmaps takes long
           enough that the board is very likely to change underneath — and a
           batch interrupted half way through loses every result it had already
           computed, because the single commit at the end never happens. One at
           a time, each result is banked as soon as it exists, and an
           interrupted picture is simply still pending on the next pass. It also
           spreads the encoding over separate frames. */
        let live = true;
        (async () => {
            const thumb = await makeThumbnail(next.content);
            // Interrupted: leave it unattempted so a later pass picks it up.
            if (!live) return;
            attempted.current.add(next.id);
            if (!thumb) {
                setSweep((s) => s + 1);
                return;
            }
            /* Re-read the board rather than closing over `items`: the tile may
               have been removed or reordered while this was encoding, and
               writing the stale list back would resurrect it. */
            setItems(getGalleryItems(block).map((i) => (
                i.id === next.id ? { ...i, metadata: { ...i.metadata, thumb } } : i
            )));
        })();

        return () => { live = false; };
        // `block` is deliberately absent: it changes on every commit, including
        // the one this effect makes, and the sweep only ever needs to react to
        // the item list itself.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, sweep, enabled, busy, setItems]);
}
