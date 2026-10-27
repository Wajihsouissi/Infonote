/**
 * Small per-browser preferences (theme, last open canvas, recent colours).
 *
 * localStorage can throw — private windows, blocked site data, storage quota —
 * and a preference is never worth crashing the app over. Every access goes
 * through here so a failure reads as "no saved value" and a write is dropped.
 * Durable document data does NOT belong here; it lives in IndexedDB
 * (services/storage/LocalWorkspaceStore.ts).
 */

export const PREFERENCE_KEYS = {
    theme: 'chnk-it-theme',
    currentParentId: 'chnk-it-current-parent-id',
    recentColors: 'chnk-it-recent-colors',
    linkMetadataCache: 'chnk_metadata_cache',
} as const;

type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

export function readPreference(key: PreferenceKey): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writePreference(key: PreferenceKey, value: string | null): void {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Unavailable or full: the preference simply isn't remembered.
    }
}
