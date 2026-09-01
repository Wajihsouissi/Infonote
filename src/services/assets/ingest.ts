/**
 * ingest
 * --------------------------------------------------------------------------
 * The one door every uploaded file comes through, whatever route it arrived
 * by: the media picker, a drop on a block, a drop on the canvas, a paste, a
 * gallery tile.
 *
 * Before this existed each of those routes ran its own `readAsDataURL`, and
 * three of the five never checked the size limit at all — a 200 MB video
 * dropped on the editor body went straight into the document. One funnel means
 * one limit, one error message, and one place that decides what a file becomes.
 */
import { formatBytes, resolveMediaTypeFromFile, type ResolvedMediaType } from '../../features/editor/mediaTypes';
import { putAsset } from './assetStore';
import { makeAssetRef } from './assetRef';

/** Ceiling for a file held on this device. Generous because the bytes no
 *  longer travel inside the document — only a 43-character reference does. */
export const MAX_ASSET_BYTES = 100 * 1024 * 1024;

/** Ceiling for a file that can also reach cloud storage. Above this the file
 *  still works, but only on the device it was added from. */
export const MAX_CLOUD_ASSET_BYTES = 25 * 1024 * 1024;

export interface IngestedFile {
    /** `asset:<id>` — what the block stores as its content. */
    ref: string;
    /** Which block type this file resolves to. */
    type: ResolvedMediaType;
    metadata: {
        name: string;
        size: number;
        type: string;
        assetId: string;
        /** When it was added, so a file can be grouped by date alongside notes
         *  in the fullscreen rail. A block node carries no `createdAt` of its
         *  own the way a note does. */
        addedAt: string;
    };
}

const quotaMessage = (file: File) =>
    `There is not enough room left in this browser to store ${file.name} (${formatBytes(file.size)}). Free up space and try again.`;

/** Store one file and describe the block it should become. Rejects with a
 *  message meant to be shown to the user as-is. */
export async function ingestFile(file: File): Promise<IngestedFile> {
    if (file.size > MAX_ASSET_BYTES) {
        throw new Error(
            `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_ASSET_BYTES)}.`,
        );
    }

    let record;
    try {
        record = await putAsset(file);
    } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        if (name === 'QuotaExceededError') throw new Error(quotaMessage(file));
        throw new Error(`Could not store ${file.name}.`);
    }

    return {
        ref: makeAssetRef(record.id),
        type: resolveMediaTypeFromFile(file),
        metadata: {
            name: record.name,
            size: record.size,
            type: record.mime,
            assetId: record.id,
            addedAt: new Date(record.createdAt).toISOString(),
        },
    };
}

export interface IngestBatch {
    files: IngestedFile[];
    /** User-facing messages for the ones that did not make it. */
    errors: string[];
}

/** Store several files, keeping the ones that succeed. A single oversized file
 *  in a multi-select should not discard the rest of the selection. */
export async function ingestFiles(input: FileList | File[]): Promise<IngestBatch> {
    const results = await Promise.all(
        Array.from(input).map(async (file): Promise<IngestedFile | string> => {
            try {
                return await ingestFile(file);
            } catch (e) {
                return e instanceof Error ? e.message : `Could not read ${file.name}.`;
            }
        }),
    );

    return {
        files: results.filter((r): r is IngestedFile => typeof r !== 'string'),
        errors: results.filter((r): r is string => typeof r === 'string'),
    };
}
