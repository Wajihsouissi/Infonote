import { useSyncExternalStore } from 'react';
import { getModifierKeysSnapshot, subscribeModifierKeys, type ModifierKeys } from './modifierKeysStore';

const fallback: ModifierKeys = { ctrl: false, shift: false };

export function useModifierKeys() {
    return useSyncExternalStore(subscribeModifierKeys, getModifierKeysSnapshot, () => fallback);
}

