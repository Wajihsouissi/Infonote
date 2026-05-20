import type { AppNode } from '../../types';

export interface SearchFilters {
    tags: string[];
    status?: string;
    priority?: string;
    type?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    text: string;
}

export interface ScoredResult {
    nodeId: string;
    score: number;
    highlights: Record<string, string>;
}

export interface PathSegment {
    id: string;
    label: string;
}

export interface RichSearchResult {
    id: string;
    label: string;
    type: string;
    preview: string;
    previewContext: string;
    tags: string[];
    status?: string;
    priority?: string;
    score: number;
    createdAt?: string;
    updatedAt?: string;
    wordCount?: number;
    path: PathSegment[];
    category?: string;
    icon?: string;
}

/**
 * Parses a search query into filters and search text.
 * Syntax:
 * - #tag
 * - status:todo
 * - priority:high
 * - is:note|kanban|block
 * - date:YYYY-MM-DD
 */
export function parseSearchQuery(query: string): SearchFilters {
    const filters: SearchFilters = {
        tags: [],
        text: ''
    };

    const words = query.split(/\s+/);
    const textWords: string[] = [];

    words.forEach(word => {
        if (word.startsWith('#')) {
            filters.tags.push(word.substring(1).toLowerCase());
        } else if (word.includes(':')) {
            const [key, value] = word.split(':').map(s => s.toLowerCase());
            switch (key) {
                case 'status':
                    filters.status = value;
                    break;
                case 'priority':
                    filters.priority = value;
                    break;
                case 'is':
                    filters.type = value;
                    break;
                case 'date':
                    filters.date = value;
                    break;
                case 'after':
                    filters.startDate = value;
                    break;
                case 'before':
                    filters.endDate = value;
                    break;
                default:
                    textWords.push(word);
            }
        } else {
            textWords.push(word);
        }
    });

    filters.text = textWords.join(' ').toLowerCase();
    return filters;
}

/**
 * Recursively extracts all searchable text from a node.
 */
export function extractNodeSearchableText(node: AppNode): string[] {
    const textParts: string[] = [];
    
    if (!node || !node.data) return textParts;

    const data = node.data as any;

    // Label and Description
    if (data.label) textParts.push(data.label);
    if (data.description) textParts.push(data.description);
    if (data.category) textParts.push(data.category);

    // Deep Indexing: Search in content blocks
    if (Array.isArray(data.content)) {
        extractBlocksText(data.content, textParts);
    } else if (typeof data.content === 'string') {
        textParts.push(data.content);
    }

    return textParts;
}

function extractBlocksText(blocks: any[], results: string[]) {
    blocks.forEach(block => {
        if (!block) return;
        
        if (typeof block.content === 'string') {
            results.push(block.content);
        }
        
        // Handle nested blocks in metadata
        if (block.metadata) {
            // 1. Recursive content (standard container pattern)
            if (Array.isArray(block.metadata.content)) {
                extractBlocksText(block.metadata.content, results);
            }
            
            // 2. Columns pattern
            if (Array.isArray(block.metadata.columns)) {
                block.metadata.columns.forEach((col: any) => {
                    if (Array.isArray(col.content)) {
                        extractBlocksText(col.content, results);
                    }
                });
            }

            // 3. Searchable metadata fields
            if (block.metadata.name) results.push(block.metadata.name);
            if (block.metadata.description) results.push(block.metadata.description);
        }
    });
}

/**
 * Matches a node against the parsed filters.
 */
