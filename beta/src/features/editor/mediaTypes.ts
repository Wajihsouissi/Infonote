import type { BlockType } from './types';

/**
 * Media arrives from four routes — the media block's picker, a file dropped on the
 * editor, a paste, and an embedded URL — and each one used to carry its own
 * mime-sniffing ladder. They disagreed: paste mapped `image/*` and `video/*`, the
 * placeholder validated against the block type it was already in, and a pasted
 * `.mp4` link became an image block. One ladder, used by all four.
 *
 * `media` is the unresolved state: a block that knows it holds media but not which
 * kind yet. It renders the picker, and the first file or URL through it rewrites the
 * block's type to one of the three below, which is what everything downstream
 * (resize, canvas sizing, previews, export) already understands.
 */
export type ResolvedMediaType = 'image' | 'video' | 'file';

/** Every block type the media picker can produce, plus the unresolved placeholder. */
export const MEDIA_TYPES: readonly BlockType[] = ['media', 'image', 'video', 'file'];

export function isMediaType(type?: BlockType | string): boolean {
    return MEDIA_TYPES.includes(type as BlockType);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|heic|heif)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|avi|mkv)(\?|#|$)/i;

/** Hosts that serve a player page rather than a file — an embed, still a video. */
const VIDEO_HOSTS = /(youtube\.com|youtu\.be|vimeo\.com|loom\.com|dailymotion\.com)/i;

/** Resolve from a MIME type, falling back to the filename when the MIME is missing
 *  or generic (`application/octet-stream` is what several OSes report for a drag). */
export function resolveMediaType(mime?: string, name?: string): ResolvedMediaType {
    if (mime?.startsWith('image/')) return 'image';
    if (mime?.startsWith('video/')) return 'video';
    if (name) {
        if (IMAGE_EXT.test(name)) return 'image';
        if (VIDEO_EXT.test(name)) return 'video';
    }
    return 'file';
}

export function resolveMediaTypeFromFile(file: File): ResolvedMediaType {
    return resolveMediaType(file.type, file.name);
}

/** Resolve from a pasted or embedded URL. Data URLs carry their own MIME. */
export function resolveMediaTypeFromUrl(url: string): ResolvedMediaType {
    const trimmed = url.trim();
    const dataMatch = /^data:([^;,]+)/i.exec(trimmed);
    if (dataMatch) return resolveMediaType(dataMatch[1]);
    if (VIDEO_HOSTS.test(trimmed)) return 'video';
    if (IMAGE_EXT.test(trimmed)) return 'image';
    if (VIDEO_EXT.test(trimmed)) return 'video';
    return 'file';
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* Reading a file is no longer this module's job. Bytes go to the asset store
   via `ingestFile` in services/assets, which is the single place that enforces
   the size limit and hands back the `asset:<id>` reference a block stores. */
