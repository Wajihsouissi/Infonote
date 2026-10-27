import { v4 as uuidv4 } from 'uuid';
import type { Block } from '../../features/editor/types';
import { buildRelatednessForest } from './hierarchy';
import { categorize, cosine, extractText, HEADING_LEVEL, isCanvasHydratableBlock, mergeTermFreq, termFreq, tokenize, type Category, type TermFreq } from './blockText';
import type { HydrationChunk, HydrationPlan, RelatedEdge } from './types';

/**
 * The planner: a flat list of blocks in, a set of canvas nodes out.
 *
 * It walks the blocks once, keeping one node open at a time. A heading opens a
 * section, a picture or a table always stands alone, and ordinary text joins
 * the open node while it still sounds like the same subject — so a card of
 * unbroken prose still breaks into topics, and a card of headings keeps them.
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
