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
    current = next;
    emit();
};

const handleKeyUpdate = (e: KeyboardEvent) => {
    setCurrent({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
};

const handleBlur = () => {
    setCurrent({ shift: false, ctrl: false });
};

const init = () => {
    if (initialized) return;
    if (typeof window === 'undefined') return;
    initialized = true;
    window.addEventListener('keydown', handleKeyUpdate);
    window.addEventListener('keyup', handleKeyUpdate);
    window.addEventListener('blur', handleBlur);
};

export const subscribeModifierKeys = (listener: () => void) => {
    init();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const getModifierKeysSnapshot = () => {
    init();
    return current;
};

