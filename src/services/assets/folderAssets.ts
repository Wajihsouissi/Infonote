import type { AppNode } from '../../types';
import { getAsset, hasAsset, putRemoteAsset, type AssetMeta } from './assetStore';
import { isAssetRef, parseAssetRef } from './assetRef';
import { acquireAssetUrl, releaseAssetUrl } from './useAssetUrl';

const DIRECTORY = 'assets';
const mirrored = new WeakMap<FileSystemDirectoryHandle, Set<string>>();

function referencedIds(value: unknown, ids = new Set<string>()): Set<string> {
    if (isAssetRef(value)) {
        const id = parseAssetRef(value);
        if (id) {
            if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('An attachment has an invalid file reference.');
            ids.add(id);
        }
    } else if (Array.isArray(value)) {
        for (const item of value) referencedIds(item, ids);
    } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) referencedIds(item, ids);
    }
    return ids;
}

async function writeFile(directory: FileSystemDirectoryHandle, name: string, data: Blob | string): Promise<void> {
    const file = await directory.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    try {
        await writable.write(data);
        await writable.close();
    } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
    }
}

/** Copy immutable attachment bytes before committing a graph that refers to them. */
export async function saveFolderAssets(directory: FileSystemDirectoryHandle, nodes: AppNode[]): Promise<void> {
    const ids = referencedIds(nodes);
    if (!ids.size) return;
    const assets = await directory.getDirectoryHandle(DIRECTORY, { create: true });
    const known = mirrored.get(directory) ?? new Set<string>();
    mirrored.set(directory, known);
    for (const id of ids) {
        if (known.has(id)) continue;
        let asset = await getAsset(id);
        if (!asset) {
            // Resolve a cloud-only attachment through the same workspace-scoped
            // downloader used by the editor. Never export a dangling reference.
            const ref = `asset:${id}`;
            try { await acquireAssetUrl(ref); }
            finally { releaseAssetUrl(ref); }
            asset = await getAsset(id);
        }
        if (!asset) throw new Error(`The file ${id} is unavailable. Reconnect to the cloud before saving this folder copy.`);
        let exists = false;
        try {
            const file = await (await assets.getFileHandle(id)).getFile();
            const metadata = JSON.parse(await (await (await assets.getFileHandle(`${id}.json`)).getFile()).text()) as AssetMeta;
            exists = file.size === asset.size && metadata.hash === asset.hash;
        } catch { /* A missing or incomplete copy must be written again. */ }
        if (!exists) {
            await writeFile(assets, id, asset.blob);
            const { blob: _blob, remotePath: _remotePath, ...metadata } = asset;
            await writeFile(assets, `${id}.json`, JSON.stringify(metadata));
        }
        known.add(id);
    }
}

/** Restore files into this browser before publishing the imported graph. */
export async function loadFolderAssets(directory: FileSystemDirectoryHandle, nodes: AppNode[]): Promise<void> {
    for (const id of referencedIds(nodes)) {
        if (await hasAsset(id)) continue;
        try {
            const assets = await directory.getDirectoryHandle(DIRECTORY);
            const file = await (await assets.getFileHandle(id)).getFile();
            const metadata = JSON.parse(await (await (await assets.getFileHandle(`${id}.json`)).getFile()).text()) as AssetMeta;
            if (file.size !== metadata.size) throw new Error('Incomplete file');
            await putRemoteAsset(id, file, { ...metadata, remotePath: undefined });
        } catch {
            throw new Error(`The folder backup is missing attachment ${id}. Open it on the original device and save the folder again.`);
        }
    }
}
