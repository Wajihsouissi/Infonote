import type { Edge } from '@xyflow/react';
import type { AppNode } from '../../../types';
import { collectNodeAssetIds } from '../../assets/nodeAssetRefs';
import { assetBlob, getAsset } from '../../assets/assetStore';
import { recoverRepeatedContent } from './repeatedContentRecovery';
import type { Block } from '../../../features/editor/types';

interface BackupGraph { nodes: AppNode[]; edges: Edge[] }

export const BACKUP_FORMAT = 'chnk-it-backup';
export const BACKUP_VERSION = 1;

interface BackupAsset {
    id: string;
    name: string;
    mime: string;
    /** The file's bytes, base64. */
    data: string;
}

export interface WorkspaceBackup {
    format: typeof BACKUP_FORMAT;
    version: number;
    createdAt: string;
    nodes: AppNode[];
    edges: Edge[];
    assets: BackupAsset[];
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

/** Build a backup of what is on screen right now. */
export async function createGraphBackup({ nodes, edges }: BackupGraph): Promise<WorkspaceBackup> {
    // Recovery export reads raw saved rows, bypassing graph hydration. Preserve
    // corrupt repetitions losslessly without expanding a multi-GB JSON string.
    nodes = nodes.map(node => {
        if (!Array.isArray(node.data.content)) return node;
        const recovered = recoverRepeatedContent(node.data.content as Block[]);
        if (!recovered) return node;
        const data = node.data;
        return { ...node, data: { ...data, content: recovered.content, _contentRecovery: {
            ...recovered.recovery, ...(data._contentRecovery !== undefined ? { previous: data._contentRecovery } : {}),
        } } } as AppNode;
    });
    const assets: BackupAsset[] = [];

    const assetIds = new Set<string>();
    for (const node of nodes) collectNodeAssetIds(node, assetIds);
    for (const id of assetIds) {
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
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        nodes,
        edges,
        assets,
    };
}

/** Hand the browser a file to save. */
export async function downloadGraphBackup(graph: BackupGraph): Promise<string> {
    return downloadPreparedBackup(await createGraphBackup(graph));
}

export function downloadPreparedBackup(backup: WorkspaceBackup): string {
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
