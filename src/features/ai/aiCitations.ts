/**
 * Turning an answer into a *cited* answer — ai-Plan.md §5.4 (W4).
 *
 * Two kinds of citation, two mechanisms, one goal: nothing the AI asserts
 * should be untraceable.
 *
 * WEB — Gemini returns `groundingSupports`, which maps spans of the answer onto
 * the pages that support them. That mapping was thrown away and the sources
 * stapled to the bottom as a list, so a reader could see that five pages were
 * used but never which sentence came from which. `insertWebCitations` puts the
 * markers back where they belong.
 *
 * NODE — the prompt hands the model short refs (`[N1]`) for the cards in scope
 * and asks it to cite with them. `resolveNodeCitations` maps those back to real
 * nodes and rewrites them as inline chips. The model never sees a uuid: they
 * cost tokens, invite hallucinated ids, and a wrong one is indistinguishable
 * from a right one, whereas a bad `[N7]` in a 3-card scope fails visibly.
 */

import type { AppNode } from '../../types';
import { nodeTitle } from './canvasContext';

export interface GroundingSpan {
    /** BYTE offsets into the UTF-8 answer, as Gemini reports them. */
    start: number;
    end: number;
    citationIndexes: number[];
}

/**
 * Map UTF-8 byte offsets onto JS string indices.
 *
 * Gemini measures `segment.startIndex`/`endIndex` in bytes; JS strings are
 * UTF-16 code units. For a pure-ASCII answer the two agree and this is a no-op,
 * which is exactly why getting it wrong survives casual testing — the moment an
 * answer contains an em-dash, an accented name or an emoji, every marker after
 * it lands mid-word. Built once per answer rather than per span.
 */
function byteToCharIndex(text: string): (byteIndex: number) => number {
    const encoder = new TextEncoder();
    // Fast path: no multi-byte characters means the mapping is the identity.
    if (encoder.encode(text).length === text.length) return (byteIndex) => byteIndex;

    const map = new Map<number, number>();
    let bytes = 0;
    for (let i = 0; i < text.length; i += 1) {
        map.set(bytes, i);
        // Code points outside the BMP occupy two UTF-16 units; step over the
        // low surrogate so its byte length is not counted twice.
        const codePoint = text.codePointAt(i);
        const char = String.fromCodePoint(codePoint ?? 0);
        if (char.length === 2) i += 1;
        bytes += encoder.encode(char).length;
    }
    map.set(bytes, text.length);

    return (byteIndex) => {
        const exact = map.get(byteIndex);
        if (exact !== undefined) return exact;
        // A span boundary landing inside a character: round down to its start.
        let best = 0;
        for (const [b, c] of map) if (b <= byteIndex && b >= best) best = c;
        return best;
    };
}

/**
 * Place `[n]` markers at the end of each supported span.
 *
 * Insertion walks BACKWARDS through the spans so that every offset still refers
 * to the original string — inserting front-to-back would shift every subsequent
 * span by the length of the markers already added.
 */
export function insertWebCitations(text: string, spans: GroundingSpan[]): string {
    if (!text || spans.length === 0) return text;

    const toChar = byteToCharIndex(text);
    const placed = spans
        .map((span) => ({ at: toChar(span.end), indexes: span.citationIndexes }))
        .filter((span) => span.at > 0 && span.at <= text.length)
        .sort((a, b) => b.at - a.at);

    let out = text;
    let lastAt = Number.POSITIVE_INFINITY;
    for (const span of placed) {
        // Two supports ending at the same point would stack duplicate markers.
        if (span.at === lastAt) continue;
        lastAt = span.at;
        const marker = span.indexes.map((i) => `[${i + 1}]`).join('');
        out = `${out.slice(0, span.at)}${marker}${out.slice(span.at)}`;
    }
    return out;
}

/**
 * Rewrite `[N1]` refs as inline node chips, and drop the ones that resolve to
 * nothing.
 *
 * The chip uses the editor's existing `chnk://` link convention rather than a
 * new mechanism, so it renders, serialises and survives a copy-paste like every
 * other inline chip already does. A ref the scope does not contain is stripped
 * rather than shown: a citation the reader cannot follow is worse than none,
 * and a visible `[N7]` pointing at nothing actively misleads.
 */
export function resolveNodeCitations(text: string, refs: Map<string, AppNode>): string {
    if (!text) return text;
    return text.replace(/\[(N\d{1,3})\]/g, (whole, ref: string) => {
        const node = refs.get(ref);
        if (!node) return '';
        // `]` in a title would close the markdown link early.
        const title = nodeTitle(node).replace(/[[\]]/g, '');
        return `[${title}](chnk://node/${node.id})`;
    }).replace(/ {2,}/g, ' ').replace(/ +([.,;:])/g, '$1');
}

/** Render the source list appended under a grounded answer. */
export function citationsAsMarkdown(
    citations: { title: string; url: string; source: string }[],
): string {
    if (citations.length === 0) return '';
    const lines = citations.map((c, i) => `${i + 1}. [${c.title || c.source}](${c.url})`);
    return `\n\n---\n\n**Sources**\n\n${lines.join('\n')}`;
}
