import type { DetailTier } from './useCanvasDetail';

/**
 * Per-node level-of-detail, delivered by subscription rather than context.
 *
 * Context was the obvious home for this and the wrong one: its value changes
 * whenever the visible set is recomputed, so every card on the canvas
 * re-rendered on every re-cull — and during a node drag the store is rewritten
 * each mousemove, which recomputes the set each frame. Cards were re-rendering
 * dozens of times a second to arrive at the tier they already had.
 *
 * Here a card subscribes to its own id and is woken only when *its* tier
 * actually changes, which during a normal pan is almost never.
 */

type Listener = () => void;

const tiers = new Map<string, DetailTier>();
const listeners = new Map<string, Set<Listener>>();
let zoomCeiling: DetailTier = 'full';

/** Rank so "is this an upgrade or a downgrade" is a comparison. */
const RANK: Record<DetailTier, number> = { minimal: 0, preview: 1, full: 2 };

let streaming = false;
let pending: { next: Map<string, DetailTier>; ceiling: DetailTier } | null = null;

/**
 * While the view is moving, hold back detail *upgrades*.
 *
 * Panning into new territory promotes a row of cards to a richer tier, and
 * building those editors mid-gesture is what makes the drag stutter — measured
 * at 8fps panning into fresh canvas versus 48fps over ground already resolved.
 * Downgrades still apply immediately (throwing work away is free and keeps the
 * gesture cheap); upgrades are deferred to the moment the user stops, which is
 * also when they can actually read anything.
 */
export function setStreaming(on: boolean): void {
    if (streaming === on) return;
    streaming = on;
    if (!on && pending) {
        const held = pending;
        pending = null;
        applyTiers(held.next, held.ceiling);
    }
}

/**
 * Replace the published tiers, waking only the cards whose tier moved.
 * Called once per recompute of the visible set.
 */
export function publishTiers(next: Map<string, DetailTier>, ceiling: DetailTier): void {
    if (streaming) {
        pending = { next, ceiling };

        // Apply only the cheap direction: demotions, and new arrivals at the
        // lowest tier. Everything else waits for the gesture to end.
        const partial = new Map(tiers);
        next.forEach((tier, id) => {
            const current = tiers.get(id);
            if (current === undefined) partial.set(id, 'minimal');
            else if (RANK[tier] < RANK[current]) partial.set(id, tier);
        });
        tiers.forEach((_, id) => { if (!next.has(id)) partial.delete(id); });

        applyTiers(partial, ceiling);
        return;
    }
    applyTiers(next, ceiling);
}

function applyTiers(next: Map<string, DetailTier>, ceiling: DetailTier): void {
    zoomCeiling = ceiling;

    const woken: string[] = [];
    next.forEach((tier, id) => {
        if (tiers.get(id) !== tier) woken.push(id);
    });
    tiers.forEach((_, id) => {
        // Dropped from the visible set — let anything still mounted fall back.
        if (!next.has(id)) woken.push(id);
    });

    tiers.clear();
    next.forEach((tier, id) => tiers.set(id, tier));

    for (const id of woken) {
        const set = listeners.get(id);
        if (set) for (const l of set) l();
    }
}

/**
 * Tier for a node. Unknown ids report `full` on purpose: a card rendered off
 * the canvas — side panel, fullscreen modal, template preview — has no position
 * on any viewport and must stay fully editable.
 */
export function getTier(nodeId: string | undefined): DetailTier {
    if (!nodeId) return zoomCeiling;
    return tiers.get(nodeId) ?? 'full';
}

export function subscribeTier(nodeId: string, listener: Listener): () => void {
    let set = listeners.get(nodeId);
    if (!set) {
        set = new Set();
        listeners.set(nodeId, set);
    }
    set.add(listener);
    return () => {
        set!.delete(listener);
        if (set!.size === 0) listeners.delete(nodeId);
    };
}
