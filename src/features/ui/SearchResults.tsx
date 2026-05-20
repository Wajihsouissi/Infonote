import { useEffect, useState, useMemo, useRef } from 'react';
import { useStore } from '../../store/useStore';
import styles from './BottomMenu.module.css';
import { FileText, Cuboid, KanbanSquare, ChevronRight, Hash, Clock, LayoutGrid, Search, CornerDownRight } from 'lucide-react';
import { highlightMatch, parseSearchQuery } from './searchUtils';
import type { RichSearchResult } from './searchUtils';

interface SearchResultsProps {
    query: string;
    onClose: () => void;
}

interface GroupedResults {
    label: string;
    type: string;
    icon: typeof FileText;
    results: RichSearchResult[];
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getScoreWidth(score: number, maxScore: number): number {
    if (maxScore === 0) return 0;
    return Math.round((score / maxScore) * 100);
}

function getTypeIcon(type: string) {
    switch (type) {
        case 'note': return FileText;
        case 'kanban': return KanbanSquare;
        case 'block':
        case 'fused-note': return Cuboid;
        default: return LayoutGrid;
    }
}

function getTypeLabel(type: string): string {
    switch (type) {
        case 'note': return 'Notes';
        case 'kanban': return 'Boards';
        case 'block': return 'Blocks';
        case 'fused-note': return 'Blocks';
        default: return 'Other';
    }
}

function getPriorityColor(priority?: string): string {
    switch (priority) {
        case 'urgent': return '#ef4444';
        case 'high': return '#f59e0b';
        case 'medium': return '#3b82f6';
        case 'low': return '#10b981';
        default: return 'transparent';
    }
}

export function SearchResults({ query, onClose }: SearchResultsProps) {
    const nodes = useStore(s => s.nodes);
    const navigateToNode = useStore(s => s.navigateToNode);
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const setRightSidePanelId = useStore(s => s.setRightSidePanelId);
    const setLeftSidePanelId = useStore(s => s.setLeftSidePanelId);
    const setCenterPanelId = useStore(s => s.setCenterPanelId);

    const [results, setResults] = useState<RichSearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const debounceTimerRef = useRef<number | null>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

    const worker = useMemo(() => new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' }), []);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = window.setTimeout(() => {
            worker.postMessage({ query, nodes });
        }, 250);

        const handleMessage = (e: MessageEvent) => {
            setResults(e.data.results);
            setSelectedIndex(0);
            setIsSearching(false);
        };

        worker.addEventListener('message', handleMessage);
        return () => {
            worker.removeEventListener('message', handleMessage);
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [query, nodes, worker]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % results.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (results[selectedIndex]) {
                    handleSelect(results[selectedIndex].id);
                }
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [results, selectedIndex, onClose]);

