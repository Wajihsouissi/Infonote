/**
 * The app is always local-first. This preference only decides whether the
 * device also mirrors its local workspace to Supabase.
 *
 * It is intentionally device-scoped: the choice is made once on first launch,
 * survives account changes, and can be changed later from Settings.
 */
export type StorageMode = 'local' | 'sync';

export const STORAGE_MODE_KEY = 'infonote.storage-mode.v2';
export const STORAGE_MODE_CHANGED_EVENT = 'infonote-storage-mode-changed';

const isStorageMode = (value: string | null): value is StorageMode =>
    value === 'local' || value === 'sync';

/**
 * Read the device choice, migrating the former per-user three-mode preference
 * when one exists. "Cloud" and "Both" both become the safe local+sync mode.
 */
/* localStorage is not merely empty in a hardened context — `getItem` and
   `setItem` THROW when site data is blocked. Every access here is guarded,
   because an exception on this path used to be unrecoverable: the read threw
   during the storage-choice modal's render, and the write threw before the
   modal could mark itself answered, so the app sat behind a dialog that could
   not be dismissed. A device that cannot remember the choice falls back to the
   safe answer — local-only — for the session instead. */
function readKey(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeKey(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

/** Remembers the choice for this session when the device cannot persist it. */
let sessionMode: StorageMode | null = null;

export function readStorageMode(userId?: string | null): StorageMode | null {
    if (typeof window === 'undefined') return null;

    const current = readKey(STORAGE_MODE_KEY);
    if (isStorageMode(current)) return current;

    if (userId) {
        const legacy = readKey(`chnk-it-storage-mode-${userId}`);
        if (legacy === 'local' || legacy === 'cloud' || legacy === 'both') {
            const migrated: StorageMode = legacy === 'local' ? 'local' : 'sync';
            writeKey(STORAGE_MODE_KEY, migrated);
            return migrated;
        }
    }

    return sessionMode;
}

export function writeStorageMode(mode: StorageMode): void {
    if (typeof window === 'undefined') return;
    // Held in memory too, so the answer survives this render even when the
    // device refuses to store it.
    sessionMode = mode;
    writeKey(STORAGE_MODE_KEY, mode);
    window.dispatchEvent(new CustomEvent(STORAGE_MODE_CHANGED_EVENT, { detail: { mode } }));
    // Keep older listeners alive during the migration window.
    window.dispatchEvent(new CustomEvent('chnk-it-storage-mode-changed'));
}

export function subscribeStorageMode(listener: (mode: StorageMode | null) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handle = () => listener(readStorageMode());
    window.addEventListener(STORAGE_MODE_CHANGED_EVENT, handle);
    return () => window.removeEventListener(STORAGE_MODE_CHANGED_EVENT, handle);
}

