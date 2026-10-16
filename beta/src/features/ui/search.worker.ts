/**
 * Runs canvas search off the main thread. One request in, one response out;
 * `requestId` is echoed back so the page can drop answers to stale queries.
 */
import {
    parseSearchQuery,
    matchNode,
    calculateRelevance,
    extractNodeSearchableText,
    extractPreviewContext,
    buildNodePath,
    countWords,
    type RichSearchResult,
} from './searchUtils';
import type { AppNode, NoteData } from '../../types';

export interface SearchRequest {
    requestId: number;
    query: string;
    nodes: AppNode[];
}

export interface SearchResponse {
    requestId: number;
    results: RichSearchResult[];
}

const MAX_RESULTS = 10;

self.onmessage = (e: MessageEvent<SearchRequest>) => {
    const { requestId, query, nodes } = e.data;
    const respond = (results: RichSearchResult[]) => self.postMessage({ requestId, results } satisfies SearchResponse);

    if (!query.trim()) {
        respond([]);
        return;
    }

    const filters = parseSearchQuery(query);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const scored = nodes.flatMap((node) => {
        const parts = extractNodeSearchableText(node);
        const text = parts.join(' ').toLowerCase();
        if (!matchNode(node, filters, text)) return [];
        const wordCount = countWords(text);
        return [{ node, parts, wordCount, score: calculateRelevance(node, filters, text, wordCount) }];
    });

    scored.sort((a, b) => b.score - a.score);

    respond(scored.slice(0, MAX_RESULTS).map(({ node, parts, wordCount, score }) => {
        const data = node.data as Partial<NoteData>;
        const matchingPart = filters.text
            ? parts.find((part) => part.toLowerCase().includes(filters.text))
            : undefined;
        const previewContext = matchingPart
            ? extractPreviewContext(matchingPart, filters.text)
            : String(data.description ?? '').slice(0, 120);

        return {
            id: node.id,
            label: String(data.label || 'Untitled'),
            type: node.type,
            previewContext,
            score,
            updatedAt: data.updatedAt,
            wordCount,
            path: buildNodePath(node.id, nodeMap),
        };
    }));
};
