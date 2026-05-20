import { 
    parseSearchQuery, 
    matchNode, 
    calculateRelevance, 
    extractNodeSearchableText,
    extractPreviewContext,
    buildNodePath,
    estimateWordCount
} from './searchUtils';
import type { AppNode } from '../../types';

self.onmessage = (e: MessageEvent) => {
    const { query, nodes } = e.data;

    if (!query || !query.trim()) {
        self.postMessage({ results: [] });
        return;
    }

    const filters = parseSearchQuery(query);
    const searchText = filters.text.toLowerCase();

    const filtered = nodes
        .filter((node: AppNode) => matchNode(node, filters))
        .map((node: AppNode) => {
            const data = node.data as any;
            const score = calculateRelevance(node, filters);
            const allText = extractNodeSearchableText(node);
            
            let preview = '';
            let previewContext = '';
            if (searchText) {
                const matchingPart = allText.find(t => t.toLowerCase().includes(searchText));
                if (matchingPart) {
                    preview = matchingPart;
                    previewContext = extractPreviewContext(matchingPart, searchText);
                }
            }
            
            if (!preview) {
                preview = String(data.description || (Array.isArray(data.content) ? '' : data.content) || '');
                previewContext = preview.slice(0, 120);
            }

            const path = buildNodePath(node.id, nodes);
            const wordCount = estimateWordCount(node);

            return {
                id: node.id,
                label: String(data.label || 'Untitled'),
                type: node.type,
                preview,
                previewContext,
                tags: data.tags || [],
                status: data.status,
                priority: data.priority,
                score,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                wordCount,
                path,
                category: data.category,
                icon: data.icon
            };
        })
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 20);

    self.postMessage({ results: filtered });
};
