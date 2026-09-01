import { useCallback, useSyncExternalStore } from 'react';
import { getTier, isStreaming, subscribeStreaming, subscribeTier } from './lodStore';
import { useStore } from '../../../store/useStore';

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
export const FULL_DETAIL_ZOOM = 0.30;

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
 * Whether a canvas node may pay the cost of a live block editor.
 *
 * A canvas can contain many expanded notes, but only one is being actively
 * edited at a time. Keeping every nearby editor mounted makes each pan and
 * zoom carry all of their selection listeners, effects, and editable DOM.
 * This deliberately observes only this node's boolean selection state, so a
 * selection change wakes the two affected nodes rather than every card on the
 * board. While the viewport is streaming, even the selected editor steps down
 * to its static preview so contenteditable/layout work cannot steal gesture
 * frames; the shared mount scheduler restores it after the quiet period.
 *
 * `interactionReady` preserves the short post-selection guard used by canvas
 * nodes: React Flow finishes its click/drag bookkeeping before the editor can
 * claim pointer events.
 */
export function useCanvasEditorEligibility(nodeId: string, interactionReady: boolean): boolean {
    const isSoleSelection = useStore(useCallback(
        state => state.selectedCanvasNodeIds.size === 1 && state.selectedCanvasNodeIds.has(nodeId),
        [nodeId],
    ));
    const viewportStreaming = useSyncExternalStore(subscribeStreaming, isStreaming, isStreaming);
    return interactionReady && isSoleSelection && !viewportStreaming;
}

/** Lower of two tiers ('preview' being lowest). */
export const minTier = (a: DetailTier, b: DetailTier): DetailTier => {
    const order: DetailTier[] = ['preview', 'full'];
    return order[Math.min(order.indexOf(a), order.indexOf(b))];
};

export const tierForZoom = (zoom: number): DetailTier =>
    zoom >= FULL_DETAIL_ZOOM ? 'full' : 'preview';
