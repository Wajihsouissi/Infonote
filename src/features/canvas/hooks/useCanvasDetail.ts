import { useCallback, useSyncExternalStore } from 'react';
import { getTier, subscribeTier, isStreaming, subscribeStreaming } from './lodStore';

/**
 * How much of a card is worth building.
 *
 *  - `full`    live block editor, exactly as before
 *  - `preview` wireframe of the real blocks; body text is a smudge at this size
 *              or the card is off to one side, so a contenteditable per block
 *              (and a textarea per table cell) buys the user nothing
 */
export type DetailTier = 'full' | 'preview';

/** A 656px card is ~295px on screen here — the last size body text is legible. */
export const FULL_DETAIL_ZOOM = 0.45;

/**
 * Distance bands, in multiples of the viewport, measured from the visible
 * rectangle outwards.
 *
 * This is the level-of-detail scheme games use: what you are looking at is
 * drawn in full and everything beyond is drawn roughly. Zoom alone could not
 * express that — at one zoom level every card on a dense canvas is "legible",
 * so every card paid full price even though only a screenful is being read.
 */
export const NEAR_BAND = 0.35;  // just outside the viewport — still drawn in full

/**
 * Tier for one card.
 *
 * Subscribes to just this node's tier, so a card re-renders only when it
 * actually crosses a band — not every time the canvas recomputes what is
 * visible, which happens on every frame of a node drag.
 */
export function useCanvasDetail(nodeId?: string): DetailTier {
    const subscribe = useCallback(
        (onChange: () => void) => (nodeId ? subscribeTier(nodeId, onChange) : () => {}),
        [nodeId],
    );
    const snapshot = useCallback(() => getTier(nodeId), [nodeId]);
    return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * True while the canvas is mid-gesture (pan/zoom). Cheap subscribers use this
 * to hold back one-shot work — e.g. mounting editors — until the user stops.
 */
export function useStreaming(): boolean {
    const subscribe = useCallback((onChange: () => void) => subscribeStreaming(onChange), []);
    const snapshot = useCallback(() => isStreaming(), []);
    return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Lower of two tiers ('preview' being lowest). */
export const minTier = (a: DetailTier, b: DetailTier): DetailTier => {
    const order: DetailTier[] = ['preview', 'full'];
    return order[Math.min(order.indexOf(a), order.indexOf(b))];
};

export const tierForZoom = (zoom: number): DetailTier =>
    zoom >= FULL_DETAIL_ZOOM ? 'full' : 'preview';
