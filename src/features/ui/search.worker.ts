import { 
    parseSearchQuery, 
    matchNode, 
    calculateRelevance, 
    extractNodeSearchableText 
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
            
            // Find a preview snippet that contains the search text
            let preview = '';
            if (searchText) {
                const allText = extractNodeSearchableText(node);
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
                label: String(data.label || 'Untitled'),
                type: node.type,
                preview,
                tags: data.tags || [],
                status: data.status,
                priority: data.priority,
                score
            };
        })
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 10);

    self.postMessage({ results: filtered });
};
