import type { Block } from '../editor/types';
import { parseAIContent } from '../editor/pasteUtils';
import { normalizeChunkBlocks } from '../card/chunkItUtils';

export type AIResultPart = {
    start: number;
    count: number;
    kind: 'line' | 'section';
    text: string;
};

/**
 * The Markdown parser deliberately gives pasted blocks fresh UUIDs. That is
 * correct for new canvas content, but an AI response is reparsed while it
 * streams: fresh ids there made a selected line or section lose its selection
 * on the next token. Derive identities from the response turn and the block's
 * exact rendered shape instead. The occurrence keeps repeated list items
 * distinct without making ids depend on an unstable parser UUID.
 */
function hash(value: string): string {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
}

function stableMetadata(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableMetadata).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${key}:${stableMetadata(item)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value) ?? '';
}

export function stabilizeAIBlockIds(blocks: Block[], responseId: string): Block[] {
    const occurrences = new Map<string, number>();
    return blocks.map((block) => {
        const signature = `${block.type}|${block.indent ?? 0}|${block.content}|${stableMetadata(block.metadata)}`;
        const occurrence = occurrences.get(signature) ?? 0;
        occurrences.set(signature, occurrence + 1);
        return { ...block, id: `ai-${hash(`${responseId}|${signature}|${occurrence}`)}` };
    });
}

/**
 * Put back the spaces a model drops around emphasis.
 *
 * Models fairly often emit `It meant**enough**to her` — the markers glued to
 * the neighbouring words. Our renderer is faithful to that and produces
 * `It meant<strong>enough</strong>to her`, which reads as "It meantenoughto
 * her". A whole generated table came back looking like that.
 *
 * CommonMark would not treat those as emphasis at all (the delimiters fail its
 * flanking rules), so padding them is the more correct reading of the text as
 * well as the legible one. Applied ONLY to AI output — text the user typed
 * themselves is left exactly as written.
 *
 * The scan is span-based rather than two lookaround replaces, because a regex
 * cannot tell an opening delimiter from a closing one: `a**b**c` would have
 * both sides padded and come out as `a **b **c`.
 */
