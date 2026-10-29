import { putAssetRecord, type AssetRecord } from '../../assets/assetStore';
import { useStore } from '../../../store/useStore';
import { BACKUP_FORMAT as FORMAT, BACKUP_VERSION as VERSION, createGraphBackup, downloadPreparedBackup, type WorkspaceBackup } from './backupExport';
export type { WorkspaceBackup } from './backupExport';

function base64ToBytes(data: string): ArrayBuffer {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}


/** Export the live workspace; recovery uses the same codec with a saved graph. */
export const createBackup = () => createGraphBackup(useStore.getState());
export const downloadBackup = async () => downloadPreparedBackup(await createBackup());

function isBackup(value: unknown): value is WorkspaceBackup {
    if (!value || typeof value !== 'object') return false;
    const backup = value as Partial<WorkspaceBackup>;
    return backup.format === FORMAT
        && Array.isArray(backup.nodes)
        && Array.isArray(backup.edges);
}

export interface RestoreResult {
    nodes: number;
    edges: number;
    files: number;
}

/**
 * Replace the workspace with a backup's contents.
 *
 * Replace, not merge: two copies of the same canvas interleaved is not a state
 * anyone asked for, and the cards carry their original ids, so a merge would
 * either collide or silently duplicate. The caller is responsible for asking
 * first — see ProfilePage.
 *
 * Files are written back before the graph, so no card is ever on screen
 * pointing at a file that has not arrived yet.
 */
export async function restoreBackup(file: File): Promise<RestoreResult> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(await file.text());
    } catch {
        throw new Error('That file is not a Chnk it backup.');
    }
    if (!isBackup(parsed)) throw new Error('That file is not a Chnk it backup.');
    if (parsed.version > VERSION) {
        throw new Error('That backup was made by a newer version of Chnk it.');
    }

    const assets = Array.isArray(parsed.assets) ? parsed.assets : [];
    for (const asset of assets) {
        if (!asset?.id || typeof asset.data !== 'string') continue;
        const bytes = base64ToBytes(asset.data);
        await putAssetRecord({
            id: asset.id,
            name: asset.name || 'Untitled',
            mime: asset.mime || 'application/octet-stream',
            size: bytes.byteLength,
            // The hash is what deduplicates future uploads; a restored file
            // keeps its identity through its id, and the next upload of the
            // same bytes simply stores a second copy. Cheap, and never wrong.
            hash: `restored:${asset.id}`,
            createdAt: Date.now(),
            bytes,
        });
    }

    useStore.getState().loadGraph(parsed.nodes, parsed.edges);
    return { nodes: parsed.nodes.length, edges: parsed.edges.length, files: assets.length };
}

export type { AssetRecord };