export function matchNode(node: AppNode, filters: SearchFilters): boolean {
    const data = node.data as any;

    // 1. Type filter
    if (filters.type) {
        const typeMatch = filters.type === 'note' ? node.type === 'note' :
                         filters.type === 'kanban' ? node.type === 'kanban' :
                         filters.type === 'block' ? (node.type === 'block' || node.type === 'fused-note') :
                         false;
        if (!typeMatch) return false;
    }

    // 2. Status filter
    if (filters.status && data.status !== filters.status) return false;

    // 3. Priority filter
    if (filters.priority && data.priority !== filters.priority) return false;

    // 4. Tags filter
    if (filters.tags.length > 0) {
        const nodeTags = (data.tags || []).map((t: string) => t.toLowerCase());
        const hasAllTags = filters.tags.every(tag => nodeTags.includes(tag));
        if (!hasAllTags) return false;
    }

    // 5. Date filter (Check date, createdDate, or dueDate)
    if (filters.date || filters.startDate || filters.endDate) {
        const nodeDate = data.date || data.createdAt || data.dueDate;
        
        if (filters.date && (!nodeDate || !nodeDate.includes(filters.date))) return false;
        
        if (nodeDate) {
            const dateObj = new Date(nodeDate);
            if (filters.startDate && dateObj < new Date(filters.startDate)) return false;
            if (filters.endDate && dateObj > new Date(filters.endDate)) return false;
        } else if (filters.startDate || filters.endDate) {
            return false;
        }
    }

    // 6. Text search (Deep Indexing)
    if (filters.text) {
        const searchableText = extractNodeSearchableText(node).join(' ').toLowerCase();
        if (!searchableText.includes(filters.text)) return false;
    }

    return true;
}

/**
 * Calculates a relevance score for a node based on filters and text.
 */
export function calculateRelevance(node: AppNode, filters: SearchFilters): number {
    let score = 0;
    const data = node.data as any;
    const searchText = filters.text.toLowerCase();
    
    if (!searchText) return 1;

    // Title match (highest weight)
    const label = String(data.label || '').toLowerCase();
    if (label === searchText) score += 100;
    else if (label.startsWith(searchText)) score += 50;
    else if (label.includes(searchText)) score += 20;

    // Tags match
    const nodeTags = (data.tags || []).map((t: string) => t.toLowerCase());
    filters.tags.forEach(tag => {
        if (nodeTags.includes(tag)) score += 10;
    });

    // Deep content match
    const searchableText = extractNodeSearchableText(node).join(' ').toLowerCase();
    const count = (searchableText.match(new RegExp(escapeRegExp(searchText), 'gi')) || []).length;
    score += count * 2;

    // Recency bonus
    score += recencyBonus(data.updatedAt || data.createdAt);

    // Content richness bonus (nodes with more content rank slightly higher)
    const wordCount = estimateWordCount(node);
    if (wordCount > 200) score += 5;
    else if (wordCount > 50) score += 3;

    return score;
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlights matches in text with <strong> tags.
 */
export function highlightMatch(text: string, term: string): string {
    if (!term) return text;
    const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
}

/**
 * Extracts preview with surrounding context around the matched term.
 */
export function extractPreviewContext(text: string, searchTerm: string, contextChars: number = 60): string {
    if (!searchTerm || !text) return text.slice(0, 120);
    const lower = text.toLowerCase();
    const idx = lower.indexOf(searchTerm.toLowerCase());
    if (idx === -1) return text.slice(0, 120);

    const start = Math.max(0, idx - contextChars);
    const end = Math.min(text.length, idx + searchTerm.length + contextChars);
    let preview = text.slice(start, end);

    if (start > 0) preview = '...' + preview;
    if (end < text.length) preview = preview + '...';
    return preview;
}

/**
 * Builds a breadcrumb path for a node by walking up the parent chain.
 */
export function buildNodePath(nodeId: string, nodes: AppNode[]): PathSegment[] {
    const path: PathSegment[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    let current = nodeMap.get(nodeId);

    while (current) {
        path.unshift({ id: current.id, label: String((current.data as any)?.label || 'Untitled') });
        const parentId = (current as any).parentId;
        current = parentId ? nodeMap.get(parentId) : undefined;
    }

    return path;
}

/**
 * Estimates word count from node content.
 */
export function estimateWordCount(node: AppNode): number {
    const textParts = extractNodeSearchableText(node);
    const allText = textParts.join(' ');
    return allText.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Applies bonus score for recent updates (lower is better).
 */
export function recencyBonus(updatedAt?: string): number {
    if (!updatedAt) return 0;
    const daysAgo = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo < 1) return 30;
    if (daysAgo < 7) return 20;
    if (daysAgo < 30) return 10;
    return 0;
}
