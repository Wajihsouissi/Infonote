import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockMetadata, ColumnData } from '../editor/types';
import { parsePlainText } from '../editor/pasteUtils';

/** A copy-only payload from the Chunk It rail to the canvas. */
export const CHUNK_IT_MIME = 'application/chnk-it-chunk-data';

export type ChunkItDragPayload = {
    kind: 'block' | 'section';
    blocks: Block[];
};

export type ChunkSection = {
    id: string;
    start: number;
    end: number;
    blocks: Block[];
};

const headingLevel = (block: Block): number | null => {
    if (block.type === 'heading1') return 1;
    if (block.type === 'heading2') return 2;
    if (block.type === 'heading3') return 3;

    // Imported and legacy notes sometimes retain heading semantics in their
    // HTML/markdown instead of the editor's block type. Treat those title-like
    // rows exactly like AI response headings so Chunk It can still group them.
    const html = block.content.trim();
    if (/^<h1(?:\s[^>]*)?>/i.test(html)) return 1;
    if (/^<h2(?:\s[^>]*)?>/i.test(html)) return 2;
    if (/^<h3(?:\s[^>]*)?>/i.test(html)) return 3;

    const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
    const markdown = text.match(/^(#{1,6})\s+\S/);
    if (markdown) return markdown[1].length;

    const isBoldOnly = /^<(?:strong|b)(?:\s[^>]*)?>[\s\S]*?<\/(?:strong|b)>$/i.test(html)
        || /^\*\*[^*\n]+\*\*\s*:?$/.test(text);
    if (isBoldOnly) return 7;

    // A practical fallback for imported articles whose section titles arrived
    // as ordinary text blocks. Sentences still stay in their paragraph because
    // they generally end in punctuation; short, title-like lines become a
    // lightweight outline level for Chunk It.
    if (text.length > 0 && text.length <= 90 && !/[.!?;,:]$/.test(text) && /^(?:\d+[.)]\s+|[A-ZÀ-ÖØ-Þ])/.test(text)) return 7;
    return null;
};

const isBlankTextBlock = (block: Block) => block.type === 'text' && block.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length === 0;
const paragraphBreakBefore = (block: Block) => block.metadata?.chunkItParagraphBreakBefore === true;
const readableLength = (block: Block) => block.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length;

/** When no outline survives an import, use the source article's own paragraph
 * seams as candidates, accepting only useful card-sized groups. */
function paragraphFallbackCuts(blocks: Block[]): Set<number> {
    const totalLength = blocks.reduce((sum, block) => sum + readableLength(block), 0);
    if (blocks.length < 4 || totalLength < 420) return new Set();

    const targetLength = Math.min(900, Math.max(520, Math.round(totalLength / Math.max(2, Math.ceil(totalLength / 760)))));
    const minimumSectionLength = Math.round(targetLength * 0.62);
    const cuts = new Set<number>();
    let sectionLength = 0;

    for (let index = 0; index < blocks.length - 1; index += 1) {
        sectionLength += readableLength(blocks[index]);
        const nextStartsParagraph = paragraphBreakBefore(blocks[index + 1]);
        const currentIsList = ['bullet', 'numbered', 'todo'].includes(blocks[index].type);
        const nextIsList = ['bullet', 'numbered', 'todo'].includes(blocks[index + 1].type);
        if ((nextStartsParagraph || (currentIsList && !nextIsList)) && sectionLength >= minimumSectionLength) {
            cuts.add(index);
            sectionLength = 0;
        }
    }

    // Some imported articles hard-wrap every paragraph without blank lines.
    // Keep this conservative so ordinary short notes remain a single section.
    if (cuts.size === 0 && blocks.length >= 7 && totalLength >= 900) {
        let length = 0;
        let count = 0;
        blocks.slice(0, -1).forEach((block, index) => {
            length += readableLength(block);
            count += 1;
            if (count >= 3 && length >= targetLength) {
                cuts.add(index);
                length = 0;
                count = 0;
            }
        });
    }

    return cuts;
}

/** Convert rich-text article markup to a small Markdown-shaped stream before
 * reusing the editor's trusted parser. A card may contain one text block whose
 * HTML carries an entire article; without this pass, headings inside it can
 * never become Chunk It section boundaries. */
function articleMarkupToText(html: string): string {
    return html
        .replace(/<(?:p|div)[^>]*>\s*<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>\s*<\/(?:p|div)>/gi, (_match, title: string) => `\n\n## ${title.replace(/<[^>]*>/g, '').trim()}\n\n`)
        .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, title: string) => `\n\n${'#'.repeat(Number(level))} ${title.replace(/<[^>]*>/g, '').trim()}\n\n`)
        .replace(/<(?:p|div|li|blockquote)[^>]*>([\s\S]*?)<\/(?:p|div|li|blockquote)>/gi, (_match, text: string) => `\n${text.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').trim()}\n`)
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        .replace(/<[^>]*>/g, '');
}

