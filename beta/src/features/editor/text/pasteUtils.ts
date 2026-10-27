import { v4 as uuidv4 } from 'uuid';
import type { Block } from '../types';
import { ingestFiles } from '../../../services/assets';
import { parsePlainText } from './parsePlainText';
import { processNodes } from './parseHtml';
import { cleanLatex, hasLatex } from './latex';
import { isUrl } from './links';
import { resolveMediaTypeFromUrl } from '../blocks/media/mediaTypes';

/* The two ways content arrives from outside: files, and whatever the clipboard
   calls text. Both end in blocks, and both go through the same parsers the
   editor uses for typing, so a paste cannot produce something typing could
   not. */

export { isUrl, renderContentWithLinks } from './links';
export { normalizeTableRows, splitTableCells } from './markdownTables';
export { parsePlainText } from './parsePlainText';

/**
 * 1. Handle pasted files — any kind, resolved from MIME/extension.
 *
 * Goes through the asset store like every other upload route. It used to
 * `readAsDataURL` straight into the block, which is how a pasted 200 MB video
 * could land in the document without ever meeting the size limit.
 */
export const parseFiles = async (files: FileList): Promise<Block[]> => {
    if (!files?.length) return [];
    const { files: stored } = await ingestFiles(files);
    return stored.map((f) => ({
        id: uuidv4(),
        type: f.type,
        content: f.ref,
        metadata: f.metadata,
    }));
};

// 2. Handle Text/HTML - SYNC
export const parseTextOrHtml = (e: React.ClipboardEvent): Block[] => {
    const blocks: Block[] = [];
    const clipboardData = e.clipboardData;
    const text = clipboardData.getData('text/plain')?.trim();

    // Smart Interceptor: If pasting a single direct URL
    if (text && isUrl(text)) {
        const mediaType = resolveMediaTypeFromUrl(text);
        
        // Direct media files (like .mp4 or .png URLs) can be native blocks
        if (mediaType === 'video' && /\.(mp4|webm|mov|m4v|ogv|avi|mkv)(\?|#|$)/i.test(text)) {
            return [{
                id: uuidv4(),
                type: 'video',
                content: text,
            }];
        }
        if (mediaType === 'image') {
            return [{
                id: uuidv4(),
                type: 'image',
                content: text,
            }];
        }

        // Other URLs (including YouTube/Vimeo) become links.
        // We omit 'displayMode' so LinkBlock can auto-detect if it's embeddable.
        return [{
            id: uuidv4(),
            type: 'link',
            content: text.startsWith('http') ? text : 'https://' + text,
            metadata: {
                isLoading: true
            }
        }];
    }

    // Smart Interceptor: If pasting multiple URLs (one per line)
    if (text && text.includes('\n')) {
        const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
        const allUrls = lines.every(l => isUrl(l));
        if (allUrls) {
            return lines.map(line => {
                const mediaType = resolveMediaTypeFromUrl(line);
                if (mediaType === 'video' && /\.(mp4|webm|mov|m4v|ogv|avi|mkv)(\?|#|$)/i.test(line)) {
                    return {
                        id: uuidv4(),
                        type: 'video',
                        content: line,
                    };
                }
                if (mediaType === 'image') {
                    return {
                        id: uuidv4(),
                        type: 'image',
                        content: line,
                    };
                }
                return {
                    id: uuidv4(),
                    type: 'link',
                    content: line.startsWith('http') ? line : 'https://' + line,
                    metadata: {
                        isLoading: true
                    }
                };
            });
        }
    }

    // 2. Handle HTML
    const html = clipboardData.getData('text/html');
    if (html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        if (doc.body.children.length > 0) {
            processNodes(Array.from(doc.body.childNodes), blocks);
            if (blocks.length > 0) return blocks;
        }
    }

    // 3. Fallback: Handle Plain Text (including Markdown/LaTeX from ChatGPT)
    if (text) {
        // If text contains LaTeX, clean it first then parse
        const cleaned = hasLatex(text) ? cleanLatex(text) : text;
        return parsePlainText(cleaned);
    }

    return [];
};
