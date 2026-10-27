/**
 * Whether the camera is moving ("streaming") — a pan, a zoom, or a node drag.
 *
 * Held outside React so the hot paths can read it without subscribing: the
 * mount scheduler parks card-editor mounts while it is set (building an editor
 * mid-gesture is what makes a pan stutter). Existing selected editors retain
 * their DOM so a gesture cannot cause expensive reading/editing replacements.
 */

type Listener = () => void;

let streaming = false;
let overview = false;
const overviewListeners = new Set<Listener>();

/** Publish only threshold crossings; wheel frames never wake every node. */
export function setOverviewZoom(zoom: number): void {
    const next = overview ? zoom < 0.2 : zoom < 0.16;
    if (next === overview) return;
    overview = next;
    overviewListeners.forEach(listener => listener());
}

export const isOverview = () => overview;
export function subscribeOverview(listener: Listener): () => void {
    overviewListeners.add(listener);
    return () => { overviewListeners.delete(listener); };
}

export function setStreaming(on: boolean): void {
    if (streaming === on) return;
    streaming = on;
    // Keep continuous, paint-heavy button decoration off the gesture's frame
    // budget. One attribute edge pauses it without waking React subscribers.
    if (typeof document !== 'undefined') {
        document.documentElement.toggleAttribute('data-canvas-streaming', on);
    }
}

/** True while a pan/zoom gesture or node drag is in flight. */
export function isStreaming(): boolean {
    return streaming;
}
