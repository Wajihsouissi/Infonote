import type { Block, BlockMetadata } from '../../features/editor/types';

/**
 * What a block says, and how much two blocks have in common.
 *
 * The auto mind map groups blocks by what they are about rather than by where
 * they sit, so everything above it rests on two questions answered here: what
 * kind of block is this, and what words does it actually carry. The similarity
 * measure is a plain bag-of-words cosine — no model, no network, no surprises —
 * which is what lets the map appear the instant a card is opened.
 */

// ---------------------------------------------------------------------------
// Block taxonomy
// ---------------------------------------------------------------------------

export const HEADING_LEVEL: Record<string, number> = {
    heading1: 1,
    heading2: 2,
    heading3: 3,
};

/** Visual / structural blocks that always become their own standalone node. */
const STANDALONE_TYPES = new Set(['media', 'image', 'video', 'file', 'gallery', 'code', 'table']);

/** List-family blocks that chain together into a single node (preserving order
 *  and native numbering — no destructive flattening). */
const LIST_TYPES = new Set([
    'bullet',
    'numbered',
    'todo',
    'bulletListItem',
    'numberedListItem',
    'checkListItem',
]);

export type Category = 'heading' | 'standalone' | 'list' | 'divider' | 'text';

/**
 * Empty editor placeholders and divider rules help people compose a card, but
 * they do not carry an idea of their own. Never turn either into a card on a
 * nested canvas. Rich blocks whose content lives in metadata are retained.
 */
export function isCanvasHydratableBlock(block: Block): boolean {
    if (block.type === 'divider') return false;

    const hasText = (value: unknown): boolean =>
        typeof value === 'string' && value.trim().replace(/[\n\u200B\u00A0\u200C\uFEFF]/g, '').length > 0;

    if (hasText(block.content)) return true;

    const metadata = block.metadata;
    if (!metadata) return false;

    const asBlocks = (value: unknown): Block[] => Array.isArray(value)
        ? value.filter((item): item is Block => Boolean(
            item &&
            typeof item === 'object' &&
            typeof (item as Block).id === 'string' &&
            typeof (item as Block).type === 'string' &&
            typeof (item as Block).content === 'string',
        ))
        : [];

    if (block.type === 'page' && typeof metadata.nodeId === 'string') return true;
    if (block.type === 'table' && metadata.rows?.some((row) => row.some(hasText))) return true;
    if (block.type === 'gallery' && asBlocks(metadata.items).some(isCanvasHydratableBlock)) return true;
    if (block.type === 'columns' && Array.isArray(metadata.columns)) {
        return metadata.columns.some((column) => {
            const legacyColumn = column as unknown as { content?: unknown; blocks?: unknown };
            const children = asBlocks(legacyColumn.content).length > 0
                ? asBlocks(legacyColumn.content)
                : asBlocks(legacyColumn.blocks);
            return children.some(isCanvasHydratableBlock);
        });
    }

    const nested = metadata.blocks ?? metadata.content;
    return asBlocks(nested).some(isCanvasHydratableBlock);
}

/** Minimal block shape the text/relatedness analysis needs. Canonical Blocks
 *  and legacy loose shapes (label-only stand-ins, retired list types) both fit. */
export type AnalyzableBlock = {
    id?: string;
    type: string;
    content?: unknown;
    metadata?: BlockMetadata;
};

export function categorize(block: AnalyzableBlock | null | undefined): Category {
    const type = block?.type;
    if (!type) return 'text';
    if (type in HEADING_LEVEL) return 'heading';
    if (STANDALONE_TYPES.has(type)) return 'standalone';
    if (LIST_TYPES.has(type)) return 'list';
    if (type === 'divider') return 'divider';
    return 'text';
}

// ---------------------------------------------------------------------------
// Text extraction + similarity
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her',
    'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man',
    'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let',
    'put', 'say', 'she', 'too', 'use', 'that', 'this', 'with', 'have', 'from',
    'they', 'will', 'would', 'there', 'their', 'what', 'about', 'which', 'when',
    'were', 'been', 'them', 'then', 'than', 'into', 'your', 'some', 'could',
    'should', 'also', 'just', 'only', 'over', 'such', 'most', 'more', 'very',
    'here', 'each', 'these', 'those', 'because', 'while', 'where', 'after',
    'before', 'between', 'both', 'being', 'does', 'doing', 'done', 'else',
    'ever', 'every', 'like', 'made', 'make', 'many', 'much', 'must', 'need',
    'other', 'same', 'still', 'take', 'upon', 'used', 'using', 'want', 'well',
]);

/** Pull a plain-text representation out of a block, regardless of whether its
 *  content is a string, an array of inline runs, or lives in metadata. */
export function extractText(block: AnalyzableBlock | null | undefined): string {
    if (!block) return '';
    const parts: string[] = [];

    const pushContent = (content: unknown) => {
        if (typeof content === 'string') {
            parts.push(content);
        } else if (Array.isArray(content)) {
            for (const item of content as Array<string | { text?: unknown; content?: unknown } | null | undefined>) {
                if (typeof item === 'string') parts.push(item);
                else if (item && typeof item.text === 'string') parts.push(item.text);
                else if (item && Array.isArray(item.content)) pushContent(item.content);
            }
        }
    };

    pushContent(block.content);

    const meta = block.metadata;
    if (meta && typeof meta === 'object') {
        // Captions / titles / names carry the semantics of media & links.
        for (const key of ['caption', 'title', 'name', 'alt', 'label', 'language']) {
            const value = meta[key];
            if (typeof value === 'string') parts.push(value);
        }
        // Tables: flatten cell text.
        if (Array.isArray(meta.rows)) {
            for (const row of meta.rows) {
                if (Array.isArray(row)) {
                    for (const cell of row) {
                        if (typeof cell === 'string') parts.push(cell);
                    }
                }
            }
        }
        // Columns: recurse into nested blocks (legacy saves used `blocks`, current uses `content`).
        if (Array.isArray(meta.columns)) {
            for (const col of meta.columns as Array<{ blocks?: unknown; content?: unknown } | AnalyzableBlock[] | null | undefined>) {
                const loose = col as { blocks?: unknown; content?: unknown } | null | undefined;
                const colBlocks: AnalyzableBlock[] = Array.isArray(loose?.blocks) ? loose.blocks
                    : Array.isArray(loose?.content) ? loose.content
                        : Array.isArray(col) ? col : [];
                for (const b of colBlocks) parts.push(extractText(b));
            }
        }
    }

    return parts.join(' ');
}

/** Lowercase, strip URLs/punctuation, drop stopwords/short/numeric tokens, and
 *  apply a naive plural strip so "budgets" ~ "budget". */
export function tokenize(text: string): string[] {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t))
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export type TermFreq = Map<string, number>;

export function termFreq(tokens: string[]): TermFreq {
    const tf: TermFreq = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return tf;
}

export function mergeTermFreq(into: TermFreq, tokens: string[]): void {
    for (const t of tokens) into.set(t, (into.get(t) || 0) + 1);
}

/** Cosine similarity between two term-frequency vectors. 0 = unrelated. */
export function cosine(a: TermFreq, b: TermFreq): number {
    if (a.size === 0 || b.size === 0) return 0;
    // Iterate the smaller map for the dot product.
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    let dot = 0;
    for (const [term, count] of small) {
        const other = large.get(term);
        if (other) dot += count * other;
    }
    if (dot === 0) return 0;
    let magA = 0;
    for (const v of a.values()) magA += v * v;
    let magB = 0;
    for (const v of b.values()) magB += v * v;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
