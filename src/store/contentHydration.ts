import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockMetadata } from '../features/editor/types';

/**
 * contentHydration
 * --------------------------------------------------------------------------
 * Relatedness-driven planner that turns a flat list of editor blocks (the
 * content of a card) into a semantic graph of canvas nodes for the nested
 * canvas.
 *
 * Unlike the previous heading/divider-only splitter, grouping here is driven
 * by *content relatedness*: blocks that talk about the same thing stay in the
 * same node, topic shifts start a new node, and topically-similar nodes are
 * linked with "related" edges. It is fully deterministic (no async/AI) so it
 * runs instantly on navigation and behaves predictably for ANY content shape:
 * pure prose with no headings, all-headings outlines, list dumps, media walls,
 * or arbitrary mixes.
 */

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Keep accumulating into a text node until it reaches this many chars, even
 *  if the next block looks unrelated. Prevents over-fragmentation of short
 *  snippets while still splitting long, topic-shifting prose. */
const MIN_CHUNK_CHARS = 160;

/** Cosine similarity at/above which a text block joins the current node. */
const JOIN_THRESHOLD = 0.1;

/** Two groups may be connected only when their content similarity is at/above
 *  this value — i.e. they are genuinely related, not merely adjacent. The
 *  spanning forest then keeps only the strongest such links. */
const RELATE_EDGE_THRESHOLD = 0.24;

// ---------------------------------------------------------------------------
// Block taxonomy
// ---------------------------------------------------------------------------

