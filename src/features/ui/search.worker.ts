import { 
    parseSearchQuery, 
    matchNode, 
    calculateRelevance, 
    extractNodeSearchableText,
    extractPreviewContext,
    buildNodePath,
    estimateWordCount
} from './searchUtils';
import type { AppNode, NoteData } from '../../types';

self.onmessage = (e: MessageEvent<{ query: string; nodes: AppNode[] }>) => {
    const { query, nodes } = e.data;

    if (!query || !query.trim()) {
        self.postMessage({ results: [] });
        return;
    }

    const filters = parseSearchQuery(query);
    const searchText = filters.text.toLowerCase();

    // Build a map once for path lookups
    const nodeMap: Map<string, AppNode> = new Map(nodes.map((n: AppNode) => [n.id, n]));

    // Pre-compute searchable text per node to avoid redundant calls
    const textCache = new Map<string, string[]>();

    const getText = (node: AppNode): string[] => {
        let cached = textCache.get(node.id);
        if (!cached) {
            cached = extractNodeSearchableText(node);
            textCache.set(node.id, cached);
        }
        return cached;
    };

    const scored = nodes
        .filter((node: AppNode) => matchNode(node, filters))
        .map((node: AppNode) => {
            const data = node.data as Partial<NoteData>;
            const score = calculateRelevance(node, filters);
            const allText = getText(node);

            let preview = '';
            if (searchText) {
                const matchingPart = allText.find(t => t.toLowerCase().includes(searchText));
                if (matchingPart) {
                    preview = matchingPart;
                }
            }

            if (!preview) {
                preview = String(data.description || (Array.isArray(data.content) ? '' : data.content) || '');
            }

            return {
                id: node.id,
                data,
                score,
                preview,
                allText
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    // Only build rich results for the top matches
    const results = scored.map(({ id, data, score, preview, allText }) => {
        let previewContext = '';
        if (searchText) {
            const matchingPart = allText.find((t: string) => t.toLowerCase().includes(searchText));
            if (matchingPart) {
                previewContext = extractPreviewContext(matchingPart, searchText);
            }
        }
        if (!previewContext) {
            previewContext = preview.slice(0, 120);
        }

        return {
            id,
            label: String(data.label || 'Untitled'),
            type: data.type || 'note',
            preview,
            previewContext,
            tags: data.tags || [],
            status: data.status,
            priority: data.priority,
            score,
            updatedAt: data.updatedAt,
            wordCount: estimateWordCount({ id, data } as AppNode),
            path: buildNodePath(id, nodeMap),
        };
    });

    self.postMessage({ results });
};
