import { useEffect, useState, useMemo, useRef, useCallback, memo } from 'react';
import { useStore } from '../../../../store/useStore';
import searchStyles from './SearchResults.module.css';
import { FileText, Cuboid, ChevronRight, Clock, Search, CornerDownRight } from '../../../../shared/icons';
import { highlightMatch, parseSearchQuery } from '../../model/searchUtils';
import type { RichSearchResult } from '../../model/searchUtils';
import type { SearchRequest, SearchResponse } from '../../workers/search.worker.ts';

const SEARCH_DEBOUNCE_MS = 250;

interface SearchResultsProps {
    query: string;
    onClose: () => void;
}

type ResultGroup = 'note' | 'block';

const GROUPS: Record<ResultGroup, { label: string; icon: typeof FileText }> = {
    note: { label: 'Notes', icon: FileText },
    block: { label: 'Blocks', icon: Cuboid },
};

const groupOf = (result: RichSearchResult): ResultGroup => (result.type === 'note' ? 'note' : 'block');

function formatRelativeTime(isoTime?: string): string {
    const time = isoTime ? Date.parse(isoTime) : NaN;
    if (!Number.isFinite(time)) return '';
    const diffMins = Math.floor((Date.now() - time) / 60_000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    if (diffMins < 10_080) return `${Math.floor(diffMins / 1440)}d ago`;
    return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const SearchResults = memo(function SearchResults({ query, onClose }: SearchResultsProps) {
    const nodes = useStore(s => s.nodes);
    const navigateToNode = useStore(s => s.navigateToNode);
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const setRightSidePanelId = useStore(s => s.setRightSidePanelId);
    const setLeftSidePanelId = useStore(s => s.setLeftSidePanelId);
    const setCenterPanelId = useStore(s => s.setCenterPanelId);

    const [results, setResults] = useState<RichSearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const resultsRef = useRef<HTMLDivElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const latestRequestRef = useRef(0);

    // Reset synchronously when the input changes, so stale results never show
    // under a new query while the debounced search is pending.
    const [previousSearch, setPreviousSearch] = useState({ query, nodes });
    if (previousSearch.query !== query || previousSearch.nodes !== nodes) {
        setPreviousSearch({ query, nodes });
        setIsSearching(Boolean(query.trim()));
        if (!query.trim()) setResults([]);
    }

    // One worker for as long as search is open.
    useEffect(() => {
        const worker = new Worker(new URL('../../workers/search.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent<SearchResponse>) => {
            // Only the newest request may paint; older answers are stale.
            if (e.data.requestId !== latestRequestRef.current) return;
            setResults(e.data.results);
            setSelectedIndex(0);
            setIsSearching(false);
        };
        workerRef.current = worker;
        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!query.trim()) return;
        const requestId = ++latestRequestRef.current;
        const timer = window.setTimeout(() => {
            workerRef.current?.postMessage({ requestId, query, nodes } satisfies SearchRequest);
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [query, nodes]);

    const handleSelect = useCallback((nodeId: string) => {
        setFullscreenId(null);
        setRightSidePanelId(null);
        setLeftSidePanelId(null);
        setCenterPanelId(null);
        navigateToNode(nodeId);
        onClose();
    }, [setFullscreenId, setRightSidePanelId, setLeftSidePanelId, setCenterPanelId, navigateToNode, onClose]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && results[selectedIndex]) {
                handleSelect(results[selectedIndex].id);
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [results, selectedIndex, onClose, handleSelect]);

    useEffect(() => {
        resultsRef.current
            ?.querySelector(`[data-index="${selectedIndex}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, results]);

    const groupedResults = useMemo(() => {
        const byGroup = new Map<ResultGroup, RichSearchResult[]>();
        for (const result of results) {
            const key = groupOf(result);
            byGroup.set(key, [...(byGroup.get(key) ?? []), result]);
        }
        return (['note', 'block'] as const)
            .filter((key) => byGroup.has(key))
            .map((key) => ({ key, ...GROUPS[key], results: byGroup.get(key)! }));
    }, [results]);

    const maxScore = useMemo(() => Math.max(0, ...results.map(r => r.score)), [results]);
    const searchText = useMemo(() => parseSearchQuery(query).text, [query]);

    if (!query.trim()) return null;

    let rowIndex = 0;

    return (
        <div className={searchStyles.searchResults} ref={resultsRef}>
            <div className={searchStyles.searchResultsHeader}>
                <Search size={14} />
                <span>
                    {isSearching ? 'Searching...' : `${results.length} result${results.length !== 1 ? 's' : ''}`}
                </span>
                {results.length > 0 && (
                    <span className={searchStyles.searchResultsHint}>
                        <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open
                    </span>
                )}
            </div>

            {isSearching && results.length === 0 && (
                <div className={searchStyles.searchLoading}>
                    <div className={searchStyles.searchLoadingDots}>
                        <span /><span /><span />
                    </div>
                </div>
            )}

            {!isSearching && results.length === 0 && (
                <div className={searchStyles.searchEmpty}>
                    <Search size={24} />
                    <span>No results found</span>
                    <span className={searchStyles.searchEmptyHint}>Try different keywords.</span>
                </div>
            )}

            {groupedResults.map((group) => (
                <div key={group.key} className={searchStyles.searchGroup}>
                    <div className={searchStyles.searchGroupHeader}>
                        <group.icon size={14} />
                        <span>{group.label}</span>
                        {group.key !== 'block' && <span className={searchStyles.searchGroupCount}>{group.results.length}</span>}
                    </div>
                    {group.results.map((result) => {
                        const globalIndex = rowIndex++;
                        const isSelected = globalIndex === selectedIndex;
                        const scoreWidth = maxScore > 0 ? Math.round((result.score / maxScore) * 100) : 0;
                        const updated = formatRelativeTime(result.updatedAt);

                        return (
                            <div
                                key={result.id}
                                data-index={globalIndex}
                                className={`${searchStyles.resultItem} ${isSelected ? searchStyles.selected : ''}`}
                                onClick={() => handleSelect(result.id)}
                                onMouseEnter={() => setSelectedIndex(globalIndex)}
                            >
                                <div className={searchStyles.resultCardAccent} style={{ background: 'var(--accent)' }} />
                                <div className={searchStyles.resultIcon}>
                                    <group.icon size={16} />
                                </div>
                                <div className={searchStyles.resultContent}>
                                    <div className={searchStyles.resultTitleRow}>
                                        <span
                                            className={searchStyles.resultTitle}
                                            dangerouslySetInnerHTML={{ __html: highlightMatch(result.label, searchText) }}
                                        />
                                    </div>

                                    <div className={searchStyles.resultMeta}>
                                        {updated && (
                                            <span className={searchStyles.metaItem}>
                                                <Clock size={10} /> {updated}
                                            </span>
                                        )}
                                        {result.wordCount > 0 && (
                                            <span className={searchStyles.metaItem}>{result.wordCount} words</span>
                                        )}
                                    </div>

                                    {result.previewContext && (
                                        <div className={searchStyles.resultPreview}>
                                            <span dangerouslySetInnerHTML={{ __html: highlightMatch(result.previewContext, searchText) }} />
                                        </div>
                                    )}

                                    {result.path.length > 1 && (
                                        <div className={searchStyles.resultPath}>
                                            <CornerDownRight size={10} />
                                            {result.path.slice(0, -1).map((seg, i) => (
                                                <span key={seg.id} className={searchStyles.pathSegment}>
                                                    {seg.label}
                                                    {i < result.path.length - 2 && (
                                                        <span className={searchStyles.pathSeparator}>/</span>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className={searchStyles.resultRight}>
                                    <div className={searchStyles.scoreBar}>
                                        <div className={searchStyles.scoreBarFill} style={{ width: `${scoreWidth}%` }} />
                                    </div>
                                    {isSelected && <ChevronRight size={14} className={searchStyles.enterIcon} />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
});