const HEADING_LEVEL: Record<string, number> = {
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

type Category = 'heading' | 'standalone' | 'list' | 'divider' | 'text';

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

function categorize(block: AnalyzableBlock | null | undefined): Category {
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

type TermFreq = Map<string, number>;

function termFreq(tokens: string[]): TermFreq {
    const tf: TermFreq = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return tf;
}

function mergeTermFreq(into: TermFreq, tokens: string[]): void {
    for (const t of tokens) into.set(t, (into.get(t) || 0) + 1);
}

/** Cosine similarity between two term-frequency vectors. 0 = unrelated. */
function cosine(a: TermFreq, b: TermFreq): number {
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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HydrationChunk {
    id: string;
    type: 'fused-note' | 'block';
    blocks: Block[];
    level: number;
    /** Parent in the layout/hierarchy tree (a solid edge is drawn for this). */
    sourceId?: string;
    style?: { width: number; height: number };
}

export interface RelatedEdge {
    source: string;
    target: string;
    score: number;
}

export interface HydrationPlan {
    chunks: HydrationChunk[];
    relatedEdges: RelatedEdge[];
}

interface WorkChunk extends HydrationChunk {
    kind: Category;
    tf: TermFreq;
    chars: number;
    /** True when the chunk was created with no active heading section. */
    floating: boolean;
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/**
 * Build a semantic hydration plan from an ordered list of (orphan) blocks.
 * Returns the chunks (canvas nodes) plus cross-topic related edges.
 */
export function planHydration(orderedBlocks: Block[]): HydrationPlan {
    const chunks: WorkChunk[] = [];
    const headingStack: WorkChunk[] = [];
    let current: WorkChunk | null = null;

    const newChunk = (kind: Category, block: Block | null): WorkChunk => {
        const tf: TermFreq = new Map();
        let chars = 0;
        if (block) {
            const text = extractText(block);
            mergeTermFreq(tf, tokenize(text));
            chars += text.length;
        }
        const chunk: WorkChunk = {
            id: uuidv4(),
            type: kind === 'standalone' ? 'block' : 'fused-note',
            blocks: block ? [block] : [],
            level: 0,
            kind,
            tf,
            chars,
            floating: headingStack.length === 0,
            sourceId: headingStack.length > 0 ? headingStack[headingStack.length - 1].id : undefined,
        };
        chunks.push(chunk);
        return chunk;
    };

    const appendBlock = (chunk: WorkChunk, block: Block): void => {
        chunk.blocks.push(block);
        const text = extractText(block);
        mergeTermFreq(chunk.tf, tokenize(text));
        chunk.chars += text.length;
    };

    for (const block of orderedBlocks) {
        if (!isCanvasHydratableBlock(block)) {
            // Treat invisible composition scaffolding as a boundary so text on
            // either side never gets fused merely because the separator is hidden.
            current = null;
            continue;
        }

        const cat = categorize(block);

        if (cat === 'divider') {
            // Dividers create no node — they are a soft topic boundary.
            current = null;
            continue;
        }

        if (cat === 'heading') {
            const level = HEADING_LEVEL[block.type];
            // Pop the stack to the nearest strictly-shallower heading.
            while (
                headingStack.length > 0 &&
                headingStack[headingStack.length - 1].level >= level
            ) {
                headingStack.pop();
            }
            const chunk = newChunk('heading', block);
            chunk.level = level;
            headingStack.push(chunk);
            // Body text following the heading accumulates into the section node.
            current = chunk;
            continue;
        }

        if (cat === 'standalone') {
            // Visual/structural blocks never merge; they break the text flow.
            newChunk('standalone', block);
            current = null;
            continue;
        }

        if (cat === 'list') {
            if (current && current.kind === 'list') {
                appendBlock(current, block);
            } else {
                current = newChunk('list', block);
            }
            continue;
        }

        // cat === 'text'
        if (current && (current.kind === 'text' || current.kind === 'heading')) {
            const blockTf = termFreq(tokenize(extractText(block)));
            const sim = cosine(blockTf, current.tf);
            const stillSmall = current.chars < MIN_CHUNK_CHARS;
            if (sim >= JOIN_THRESHOLD || stillSmall) {
                appendBlock(current, block);
                continue;
            }
            // Topic shift on an already-substantial node → start a new one.
            current = newChunk('text', block);
        } else {
            current = newChunk('text', block);
        }
    }

    if (chunks.length === 0) {
        return { chunks: [], relatedEdges: [] };
    }

    // --- Normalize single-block fused-notes to plain block nodes -------------
    for (const chunk of chunks) {
        if (chunk.type === 'fused-note' && chunk.blocks.length === 1) {
            chunk.type = 'block';
        }
    }

    // --- Main parts & sub-parts -----------------------------------------------
    // Headings are the logical signal for "main parts". The shallowest heading
    // level that actually divides the document (>= 2 occurrences) becomes the
    // "main" level; those headings are promoted to roots so the main parts sit
    // side-by-side and are NEVER linked to each other. Everything else stays
    // nested beneath its own section (set during the walk).
    const headingChunks = chunks.filter((c) => c.kind === 'heading');
    if (headingChunks.length > 0) {
        const counts: Record<number, number> = {};
        headingChunks.forEach((c) => {
            counts[c.level] = (counts[c.level] || 0) + 1;
        });
        let mainLevel = 0;
        for (const lvl of [1, 2, 3]) {
            if ((counts[lvl] || 0) >= 2) {
                mainLevel = lvl;
                break;
            }
        }
        if (mainLevel === 0) {
            for (const lvl of [1, 2, 3]) {
                if (counts[lvl]) {
                    mainLevel = lvl;
                    break;
                }
            }
        }
        chunks.forEach((c) => {
            if (c.kind === 'heading' && c.level > 0 && c.level <= mainLevel) {
                c.sourceId = undefined; // promote to a main part (root)
            }
        });
    }

    // Floating, heading-less chunks (e.g. a document with no headings, or loose
    // intro content) are grouped into main parts purely by content relatedness:
    // each relatedness cluster becomes a main with its related items nested under.
    const floating = chunks.filter((c) => !c.sourceId && c.kind !== 'heading');
    if (floating.length > 1) {
        const forest = buildRelatednessForest(
            floating.map((c) => ({ id: c.id, tf: c.tf, level: c.level }))
        );
        const byId = new Map(chunks.map((c) => [c.id, c]));
        forest.parent.forEach((parentId, id) => {
            const chunk = byId.get(id);
            if (chunk) chunk.sourceId = parentId;
        });
    }

    // Edges to draw = the main→sub hierarchy. Main parts have no parent, so they
    // are never linked to each other; only their sub-parts hang off them.
    const hierarchyEdges: RelatedEdge[] = chunks
        .filter((c) => c.sourceId)
        .map((c) => ({ source: c.sourceId as string, target: c.id, score: 1 }));

    const plan: HydrationPlan = {
        chunks: chunks.map(({ id, type, blocks, level, sourceId }) => ({
            id,
            type,
            blocks,
            level,
            sourceId,
        })),
        relatedEdges: hierarchyEdges,
    };
    return plan;
}

interface ScoredItem {
    id: string;
    tf: TermFreq;
    level: number;
}

export interface RelatednessForest {
    /** Tree edges (the strongest links keeping each cluster connected). */
    edges: RelatedEdge[];
    /** parent[id] = the node it hangs off in the layout tree (undefined = root). */
    parent: Map<string, string | undefined>;
}

/**
 * Build a maximum spanning forest over the relatedness graph: only pairs scoring
 * at/above the threshold are eligible, and Kruskal keeps the strongest edges that
 * connect distinct clusters (no cycles). Each resulting tree is rooted at its
 * most structural node (a heading, else its most-connected node) so the layout
 * reads top-down.
 */
function buildRelatednessForest(items: ScoredItem[]): RelatednessForest {
    const parent = new Map<string, string | undefined>();
    items.forEach((it) => parent.set(it.id, undefined));

    if (items.length <= 1) {
        return { edges: [], parent };
    }

    // Candidate edges above threshold.
    const candidates: RelatedEdge[] = [];
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            const score = cosine(items[i].tf, items[j].tf);
            if (score >= RELATE_EDGE_THRESHOLD) {
                candidates.push({ source: items[i].id, target: items[j].id, score });
            }
        }
    }
    candidates.sort((a, b) => b.score - a.score);

    // Kruskal (max spanning forest).
    const uf = new Map<string, string>();
    items.forEach((it) => uf.set(it.id, it.id));
    const find = (x: string): string => {
        let r = x;
        while (uf.get(r) !== r) r = uf.get(r)!;
        let cur = x;
        while (uf.get(cur) !== r) {
            const next = uf.get(cur)!;
            uf.set(cur, r);
            cur = next;
        }
        return r;
    };

    const treeEdges: RelatedEdge[] = [];
    const adj = new Map<string, string[]>();
    items.forEach((it) => adj.set(it.id, []));
    for (const e of candidates) {
        const ra = find(e.source);
        const rb = find(e.target);
        if (ra === rb) continue;
        uf.set(ra, rb);
        treeEdges.push(e);
        adj.get(e.source)!.push(e.target);
        adj.get(e.target)!.push(e.source);
    }

    // Root each connected component and assign parent pointers (BFS).
    const levelById = new Map(items.map((it) => [it.id, it.level]));
    const componentMembers = new Map<string, string[]>();
    items.forEach((it) => {
        const root = find(it.id);
        if (!componentMembers.has(root)) componentMembers.set(root, []);
        componentMembers.get(root)!.push(it.id);
    });

    for (const members of componentMembers.values()) {
        // Pick a root: prefer a heading (lowest non-zero level), else the most
        // connected node, else the first member (document order).
        let rootId = members[0];
        let bestKey = -Infinity;
        for (const id of members) {
            const lvl = levelById.get(id) || 0;
            const degree = adj.get(id)!.length;
            // Headings win big; among equals, higher degree wins.
            const key = (lvl > 0 ? 1000 - lvl * 100 : 0) + degree;
            if (key > bestKey) {
                bestKey = key;
                rootId = id;
            }
        }

        const queue: string[] = [rootId];
        const visited = new Set<string>([rootId]);
        parent.set(rootId, undefined);
        while (queue.length > 0) {
            const cur = queue.shift()!;
            for (const next of adj.get(cur)!) {
                if (visited.has(next)) continue;
                visited.add(next);
                parent.set(next, cur);
                queue.push(next);
            }
        }
    }

    return { edges: treeEdges, parent };
}

/**
 * Group arbitrary canvas nodes by the words in their content without imposing
 * document-heading semantics. Unlike `computeSmartHierarchy`, an isolated
 * heading does not pull unrelated cards into its group, which makes this the
 * safer primitive for organizing a mixed canvas.
 */
export function computeRelatednessHierarchy(
    items: { id: string; blocks: AnalyzableBlock[] }[]
): RelatednessForest {
    return buildRelatednessForest(items.map((item) => ({
        id: item.id,
        tf: chunkTermFreq(item.blocks),
        level: nodeHeadingLevel(item.blocks),
    })));
}

/** Term-frequency vector for a chunk built from all of its blocks' text. */
function chunkTermFreq(blocks: AnalyzableBlock[]): TermFreq {
    const tf: TermFreq = new Map();
    for (const block of blocks) mergeTermFreq(tf, tokenize(extractText(block)));
    return tf;
}

/** Heading level of a node based on its first block (0 = not a heading). */
function nodeHeadingLevel(blocks: AnalyzableBlock[]): number {
    const first = blocks?.[0];
    return first && first.type in HEADING_LEVEL ? HEADING_LEVEL[first.type] : 0;
}

/**
 * Build a "main parts + sub-parts" hierarchy for an arbitrary set of nodes (used
 * by the Smart re-tidy action). Heading nodes define the main parts (the
 * shallowest dividing level); every other node hangs off the main part it is
 * most related to. Main parts are never linked to each other. When there are no
 * headings at all, this falls back to relatedness clustering.
 */
export function computeSmartHierarchy(
    items: { id: string; blocks: AnalyzableBlock[] }[]
): RelatednessForest {
    const parent = new Map<string, string | undefined>();
    items.forEach((it) => parent.set(it.id, undefined));
    if (items.length <= 1) return { edges: [], parent };

    const tfById = new Map(items.map((it) => [it.id, chunkTermFreq(it.blocks)]));
    const levelById = new Map(items.map((it) => [it.id, nodeHeadingLevel(it.blocks)]));
    const headingItems = items.filter((it) => (levelById.get(it.id) || 0) > 0);

    // No headings → fall back to relatedness clustering.
    if (headingItems.length === 0) {
        return buildRelatednessForest(
            items.map((it) => ({ id: it.id, tf: tfById.get(it.id)!, level: 0 }))
        );
    }

    const counts: Record<number, number> = {};
    headingItems.forEach((it) => {
        const l = levelById.get(it.id)!;
        counts[l] = (counts[l] || 0) + 1;
    });
    let mainLevel = 0;
    for (const l of [1, 2, 3]) {
        if ((counts[l] || 0) >= 2) {
            mainLevel = l;
            break;
        }
    }
    if (mainLevel === 0) {
        for (const l of [1, 2, 3]) {
            if (counts[l]) {
                mainLevel = l;
                break;
            }
        }
    }

    const mains = items.filter((it) => {
        const l = levelById.get(it.id) || 0;
        return l > 0 && l <= mainLevel;
    });
    const mainSet = new Set(mains.map((m) => m.id));

    const edges: RelatedEdge[] = [];
    for (const it of items) {
        if (mainSet.has(it.id)) {
            parent.set(it.id, undefined);
            continue;
        }
        // Attach to the most-related main part.
        let bestId: string | undefined;
        let best = -1;
        for (const m of mains) {
            const s = cosine(tfById.get(it.id)!, tfById.get(m.id)!);
            if (s > best) {
                best = s;
                bestId = m.id;
            }
        }
        parent.set(it.id, bestId);
        if (bestId) edges.push({ source: bestId, target: it.id, score: Math.max(best, 0) });
    }

    return { edges, parent };
}

// ---------------------------------------------------------------------------
// Layout — cluster-aware compact packing
// ---------------------------------------------------------------------------

export interface ChunkSize {
    width: number;
    height: number;
}

export interface LayoutInput {
    id: string;
    type: 'fused-note' | 'block';
    /** Optional hierarchy parent (heading section → child). */
    sourceId?: string;
}

export interface LayoutOptions {
    originX: number;
    originY: number;
    gridStep: number;
}

/**
 * Position nodes so that RELATED groups sit physically together and connectors
 * stay short and local. Nodes are unioned into clusters via (hierarchy links ∪
 * related edges); each cluster is laid out as a tidy block (sections fan their
 * children below them, free nodes flow in a wrapped grid), and clusters are
 * packed into a wrapping grid with clear gaps between them.
 */
export function layoutChunks<T extends LayoutInput>(
    nodes: T[],
    relatedEdges: RelatedEdge[],
    sizeOf: (node: T) => ChunkSize,
    opts: LayoutOptions
): Map<string, { x: number; y: number }> {
    const { originX, originY, gridStep } = opts;
    const snap = (v: number) => Math.round(v / gridStep) * gridStep;

    const COL_GAP = gridStep * 3; // horizontal gap between sibling nodes
    const ROW_GAP = gridStep * 2; // vertical gap (parent→children, stacked rows)
    const CLUSTER_GAP = gridStep * 5; // gap between separate clusters
    const CLUSTER_MAX_WIDTH = 900; // wrap roots within a cluster past this width
    const GRID_MAX_WIDTH = 1700; // wrap clusters past this total width
    const MAX_ITEMS_PER_ROW = 3;

    const positions = new Map<string, { x: number; y: number }>();
    if (nodes.length === 0) return positions;

    const byId = new Map<string, T>(nodes.map((n) => [n.id, n]));

    // Hierarchy tree (children + roots).
    const childMap = new Map<string, T[]>();
    nodes.forEach((n) => childMap.set(n.id, []));
    const roots: T[] = [];
    nodes.forEach((n) => {
        if (n.sourceId && childMap.has(n.sourceId)) childMap.get(n.sourceId)!.push(n);
        else roots.push(n);
    });

    // Union-find over (hierarchy links ∪ related edges) → clusters.
    const parent = new Map<string, string>();
    nodes.forEach((n) => parent.set(n.id, n.id));
    const find = (x: string): string => {
        let r = x;
        while (parent.get(r) !== r) r = parent.get(r)!;
        let cur = x;
        while (parent.get(cur) !== r) {
            const next = parent.get(cur)!;
            parent.set(cur, r);
            cur = next;
        }
        return r;
    };
    const union = (a: string, b: string) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };
    nodes.forEach((n) => {
        if (n.sourceId && byId.has(n.sourceId)) union(n.id, n.sourceId);
    });
    relatedEdges.forEach((e) => {
        if (byId.has(e.source) && byId.has(e.target)) union(e.source, e.target);
    });

    // Group roots by cluster, preserving document order.
    const clusterRoots = new Map<string, T[]>();
    roots.forEach((r) => {
        const key = find(r.id);
        if (!clusterRoots.has(key)) clusterRoots.set(key, []);
        clusterRoots.get(key)!.push(r);
    });

    // Relative positions filled by the subtree layout.
    const rel = new Map<string, { x: number; y: number }>();
    const sizeById = (id: string) => sizeOf(byId.get(id)!);

    const layoutSubtree = (id: string, x: number, y: number): { w: number; h: number } => {
        const { width: w, height: h } = sizeById(id);
        const kids = childMap.get(id) || [];
        if (kids.length === 0) {
            rel.set(id, { x, y });
            return { w: w + COL_GAP, h: h + ROW_GAP };
        }
        let childY = y + h + ROW_GAP;
        let maxRowW = 0;
        let row: T[] = [];
        const rows: T[][] = [];
        kids.forEach((k) => {
            if (row.length >= MAX_ITEMS_PER_ROW) {
                rows.push(row);
                row = [];
            }
            row.push(k);
        });
        if (row.length) rows.push(row);
        rows.forEach((r) => {
            let childX = x;
            let rowW = 0;
            let rowH = 0;
            r.forEach((k) => {
                const d = layoutSubtree(k.id, childX, childY);
                childX += d.w;
                rowW += d.w;
                if (d.h > rowH) rowH = d.h;
            });
            childY += rowH;
            if (rowW > maxRowW) maxRowW = rowW;
        });
        const totalW = maxRowW > 0 ? maxRowW - COL_GAP : 0;
        rel.set(id, { x: x + totalW / 2 - w / 2, y });
        return { w: Math.max(w + COL_GAP, maxRowW), h: childY - y };
    };

    interface ClusterBox {
        ids: string[];
        w: number;
        h: number;
        minX: number;
        minY: number;
    }
    const clusters: ClusterBox[] = [];

    for (const [key, rs] of clusterRoots) {
        const memberIds = nodes.filter((n) => find(n.id) === key).map((n) => n.id);

        // Flow the cluster's roots in a wrapped grid (keeps clusters compact and
        // roughly square instead of one tall column).
        let cx = 0;
        let cy = 0;
        let rowH = 0;
        rs.forEach((root) => {
            let d = layoutSubtree(root.id, cx, cy);
            if (cx > 0 && cx + d.w > CLUSTER_MAX_WIDTH) {
                cx = 0;
                cy += rowH + ROW_GAP;
                rowH = 0;
                d = layoutSubtree(root.id, cx, cy);
            }
            cx += d.w;
            if (d.h > rowH) rowH = d.h;
        });

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        memberIds.forEach((id) => {
            const p = rel.get(id);
            if (!p) return;
            const s = sizeById(id);
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + s.width);
            maxY = Math.max(maxY, p.y + s.height);
        });
        if (!isFinite(minX)) continue;
        clusters.push({ ids: memberIds, w: maxX - minX, h: maxY - minY, minX, minY });
    }

    // Pack clusters into a wrapping grid.
    let curX = originX;
    let curY = originY;
    let rowH = 0;
    for (const cb of clusters) {
        if (curX > originX && curX + cb.w > originX + GRID_MAX_WIDTH) {
            curX = originX;
            curY += rowH + CLUSTER_GAP;
            rowH = 0;
        }
        const dx = curX - cb.minX;
        const dy = curY - cb.minY;
        cb.ids.forEach((id) => {
            const p = rel.get(id);
            if (!p) return;
            positions.set(id, { x: snap(p.x + dx), y: snap(p.y + dy) });
        });
        curX += cb.w + CLUSTER_GAP;
        if (cb.h > rowH) rowH = cb.h;
    }

    return positions;
}

