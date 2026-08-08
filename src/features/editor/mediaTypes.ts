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

/**
 * Inline data URLs are the storage format, so a file's bytes land in the document
 * and then in every sync payload — base64 inflates them by a further ~33%. Cap it.
 */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

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

/** Reads a file into the inline data URL that block content stores.
 *  Rejects with a user-facing message — callers surface it inline. */
export function readMediaFile(file: File): Promise<{ url: string; type: ResolvedMediaType }> {
    return new Promise((resolve, reject) => {
        if (file.size > MAX_MEDIA_BYTES) {
            reject(new Error(`${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_MEDIA_BYTES)}.`));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const url = e.target?.result;
            if (typeof url === 'string') resolve({ url, type: resolveMediaTypeFromFile(file) });
            else reject(new Error(`Could not read ${file.name}.`));
        };
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
    });
}
