import type { Edge } from '@xyflow/react';
import type { AppNode } from '../../types';
import { collectAssetIds, parseAssetRef } from '../assets/assetRef';
import { assetBlob, getAsset, putAssetRecord, type AssetRecord } from '../assets/assetStore';
import { useStore } from '../../store/useStore';

/**
 * Your whole workspace, in one file you keep.
 *
 * The beta saves to this browser and nowhere else, which makes a backup the
 * difference between "my work is on my laptop" and "my work was on my laptop".
 * So this is deliberately the simplest possible thing that cannot lose data: a
 * single JSON file holding every card, every connection and every uploaded file
 * — no server, no account, nothing to configure.
 *
 * Files are the reason it is JSON rather than a zip: uploads live in IndexedDB
 * as blobs referenced by `asset:<id>`, and inlining them as base64 keeps the
 * backup one self-describing file that a person can look inside. It costs about
 * a third more bytes than a zip would, and saves a dependency and a format.
 */

const FORMAT = 'chnk-it-backup';
const VERSION = 1;

interface BackupAsset {
    id: string;
    name: string;
    mime: string;
    /** The file's bytes, base64. */
    data: string;
}

export interface WorkspaceBackup {
    format: typeof FORMAT;
    version: number;
    createdAt: string;
    nodes: AppNode[];
    edges: Edge[];
    assets: BackupAsset[];
}

/** Everything a card might point at: block content, covers, gallery items. */
function referencedAssetIds(nodes: AppNode[]): Set<string> {
    const ids = new Set<string>();
    for (const node of nodes) {
        const data = node.data as { content?: unknown; coverImage?: unknown; icon?: unknown };
        collectAssetIds(data.content, ids);
        for (const value of [data.coverImage, data.icon]) {
            const id = parseAssetRef(value);
            if (id) ids.add(id);
        }
    }
    return ids;
}

async function blobToBase64(blob: Blob): Promise<string> {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    // Chunked rather than one spread: a 20 MB file is 20 million arguments to
    // String.fromCharCode, which overflows the call stack.
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < buffer.length; i += CHUNK) {
        binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

function base64ToBytes(data: string): ArrayBuffer {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

/** Build a backup of what is on screen right now. */
export async function createBackup(): Promise<WorkspaceBackup> {
    const { nodes, edges } = useStore.getState();
    const assets: BackupAsset[] = [];

    for (const id of referencedAssetIds(nodes)) {
        const record = await getAsset(id);
        // A reference with no file behind it is already broken; skipping it
        // keeps the backup honest rather than failing the whole export.
        if (!record) continue;
        assets.push({
            id: record.id,
            name: record.name,
            mime: record.mime,
            data: await blobToBase64(assetBlob(record)),
        });
    }

    return {
        format: FORMAT,
        version: VERSION,
        createdAt: new Date().toISOString(),
        nodes,
        edges,
        assets,
    };
}

/** Hand the browser a file to save. */
export async function downloadBackup(): Promise<string> {
    const backup = await createBackup();
    const name = `chnk-it-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
    } finally {
        // Revoked on the next frame: revoking synchronously can beat the
        // download starting in some browsers.
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    return name;
}

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