export interface DocumentTreeLayout {
    /** Positions for every content-bearing chapter and section. */
    positions: Map<string, { x: number; y: number }>;
    /** Top-level chapters, in document order. */
    rootIds: string[];
}

/**
 * Lay a note out as a document tree. Main sections form the first row and
 * every subsection grows beneath its parent, mirroring the source note rather
 * than inventing a central title card. Each subtree reserves its full bounds
 * before placement, so cards of very different sizes never overlap.
 */
export function layoutDocumentTree<T extends LayoutInput>(
    nodes: T[],
    sizeOf: (node: T) => ChunkSize,
    opts: { gridStep: number; maxRootRowWidth?: number },
): DocumentTreeLayout {
    const positions = new Map<string, { x: number; y: number }>();
    if (nodes.length === 0) return { positions, rootIds: [] };

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const childrenById = new Map<string, T[]>();
    nodes.forEach((node) => childrenById.set(node.id, []));
    const roots: T[] = [];
    nodes.forEach((node) => {
        if (node.sourceId && childrenById.has(node.sourceId)) {
            childrenById.get(node.sourceId)!.push(node);
        } else {
            roots.push(node);
        }
    });

    const snap = (value: number) => Math.round(value / opts.gridStep) * opts.gridStep;
    const siblingGap = opts.gridStep * 1.5;
    // A full two-grid-unit gutter keeps the branches readable at a glance and
    // gives connector lines room to leave and enter their cards cleanly.
    const levelGap = opts.gridStep * 2;
    const rootGap = opts.gridStep * 3;
    // Keep sibling chapters on one aligned top row when a desktop viewport can
    // comfortably show them together. A narrower caller can opt into a tighter
    // cap and let wider trees wrap to a separate row.
    const maxRootRowWidth = opts.maxRootRowWidth ?? opts.gridStep * 44;

    interface TreeBox {
        width: number;
        height: number;
        /** Positions are relative to the top-left of this tree's reserved box. */
        local: Map<string, { x: number; y: number }>;
    }

    const buildTree = (id: string, ancestry = new Set<string>()): TreeBox => {
        const node = byId.get(id);
        if (!node) return { width: 0, height: 0, local: new Map() };
        const size = sizeOf(node);
        if (ancestry.has(id)) {
            return { width: size.width, height: size.height, local: new Map([[id, { x: 0, y: 0 }]]) };
        }

        const nextAncestry = new Set(ancestry);
        nextAncestry.add(id);
        const children = (childrenById.get(id) ?? [])
            .map((child) => buildTree(child.id, nextAncestry))
            .filter((box) => box.width > 0 && box.height > 0);

        if (children.length === 0) {
            return { width: size.width, height: size.height, local: new Map([[id, { x: 0, y: 0 }]]) };
        }

        const childrenWidth = children.reduce((total, box) => total + box.width, 0)
            + siblingGap * (children.length - 1);
        const width = Math.max(size.width, childrenWidth);
        const tallestChild = Math.max(...children.map((box) => box.height));
        const local = new Map<string, { x: number; y: number }>();
        local.set(id, { x: (width - size.width) / 2, y: 0 });

        let childX = (width - childrenWidth) / 2;
        children.forEach((box) => {
            box.local.forEach((position, childId) => {
                local.set(childId, {
                    x: childX + position.x,
                    y: size.height + levelGap + position.y,
                });
            });
            childX += box.width + siblingGap;
        });

        return {
            width,
            height: size.height + levelGap + tallestChild,
            local,
        };
    };

    const boxes = roots.map((root) => ({ root, box: buildTree(root.id) }));
    const rows: Array<typeof boxes> = [];
    let row: typeof boxes = [];
    let rowWidth = 0;
    boxes.forEach((entry) => {
        const nextWidth = row.length === 0 ? entry.box.width : rowWidth + rootGap + entry.box.width;
        if (row.length > 0 && nextWidth > maxRootRowWidth) {
            rows.push(row);
            row = [];
            rowWidth = 0;
        }
        rowWidth = row.length === 0 ? entry.box.width : rowWidth + rootGap + entry.box.width;
        row.push(entry);
    });
    if (row.length > 0) rows.push(row);

    let rowY = 0;
    rows.forEach((entries) => {
        const width = entries.reduce((total, entry) => total + entry.box.width, 0)
            + rootGap * (entries.length - 1);
        const height = Math.max(...entries.map((entry) => entry.box.height));
        let rowX = -width / 2;
        entries.forEach(({ box }) => {
            box.local.forEach((position, id) => {
                positions.set(id, { x: snap(rowX + position.x), y: snap(rowY + position.y) });
            });
            rowX += box.width + rootGap;
        });
        rowY += height + rootGap;
    });

    return { positions, rootIds: roots.map((root) => root.id) };
}