/** Expand a single article-sized text block into its paragraphs and headings.
 * This is preview-only: the source node remains untouched until the user
 * chooses to create a canvas copy. */
export function normalizeChunkBlocks(blocks: Block[]): Block[] {
    return blocks.flatMap((block) => {
        if (block.type !== 'text') return [block];

        const content = block.content;
        const hasArticleStructure = /\r?\n/.test(content)
            || /<(?:h[1-6]|p|div|li|blockquote|br)\b/i.test(content)
            || /^\s*(?:#{1,6}\s+|\*\*[^*\n]+\*\*\s*:?)$/m.test(content);
        if (!hasArticleStructure) return [block];

        const parsed = parsePlainText(articleMarkupToText(content));
        if (parsed.length === 0) return [block];

        let startsNewParagraph = false;
        return parsed.flatMap((parsedBlock) => {
            if (isBlankTextBlock(parsedBlock)) {
                startsNewParagraph = true;
                return [];
            }
            const normalized = startsNewParagraph
                ? { ...parsedBlock, metadata: { ...parsedBlock.metadata, chunkItParagraphBreakBefore: true } }
                : parsedBlock;
            startsNewParagraph = false;
            return [normalized];
        });
    });
}

export function getAutomaticCutIndices(blocks: Block[]): Set<number> {
    const headings = blocks
        .map((block, index) => ({ index, level: headingLevel(block) }))
        .filter((item): item is { index: number; level: number } => item.level !== null);

    /* A document often has one H1 page title followed by several H2 sections.
     * Select the first outline level that repeats instead of letting one title
     * suppress every actual section beneath it. */
    const counts = new Map<number, number>();
    headings.forEach((heading) => counts.set(heading.level, (counts.get(heading.level) ?? 0) + 1));
    const sectionLevel = [...counts.keys()].sort((a, b) => a - b).find((level) => (counts.get(level) ?? 0) >= 2);

    if (sectionLevel != null) {
        const cuts = new Set(
            headings
                .filter((item) => item.level === sectionLevel && item.index > 0)
                .map((item) => item.index - 1),
        );
        if (cuts.size > 0) return cuts;
    }

    return paragraphFallbackCuts(blocks);
}

export function getChunkSections(blocks: Block[], cutIndices: Set<number>): ChunkSection[] {
    if (!blocks.length) return [];

    const sections: ChunkSection[] = [];
    let start = 0;
    blocks.forEach((block, index) => {
        if (cutIndices.has(index) && index < blocks.length - 1) {
            sections.push({ id: `${start}-${index}`, start, end: index, blocks: blocks.slice(start, index + 1) });
            start = index + 1;
        }
    });
    sections.push({ id: `${start}-${blocks.length - 1}`, start, end: blocks.length - 1, blocks: blocks.slice(start) });
    return sections;
}

const cloneColumns = (columns: ColumnData[] | undefined) => columns?.map((column) => ({
    ...column,
    content: cloneChunkBlocks(column.content),
}));

const cloneMetadata = (metadata: BlockMetadata | undefined): BlockMetadata | undefined => {
    if (!metadata) return undefined;
    return {
        ...metadata,
        blocks: Array.isArray(metadata.blocks) ? cloneChunkBlocks(metadata.blocks) : metadata.blocks,
        content: Array.isArray(metadata.content) ? cloneChunkBlocks(metadata.content) : metadata.content,
        items: Array.isArray(metadata.items) ? cloneChunkBlocks(metadata.items) : metadata.items,
        columns: cloneColumns(metadata.columns),
    };
};

/** Copies receive new IDs all the way down through nested editor structures.
 * Keeping an original block ID in two cards makes selection, editing, and
 * drag-and-drop ambiguous, so a shallow copy is not enough. */
export function cloneChunkBlocks(blocks: Block[]): Block[] {
    return blocks.map((block) => ({
        ...block,
        id: uuidv4(),
        metadata: cloneMetadata(block.metadata),
    }));
}

export function chunkLabel(blocks: Block[]): string {
    const firstText = blocks.find((block) => typeof block.content === 'string' && block.content.trim())?.content ?? '';
    const text = firstText.replace(/<[^>]+>/g, '').replace(/[*_`#]/g, '').trim();
    return text.slice(0, 48) || 'Untitled chunk';
}
