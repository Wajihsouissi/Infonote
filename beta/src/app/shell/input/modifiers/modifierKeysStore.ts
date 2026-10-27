export type ModifierKeys = {
    ctrl: boolean;
    shift: boolean;
};

let current: ModifierKeys = { ctrl: false, shift: false };
const listeners = new Set<() => void>();
let initialized = false;

const emit = () => {
    for (const l of listeners) l();
};

const setCurrent = (next: ModifierKeys) => {
    if (current.ctrl === next.ctrl && current.shift === next.shift) return;
    // Global CSS keys Ctrl/Cmd-only affordances (e.g. clickable inline links)
    // off this class, so it lives beside the one set of key listeners.
    if (current.ctrl !== next.ctrl) document.body.classList.toggle('mod-key-held', next.ctrl);
    current = next;
    emit();
};

const handleKeyUpdate = (e: KeyboardEvent) => {
    setCurrent({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
};

const handleBlur = () => {
    setCurrent({ shift: false, ctrl: false });
};

/** Starts tracking (idempotent). Called at app boot; subscribing also starts it. */
export const startModifierKeyTracking = () => {
    if (initialized) return;
    if (typeof window === 'undefined') return;
    initialized = true;
    window.addEventListener('keydown', handleKeyUpdate);
    window.addEventListener('keyup', handleKeyUpdate);
    window.addEventListener('blur', handleBlur);
};

export const subscribeModifierKeys = (listener: () => void) => {
    startModifierKeyTracking();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const getModifierKeysSnapshot = () => {
    startModifierKeyTracking();
    return current;
};