/** Minimal input required by the canvas-wide bento organizer. */
export interface BentoLayoutInput {
    id: string;
}

/**
 * Lay out a mixed canvas as one broad bento composition.
 *
 * - Explicit connector components are treated as mind maps and retain a clear
 *   left-to-right root → branch reading direction.
 * - Unconnected nodes are clustered by semantic relatedness and tiled in
 *   compact, mostly-horizontal grids.
 * - The resulting component boxes are packed into several columns rather than
 *   a tall vertical list.
 *
 * This function only calculates positions; it never creates or rewrites edges.
 */
export function layoutCanvasBento<T extends BentoLayoutInput>(
    nodes: T[],
    semanticEdges: RelatedEdge[],
    connectorEdges: RelatedEdge[],
    sizeOf: (node: T) => ChunkSize,
    opts: LayoutOptions,
): Map<string, { x: number; y: number }> {
    const { originX, originY, gridStep } = opts;
    const snap = (value: number) => Math.round(value / gridStep) * gridStep;
    // Card positions still snap to the 56px canvas grid, but using that entire
    // unit as whitespace makes a bento feel scattered. A compact sub-grid keeps
    // tiles and mind-map levels visually joined; separate groups get twice it.
    const DENSE_GAP = Math.max(16, Math.round(gridStep / 4));
    const INNER_GAP = DENSE_GAP;
    const BRANCH_GAP = DENSE_GAP;
    const GROUP_GAP = DENSE_GAP * 2;
    const positions = new Map<string, { x: number; y: number }>();
    if (nodes.length === 0) return positions;

    const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    const byId = new Map(ordered.map((node) => [node.id, node]));
    const validConnectorEdges = connectorEdges.filter((edge) =>
        edge.source !== edge.target && byId.has(edge.source) && byId.has(edge.target)
    );

    const createUnionFind = (ids: string[]) => {
        const parent = new Map(ids.map((id) => [id, id]));
        const find = (id: string): string => {
            let root = id;
            while (parent.get(root) !== root) root = parent.get(root)!;
            let current = id;
            while (parent.get(current) !== root) {
                const next = parent.get(current)!;
                parent.set(current, root);
                current = next;
            }
            return root;
        };
        const union = (a: string, b: string) => {
            const rootA = find(a);
            const rootB = find(b);
            if (rootA !== rootB) parent.set(rootA, rootB);
        };
        return { find, union };
    };

    // First reserve every real connected component as a mind map. Semantic
    // similarity can influence the remaining cards but must not blur a graph's
    // intentional topology.
    const connectorUnion = createUnionFind(ordered.map((node) => node.id));
    validConnectorEdges.forEach((edge) => connectorUnion.union(edge.source, edge.target));
    const connectorMembers = new Map<string, string[]>();
    ordered.forEach((node) => {
        const root = connectorUnion.find(node.id);
        const members = connectorMembers.get(root) ?? [];
        members.push(node.id);
        connectorMembers.set(root, members);
    });
    const mindMapComponents = [...connectorMembers.values()]
        .filter((members) => members.length > 1)
        .sort((a, b) => a[0].localeCompare(b[0]));
    const mindMapNodeIds = new Set(mindMapComponents.flat());

    // Related but unconnected cards form the other bento regions.
    const looseIds = ordered.filter((node) => !mindMapNodeIds.has(node.id)).map((node) => node.id);
    const looseIdSet = new Set(looseIds);
    const semanticUnion = createUnionFind(looseIds);
    semanticEdges.forEach((edge) => {
        if (looseIdSet.has(edge.source) && looseIdSet.has(edge.target)) {
            semanticUnion.union(edge.source, edge.target);
        }
    });
    const semanticMembers = new Map<string, string[]>();
    looseIds.forEach((id) => {
        const root = semanticUnion.find(id);
        const members = semanticMembers.get(root) ?? [];
        members.push(id);
        semanticMembers.set(root, members);
    });

    interface ComponentBox {
        ids: string[];
        width: number;
        height: number;
        local: Map<string, { x: number; y: number }>;
    }

    const makeMindMapBox = (ids: string[]): ComponentBox => {
        const idSet = new Set(ids);
        const edges = validConnectorEdges.filter((edge) => idSet.has(edge.source) && idSet.has(edge.target));
        const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
        const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
        const indegree = new Map(ids.map((id) => [id, 0]));
        edges.forEach((edge) => {
            outgoing.get(edge.source)!.push(edge.target);
            adjacency.get(edge.source)!.push(edge.target);
            adjacency.get(edge.target)!.push(edge.source);
            indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
        });
        outgoing.forEach((targets) => targets.sort((a, b) => a.localeCompare(b)));
        adjacency.forEach((neighbors) => neighbors.sort((a, b) => a.localeCompare(b)));

        const rootCandidates = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
        const candidates = rootCandidates.length > 0 ? rootCandidates : ids;
        const rootId = [...candidates].sort((a, b) => {
            const degreeDiff = (adjacency.get(b)?.length ?? 0) - (adjacency.get(a)?.length ?? 0);
            return degreeDiff || a.localeCompare(b);
        })[0];

        const depth = new Map<string, number>([[rootId, 0]]);
        const queue = [rootId];
        const traversalOrder = [rootId];
        while (queue.length > 0) {
            const current = queue.shift()!;
            const directedFirst = [
                ...(outgoing.get(current) ?? []),
                ...(adjacency.get(current) ?? []).filter((id) => !(outgoing.get(current) ?? []).includes(id)),
            ];
            directedFirst.forEach((next) => {
                if (depth.has(next)) return;
                depth.set(next, (depth.get(current) ?? 0) + 1);
                queue.push(next);
                traversalOrder.push(next);
            });
        }

        const levels = new Map<number, string[]>();
        // BFS order keeps each parent's children together inside the next
        // column, reducing connector crossings compared with a global id sort.
        traversalOrder.forEach((id) => {
            const level = depth.get(id) ?? 0;
            const members = levels.get(level) ?? [];
            members.push(id);
            levels.set(level, members);
        });
        const maxDepth = Math.max(...levels.keys());
        const columnWidths: number[] = [];
        const columnHeights: number[] = [];
        for (let level = 0; level <= maxDepth; level++) {
            const members = levels.get(level) ?? [];
            columnWidths[level] = Math.max(...members.map((id) => sizeOf(byId.get(id)!).width));
            columnHeights[level] = members.reduce(
                (sum, id) => sum + sizeOf(byId.get(id)!).height,
                Math.max(0, members.length - 1) * INNER_GAP,
            );
        }
        const height = Math.max(...columnHeights);
        const local = new Map<string, { x: number; y: number }>();
        let x = 0;
        for (let level = 0; level <= maxDepth; level++) {
            const members = levels.get(level) ?? [];
            let y = (height - columnHeights[level]) / 2;
            members.forEach((id) => {
                const size = sizeOf(byId.get(id)!);
                local.set(id, { x, y });
                y += size.height + INNER_GAP;
            });
            x += columnWidths[level] + BRANCH_GAP;
        }
        return {
            ids,
            width: x - BRANCH_GAP,
            height,
            local,
        };
    };

    const makeSemanticBox = (ids: string[]): ComponentBox => {
        const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(ids.length * 1.35))));
        const rows = Math.ceil(ids.length / columns);
        const columnWidths = Array.from({ length: columns }, () => 0);
        const rowHeights = Array.from({ length: rows }, () => 0);
        ids.forEach((id, index) => {
            const size = sizeOf(byId.get(id)!);
            const column = index % columns;
            const row = Math.floor(index / columns);
            columnWidths[column] = Math.max(columnWidths[column], size.width);
            rowHeights[row] = Math.max(rowHeights[row], size.height);
        });
        const columnX: number[] = [];
        const rowY: number[] = [];
        columnWidths.forEach((width, index) => {
            columnX[index] = index === 0 ? 0 : columnX[index - 1] + columnWidths[index - 1] + INNER_GAP;
        });
        rowHeights.forEach((height, index) => {
            rowY[index] = index === 0 ? 0 : rowY[index - 1] + rowHeights[index - 1] + INNER_GAP;
        });
        const local = new Map<string, { x: number; y: number }>();
        ids.forEach((id, index) => local.set(id, {
            x: columnX[index % columns],
            y: rowY[Math.floor(index / columns)],
        }));
        return {
            ids,
            width: columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * INNER_GAP,
            height: rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows - 1) * INNER_GAP,
            local,
        };
    };

    const boxes = [
        ...mindMapComponents.map(makeMindMapBox),
        ...[...semanticMembers.values()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(makeSemanticBox),
    ];
    const columnCount = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(boxes.length * 1.5))));
    let cursorY = originY;
    for (let start = 0; start < boxes.length; start += columnCount) {
        const row = boxes.slice(start, start + columnCount);
        const rowHeight = Math.max(...row.map((box) => box.height));
        let cursorX = originX;
        row.forEach((box) => {
            const verticalOffset = (rowHeight - box.height) / 2;
            box.ids.forEach((id) => {
                const local = box.local.get(id)!;
                positions.set(id, {
                    x: snap(cursorX + local.x),
                    y: snap(cursorY + verticalOffset + local.y),
                });
            });
            cursorX += box.width + GROUP_GAP;
        });
        cursorY += rowHeight + GROUP_GAP;
    }

    return positions;
}
