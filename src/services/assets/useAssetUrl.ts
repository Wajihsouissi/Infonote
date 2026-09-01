/**
 * useAssetUrl
 * --------------------------------------------------------------------------
 * Resolves whatever a block stores in `content` into something an `<img>`,
 * `<video>` or `<iframe>` can point at.
 *
 * An `asset:<id>` reference becomes a blob URL for the bytes in the asset
 * store; every other string (`data:`, `https:`, `blob:`) is handed back
 * unchanged and synchronously, so legacy documents render on the first frame
 * exactly as they always did.
 *
 * Blob URLs are ref-counted per asset, because the same file can be on screen
 * in a card, a peek and an overlay at once and each of those would otherwise
 * mint and revoke its own. The last release schedules revocation rather than
 * doing it immediately: React remounts effects constantly (StrictMode does it
 * on purpose), and a URL revoked between the teardown and the re-run leaves a
 * broken image behind.
 */
import { useEffect, useMemo, useState } from 'react';
import { getAsset, putRemoteAsset } from './assetStore';
import { isAssetRef, parseAssetRef } from './assetRef';

/** How long a blob URL outlives its last consumer. */
const REVOKE_GRACE_MS = 15_000;

type Entry = {
    url: string | null;
    refs: number;
    promise: Promise<string | null>;
    revokeTimer: ReturnType<typeof setTimeout> | null;
};

const entries = new Map<string, Entry>();

/**
 * Cloud fetch for an asset this device has never held. Registered by
 * `assetSync` at startup; left null the rest of the time so this module never
 * has to know Supabase exists.
 */
let remoteFetcher: ((id: string) => Promise<Blob | null>) | null = null;

export const setAssetRemoteFetcher = (fn: ((id: string) => Promise<Blob | null>) | null): void => {
    remoteFetcher = fn;
};

async function resolveBlobUrl(id: string): Promise<string | null> {
    const local = await getAsset(id);
    if (local) return URL.createObjectURL(local.blob);

    if (!remoteFetcher) return null;
    const remote = await remoteFetcher(id);
    if (!remote) return null;
    // Cache it so the next resolve is local.
    await putRemoteAsset(id, remote).catch(() => undefined);
    return URL.createObjectURL(remote);
}

/** Take a reference on an asset's blob URL. Every call must be paired with
 *  `releaseAssetUrl`. Safe to call for non-asset strings, which resolve to
 *  themselves. */
export function acquireAssetUrl(content: string): Promise<string | null> {
    const id = parseAssetRef(content);
    if (!id) return Promise.resolve(content);

    let entry = entries.get(id);
    if (entry) {
        entry.refs += 1;
        if (entry.revokeTimer) {
            clearTimeout(entry.revokeTimer);
            entry.revokeTimer = null;
        }
        return entry.promise;
    }

    const created: Entry = { url: null, refs: 1, revokeTimer: null, promise: Promise.resolve(null) };
    created.promise = resolveBlobUrl(id).then((url) => {
        created.url = url;
        // Released while the read was still in flight: nothing holds it now.
        if (created.refs <= 0 && url) {
            URL.revokeObjectURL(url);
            created.url = null;
            entries.delete(id);
            return null;
        }
        return url;
    });
    entry = created;
    entries.set(id, entry);
    return entry.promise;
}

export function releaseAssetUrl(content: string): void {
    const id = parseAssetRef(content);
    if (!id) return;
    const entry = entries.get(id);
    if (!entry) return;

    entry.refs -= 1;
    if (entry.refs > 0 || entry.revokeTimer) return;

    entry.revokeTimer = setTimeout(() => {
        const current = entries.get(id);
        if (!current || current.refs > 0) return;
        if (current.url) URL.revokeObjectURL(current.url);
        entries.delete(id);
    }, REVOKE_GRACE_MS);
}

/** Drop a cached blob URL immediately — call after the underlying asset is
 *  deleted or replaced, so the next read does not hand back stale bytes. */
export function invalidateAssetUrl(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    if (entry.revokeTimer) clearTimeout(entry.revokeTimer);
    if (entry.url) URL.revokeObjectURL(entry.url);
    entries.delete(id);
}

export type AssetUrlStatus = 'ready' | 'loading' | 'missing';

export interface AssetUrlState {
    /** Ready to render, or null while loading or when the bytes are gone. */
    url: string | null;
    status: AssetUrlStatus;
}

/**
 * The resolved URL is stored together with the content it belongs to, and the
 * status is derived from comparing the two during render rather than reset by
 * the effect. That is what keeps this to a single state write per resolve: an
 * effect that also had to clear stale state on the way in would re-render
 * twice for every change of content.
 */
type Resolved = { content: string; url: string | null };

export function useAssetUrl(content: string | undefined): AssetUrlState {
    const [resolved, setResolved] = useState<Resolved | null>(null);

    useEffect(() => {
        if (!content || !isAssetRef(content)) return;

        let live = true;
        acquireAssetUrl(content).then((url) => {
            if (live) setResolved({ content, url });
        });

        return () => {
            live = false;
            releaseAssetUrl(content);
        };
    }, [content]);

    return useMemo<AssetUrlState>(() => {
        if (!content) return { url: null, status: 'missing' };
        // Anything that is already a URL needs no trip to storage, and must not
        // flash a placeholder on the way to rendering itself.
        if (!isAssetRef(content)) return { url: content, status: 'ready' };
        if (resolved?.content !== content) return { url: null, status: 'loading' };
        return resolved.url ? { url: resolved.url, status: 'ready' } : { url: null, status: 'missing' };
    }, [content, resolved]);
}
