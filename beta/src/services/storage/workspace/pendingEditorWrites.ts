/** Pending editor debounces belong to the workspace's unsaved state. */
const pending = new Map<symbol, () => void>();
const listeners = new Set<() => void>();

export const hasPendingEditorWrites = () => pending.size > 0;

export function markPendingEditorWrite(owner: symbol, flush: () => void) {
    pending.set(owner, flush);
    listeners.forEach(listener => listener());
}

export function clearPendingEditorWrite(owner: symbol) {
    if (pending.delete(owner)) listeners.forEach(listener => listener());
}

export function subscribePendingEditorWrites(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function flushPendingEditorWrites() {
    for (const [owner, flush] of [...pending]) {
        if (pending.get(owner) === flush) flush();
    }
}
