/**
 * Whether the camera is moving ("streaming") — a pan, a zoom, or a node drag.
 *
 * Held outside React so the hot paths can read it without subscribing: the
 * mount scheduler parks card-editor mounts while it is set (building an editor
 * mid-gesture is what makes a pan stutter), and the one selected card steps
 * down to its static preview until the gesture ends.
 */

type Listener = () => void;

let streaming = false;
const listeners = new Set<Listener>();

export function setStreaming(on: boolean): void {
    if (streaming === on) return;
    streaming = on;
    listeners.forEach((listener) => listener());
}

/** True while a pan/zoom gesture or node drag is in flight. */
export function isStreaming(): boolean {
    return streaming;
}

export function subscribeStreaming(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