    useEffect(() => {
        if (resultsRef.current && results[selectedIndex]) {
            const el = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
            el?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex, results]);

    const handleSelect = (nodeId: string) => {
        setFullscreenId(null);
        setRightSidePanelId(null);
        setLeftSidePanelId(null);
        setCenterPanelId(null);
        navigateToNode(nodeId);
        onClose();
    };

    const groupedResults: GroupedResults[] = useMemo(() => {
        const groups: Record<string, RichSearchResult[]> = {};
        results.forEach(r => {
            const key = r.type === 'fused-note' ? 'block' : r.type;
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        const order = ['note', 'kanban', 'block'];
        return order
            .filter(t => groups[t])
            .map(t => ({
                label: getTypeLabel(t),
                type: t,
                icon: getTypeIcon(t),
                results: groups[t]
            }));
    }, [results]);

    const maxScore = useMemo(() => {
        if (results.length === 0) return 0;
        return Math.max(...results.map(r => r.score));
    }, [results]);

    if (!query.trim()) return null;

    return (
        <div className={styles.searchResults} ref={resultsRef}>
            <div className={styles.searchResultsHeader}>
                <Search size={14} />
                <span>
                    {isSearching ? 'Searching...' : `${results.length} result${results.length !== 1 ? 's' : ''}`}
                </span>
                {results.length > 0 && (
                    <span className={styles.searchResultsHint}>
                        <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open
                    </span>
                )}
            </div>

            {isSearching && results.length === 0 && (
                <div className={styles.searchLoading}>
                    <div className={styles.searchLoadingDots}>
                        <span /><span /><span />
                    </div>
                </div>
            )}

            {!isSearching && results.length === 0 && (
                <div className={styles.searchEmpty}>
                    <Search size={24} />
                    <span>No results found</span>
                    <span className={styles.searchEmptyHint}>
                        Try different keywords or{' '}
                        <span onClick={() => {
                            const input = document.querySelector(`.${styles.searchInput}`) as HTMLInputElement;
                            if (input) {
                                input.value = '';
                                input.focus();
                            }
                        }}>clear filters</span>
                    </span>
                </div>
            )}

            {groupedResults.map((group, groupIndex) => {
                const groupStartIndex = groupedResults
                    .slice(0, groupIndex)
                    .reduce((sum, g) => sum + g.results.length, 0);

                return (
                    <div key={group.type} className={styles.searchGroup}>
                        <div className={styles.searchGroupHeader}>
                            <group.icon size={14} />
                            <span>{group.label}</span>
                            <span className={styles.searchGroupCount}>{group.results.length}</span>
                        </div>
                        {group.results.map((result, idx) => {
                            const globalIndex = groupStartIndex + idx;
                            const isSelected = globalIndex === selectedIndex;
                            const Icon = getTypeIcon(result.type);

                            return (
                                <div
                                    key={result.id}
                                    data-index={globalIndex}
                                    className={`${styles.resultItem} ${isSelected ? styles.selected : ''}`}
                                    onClick={() => handleSelect(result.id)}
                                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                                >
                                    <div className={styles.resultCardAccent}
                                        style={{
                                            background: result.type === 'note'
                                                ? 'linear-gradient(180deg, #8b5cf6, #6d28d9)'
                                                : result.type === 'kanban'
                                                ? 'linear-gradient(180deg, #f59e0b, #d97706)'
                                                : 'linear-gradient(180deg, #06b6d4, #0891b2)'
                                        }}
                                    />
                                    <div className={styles.resultIcon}>
                                        <Icon size={16} />
                                    </div>
                                    <div className={styles.resultContent}>
                                        <div className={styles.resultTitleRow}>
                                            <span
                                                className={styles.resultTitle}
                                                dangerouslySetInnerHTML={{
                                                    __html: highlightMatch(result.label, parseSearchQuery(query).text)
                                                }}
                                            />
                                            {result.status && (
                                                <span className={`${styles.resultBadge} ${styles[`status_${result.status}`] || ''}`}>
                                                    {result.status}
                                                </span>
                                            )}
                                        </div>

                                        <div className={styles.resultMeta}>
                                            {result.priority && (
                                                <span className={styles.metaItem}>
                                                    <span className={styles.priorityDot}
                                                        style={{ background: getPriorityColor(result.priority) }}
                                                    />
                                                    {result.priority}
                                                </span>
                                            )}
                                            {result.tags?.slice(0, 3).map((tag: string) => (
                                                <span key={tag} className={styles.metaItem}>
                                                    <Hash size={10} /> {tag}
                                                </span>
                                            ))}
                                            {result.tags && result.tags.length > 3 && (
                                                <span className={styles.metaItem}>+{result.tags.length - 3}</span>
                                            )}
                                            {result.updatedAt && (
                                                <span className={styles.metaItem}>
                                                    <Clock size={10} /> {formatDate(result.updatedAt)}
                                                </span>
                                            )}
                                            {result.wordCount !== undefined && result.wordCount > 0 && (
                                                <span className={styles.metaItem}>
                                                    {result.wordCount} words
                                                </span>
                                            )}
                                        </div>

                                        {result.previewContext && (
                                            <div className={styles.resultPreview}>
                                                <span dangerouslySetInnerHTML={{
                                                    __html: highlightMatch(result.previewContext, parseSearchQuery(query).text)
                                                }} />
                                            </div>
                                        )}

                                        {result.path && result.path.length > 1 && (
                                            <div className={styles.resultPath}>
                                                <CornerDownRight size={10} />
                                                {result.path.slice(0, -1).map((seg, i) => (
                                                    <span key={seg.id} className={styles.pathSegment}>
                                                        {seg.label}
                                                        {i < result.path.length - 2 && (
                                                            <span className={styles.pathSeparator}>/</span>
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className={styles.resultRight}>
                                        <div className={styles.scoreBar}>
                                            <div
                                                className={styles.scoreBarFill}
                                                style={{ width: `${getScoreWidth(result.score, maxScore)}%` }}
                                            />
                                        </div>
                                        {isSelected && <ChevronRight size={14} className={styles.enterIcon} />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
