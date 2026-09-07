import type { AppNode } from '../../types';
import { isSupabaseConfigured, supabase } from '../supabase/client';
import { getAsset, markAssetRemote } from './assetStore';
import { isAssetRef, parseAssetRef } from './assetRef';
import { MAX_CLOUD_ASSET_BYTES } from './ingest';
import { setAssetRemoteFetcher } from './useAssetUrl';

const BUCKET = 'workspace-assets';

interface AssetManifestRow {
    id: string;
    workspace_id: string;
    storage_path: string;
    name: string;
    mime: string;
    size: number;
    hash: string;
}

function collectRefs(value: unknown, into = new Set<string>(), seen = new Set<object>()): Set<string> {
    if (isAssetRef(value)) {
        const id = parseAssetRef(value);
        if (id) into.add(id);
        return into;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return into;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item) => collectRefs(item, into, seen));
    } else {
        Object.values(value as Record<string, unknown>).forEach((item) => collectRefs(item, into, seen));
    }
    return into;
}

export interface AssetUploadResult {
    uploaded: number;
    skippedTooLarge: string[];
    errors: string[];
}

/** Upload every locally-held asset referenced by the graph before its rows. */
export async function uploadReferencedAssets(
    userId: string,
    workspaceId: string,
    nodes: AppNode[],
): Promise<AssetUploadResult> {
    const result: AssetUploadResult = { uploaded: 0, skippedTooLarge: [], errors: [] };
    if (!isSupabaseConfigured || !supabase) return result;

    const ids = collectRefs(nodes);
    for (const id of ids) {
        try {
            const asset = await getAsset(id);
            if (!asset) {
                // A graph loaded from cloud may intentionally be remote-only on
                // this device. Verify its manifest instead of treating missing
                // local bytes as a successful upload.
                const { data: remote, error } = await supabase
                    .from('workspace_assets')
                    .select('id')
                    .eq('workspace_id', workspaceId)
                    .eq('id', id)
                    .maybeSingle();
                if (error || !remote) result.errors.push(`Missing file bytes for asset ${id}.`);
                continue;
            }
            const expectedPath = `${workspaceId}/${id}`;
            if (asset.remotePath === expectedPath) continue;
            if (asset.size > MAX_CLOUD_ASSET_BYTES) {
                result.skippedTooLarge.push(asset.name);
                continue;
            }

            const { error: uploadError } = await supabase.storage
                .from(BUCKET)
                .upload(expectedPath, asset.blob, {
                    upsert: true,
                    contentType: asset.mime,
                    cacheControl: '31536000',
                });
            if (uploadError) throw uploadError;

            const row: AssetManifestRow & { created_by: string } = {
                id,
                workspace_id: workspaceId,
                storage_path: expectedPath,
                name: asset.name,
                mime: asset.mime,
                size: asset.size,
                hash: asset.hash,
                created_by: userId,
            };
            const { error: manifestError } = await supabase
                .from('workspace_assets')
                .upsert(row, { onConflict: 'workspace_id,id' });
            if (manifestError) throw manifestError;

            await markAssetRemote(id, expectedPath);
            result.uploaded += 1;
        } catch (error) {
            result.errors.push(error instanceof Error ? error.message : String(error));
        }
    }
    return result;
}

/**
 * Register the lazy cross-device downloader used by useAssetUrl. Switching to
 * another workspace replaces the closure, so asset ids can never bleed across
 * workspace RLS boundaries.
 */
export function configureAssetRemoteFetch(workspaceId: string | null): void {
    if (!workspaceId || !isSupabaseConfigured || !supabase) {
        setAssetRemoteFetcher(null);
        return;
    }

    setAssetRemoteFetcher(async (id) => {
        const { data: manifest, error } = await supabase
            .from('workspace_assets')
            .select('storage_path')
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .maybeSingle();
        if (error || !manifest?.storage_path) return null;
        const { data, error: downloadError } = await supabase.storage
            .from(BUCKET)
            .download(manifest.storage_path as string);
        return downloadError ? null : data;
    });
}
