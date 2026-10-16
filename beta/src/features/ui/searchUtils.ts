import { type AppNode, type AppNodeType, type NoteData, getNodeLabel } from '../../types';
import type { Block } from '../editor/types';

/**
 * Canvas search.
 *
 * Query syntax: free text, plus `is:note` / `is:block` to narrow by kind.
 * Metadata filters (#tag, status:, priority:, dates) return with card metadata.
 */
export interface SearchFilters {
    type?: 'note' | 'block';
    text: string;
}

export interface PathSegment {
    id: string;
    label: string;
}

export interface RichSearchResult {
    id: string;
    label: string;
    type: AppNodeType;
    previewContext: string;
    score: number;
    updatedAt?: string;
    wordCount: number;
    path: PathSegment[];
}

/** Parses a query into its `is:` filter and the text to search for. */
export function parseSearchQuery(query: string): SearchFilters {
    const filters: SearchFilters = { text: '' };
    const textWords: string[] = [];

    for (const word of query.split(/\s+/)) {
        const kind = /^is:(note|block)$/i.exec(word);
        if (kind) filters.type = kind[1].toLowerCase() as SearchFilters['type'];
        else if (word) textWords.push(word);
    }

    filters.text = textWords.join(' ').toLowerCase();
    return filters;
}

/** Every piece of searchable text in a node: title, description and body. */
export function extractNodeSearchableText(node: AppNode): string[] {
    const textParts: string[] = [];
    if (!node?.data) return textParts;

    // Read note-ish fields opportunistically; other node types simply lack them.
    const data = node.data as Partial<NoteData>;
    if (data.label) textParts.push(data.label);
    if (data.description) textParts.push(data.description);

    if (Array.isArray(data.content)) extractBlocksText(data.content, textParts);
    else if (typeof data.content === 'string') textParts.push(data.content);

    return textParts;
}

function extractBlocksText(blocks: Block[], results: string[]) {
    for (const block of blocks) {
        if (!block) continue;
        if (typeof block.content === 'string') results.push(block.content);

        const metadata = block.metadata;
        if (!metadata) continue;

        // Containers nest blocks in metadata.content.
        if (Array.isArray(metadata.content)) extractBlocksText(metadata.content, results);

        // Columns; older saves called a column's blocks `blocks`.
        if (Array.isArray(metadata.columns)) {
            for (const col of metadata.columns) {
                const legacyColumn = col as unknown as { content?: unknown; blocks?: unknown };
                const content = Array.isArray(legacyColumn.content)
                    ? legacyColumn.content
                    : Array.isArray(legacyColumn.blocks) ? legacyColumn.blocks : [];
                if (content.length > 0) extractBlocksText(content as Block[], results);
            }
        }

        // Gallery tiles: names only. A tile's `content` can be an inline data
        // URL, and a board of ten photos would bury the index in base64.
        if (Array.isArray(metadata.items)) {
            for (const item of metadata.items) {
                if (item?.metadata?.name) results.push(item.metadata.name);
            }
        }

        if (metadata.name) results.push(metadata.name);
        if (metadata.description) results.push(metadata.description);
    }
}

/** Whether a node passes the kind filter and contains the search text. */
export function matchNode(node: AppNode, filters: SearchFilters, text: string): boolean {
    if (filters.type === 'note' && node.type !== 'note') return false;
    if (filters.type === 'block' && node.type === 'note') return false;
    return !filters.text || text.includes(filters.text);
}

/** Relevance of a matching node: title hits first, then frequency, recency, richness. */
export function calculateRelevance(node: AppNode, filters: SearchFilters, text: string, wordCount: number): number {
    const searchText = filters.text;
    if (!searchText) return 1;

    const data = node.data as Partial<NoteData>;
    let score = 0;

    const label = String(data.label || '').toLowerCase();
    if (label === searchText) score += 100;
    else if (label.startsWith(searchText)) score += 50;
    else if (label.includes(searchText)) score += 20;

    score += countOccurrences(text, searchText) * 2;
    score += recencyBonus(data.updatedAt || data.createdAt);

    if (wordCount > 200) score += 5;
    else if (wordCount > 50) score += 3;

    return score;
}

function countOccurrences(haystack: string, needle: string): number {
    let count = 0;
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count++;
    return count;
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(string: string) {
    return string
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** HTML-escapes `text` and wraps matches of `term` in <strong>. */
export function highlightMatch(text: string, term: string): string {
    const safeText = escapeHtml(text);
    if (!term) return safeText;
    const regex = new RegExp(`(${escapeRegExp(escapeHtml(term))})`, 'gi');
    return safeText.replace(regex, '<strong>$1</strong>');
}

/** A short excerpt around the first match of `searchTerm`. */
export function extractPreviewContext(text: string, searchTerm: string, contextChars = 60): string {
    if (!searchTerm || !text) return text.slice(0, 120);
    const idx = text.toLowerCase().indexOf(searchTerm.toLowerCase());
    if (idx === -1) return text.slice(0, 120);

    const start = Math.max(0, idx - contextChars);
    const end = Math.min(text.length, idx + searchTerm.length + contextChars);
    return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
}

/** The chain of canvases from the root down to (and including) the node. */
export function buildNodePath(nodeId: string, nodeMap: Map<string, AppNode>): PathSegment[] {
    const path: PathSegment[] = [];
    const seen = new Set<string>();
    let current = nodeMap.get(nodeId);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift({ id: current.id, label: String(getNodeLabel(current.data) || 'Untitled') });
        current = current.parentId ? nodeMap.get(current.parentId) : undefined;
    }
    return path;
}

export const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** Bonus for recently edited nodes. */
function recencyBonus(isoTime?: string): number {
    if (!isoTime) return 0;
    const daysAgo = (Date.now() - Date.parse(isoTime)) / 86_400_000;
    if (!Number.isFinite(daysAgo)) return 0;
    if (daysAgo < 1) return 30;
    if (daysAgo < 7) return 20;
    if (daysAgo < 30) return 10;
    return 0;
}