export function normalizeAIText(text: string): string {
    if (!text || !text.includes('*')) return text;

    // A balanced run with no whitespace just inside the markers.
    const emphasis = /(\*\*|\*)(?!\s)([^*\n]+?)(?<!\s)\1/g;
    // A word or closing punctuation before means the opener is glued on.
    const gluedBefore = /[\w.,;:!?)\]]/;
    // A word or opening bracket after means the closer is glued on.
    const gluedAfter = /[\w([]/;

    let out = '';
    let cursor = 0;
    for (const match of text.matchAll(emphasis)) {
        const [whole, marker, inner] = match;
        const start = match.index ?? 0;
        const end = start + whole.length;
        out += text.slice(cursor, start);

        /* A single `*` is ambiguous — `2*3 and 4*5` is multiplication, and
           padding it to `2 *3 and 4* 5` would be worse than leaving it alone.
           Requiring a letter at both inner edges keeps real italics ("*for*")
           and skips arithmetic, globs and footnote markers. `**` is almost
           never accidental, so it needs no such guard. */
        const ambiguous = marker === '*' && !(/^[A-Za-z]/.test(inner) && /[A-Za-z]$/.test(inner));

        if (!ambiguous && start > 0 && gluedBefore.test(text[start - 1])) out += ' ';
        out += whole;
        if (!ambiguous && end < text.length && gluedAfter.test(text[end])) out += ' ';
        cursor = end;
    }
    return out + text.slice(cursor);
}

/**
 * ONE parse of a response, shared by the renderer and by every part action.
 *
 * `AIResultPart` addresses a line or a section by index, so the array the
 * indices were measured against and the array they are spliced into have to be
 * produced the same way. The panel used to splice into a plain
 * `parseAIContent(message.text)` while the renderer numbered a normalized,
 * emphasis-repaired array — any disagreement between the two pipelines lands
 * the edit on a neighbouring line instead of the one whose button was pressed.
 */
export function getAIResultBlocks(text: string): Block[] {
    return normalizeChunkBlocks(parseAIContent(normalizeAIText(text)));
}

const isBlankBlock = (block: Block) =>
    block.type === 'text' && block.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length === 0;

/** Structural blocks carry their shape in metadata, not in their content. */
const isShapedBlock = (block: Block) => block.type === 'table' || block.type === 'code';

/**
 * Hold a regenerated fragment to the shape of the fragment it replaces.
 *
 * The prompt already asks for this, but a model that ignores it must not be
 * able to turn a one-line Redo into a five-block document silently spliced
 * into the middle of an answer. Two guards:
 *
 * - a stray ``` wrapper around the whole reply is unwrapped and reparsed,
 *   unless the original really was a code block;
 * - a `line` collapses to exactly one block, and keeps the original block's
 *   type, indent and metadata so a bullet cannot come back as a heading and a
 *   task cannot lose its checkbox. Only the wording is taken from the model.
 */
export function constrainReplacementBlocks(
    replacement: Block[],
    original: Block[],
    kind: AIResultPart['kind'],
): Block[] {
    let blocks = replacement;

    if (
        blocks.length === 1 && blocks[0].type === 'code'
        && !original.some((block) => block.type === 'code')
    ) {
        blocks = getAIResultBlocks(blocks[0].content);
    }

    // Trim the blank lines a model leaves around its reply; they would show up
    // as empty rows wedged into the answer.
    let first = 0;
    let last = blocks.length - 1;
    while (first <= last && isBlankBlock(blocks[first])) first += 1;
    while (last >= first && isBlankBlock(blocks[last])) last -= 1;
    blocks = blocks.slice(first, last + 1);
    if (blocks.length === 0) return [];

    if (kind !== 'line') return blocks;

    const target = original[0];
    /* A model that ignored the shape rule almost always leads with a lead-in
       ("Here is a better version:") and puts the actual rewrite after it. When
       one of the blocks it returned carries the fragment's own type, that block
       is the rewrite — everything else it volunteered is dropped. */
    const source = blocks.find((block) => block.type === target?.type) ?? blocks[0];
    if (!target || isShapedBlock(target) || isShapedBlock(source)) return [source];
    return [{ ...target, content: source.content }];
}

/** Keep response edits in the editor's native Markdown dialect. */
export function serializeAIBlocks(blocks: Block[]): string {
    let ordinal = 0;
    return blocks.map((block) => {
        const indent = '  '.repeat(block.indent || 0);
        if (block.type !== 'numbered') ordinal = 0;

        switch (block.type) {
            case 'heading1': return `${indent}# ${block.content}`;
            case 'heading2': return `${indent}## ${block.content}`;
            case 'heading3': return `${indent}### ${block.content}`;
            case 'bullet': return `${indent}- ${block.content}`;
            case 'numbered': {
                ordinal = typeof block.metadata?.listNumber === 'number' ? block.metadata.listNumber : ordinal + 1;
                return `${indent}${ordinal}. ${block.content}`;
            }
            case 'todo': return `${indent}- [${block.metadata?.checked ? 'x' : ' '}] ${block.content}`;
            case 'toggle': return `${indent}>> ${block.content}`;
            case 'quote': return `${indent}> ${block.content}`;
            case 'callout': return `${indent}> ${block.content}`;
            case 'divider': return `${indent}---`;
            case 'code': return `${indent}\`\`\`\n${block.content}\n${indent}\`\`\``;
            case 'table': {
                const rows = Array.isArray(block.metadata?.rows) ? block.metadata.rows as string[][] : [];
                if (rows.length === 0) return '';
                const header = `| ${rows[0].join(' | ')} |`;
                const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
                return [header, separator, ...rows.slice(1).map((row) => `| ${row.join(' | ')} |`)].join('\n');
            }
            default: return `${indent}${block.content}`;
        }
    }).join('\n');
}
