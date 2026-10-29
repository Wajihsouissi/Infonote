import { cosine, extractText, HEADING_LEVEL, mergeTermFreq, tokenize, type AnalyzableBlock, type TermFreq } from './blockText';
import type { RelatedEdge } from './types';

/**
 * Which node hangs off which.
 *
 * The planner says what the nodes are; this decides the shape of the map. Two
 * nodes are linked only when they are genuinely about the same thing, and of
 * those links only the strongest that still hold the map together are kept —
 * otherwise a long card turns into a hairball where everything touches
 * everything and the picture says nothing.
 */

/** Two groups may be connected only when their content similarity is at/above
 *  this value — i.e. they are genuinely related, not merely adjacent. The
 *  spanning forest then keeps only the strongest such links. */
const RELATE_EDGE_THRESHOLD = 0.24;

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
export function buildRelatednessForest(items: ScoredItem[]): RelatednessForest {
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
