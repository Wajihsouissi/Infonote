import { useEffect, useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import styles from './BottomMenu.module.css';
import { FileText, Cuboid, ChevronRight, Hash, Flag, Clock, Search } from 'lucide-react';
import { highlightMatch, parseSearchQuery } from './searchUtils';

interface SearchResultsProps {
    query: string;
    onClose: () => void;
}

export function SearchResults({ query, onClose }: SearchResultsProps) {
    // Atomic Selectors
    const nodes = useStore(s => s.nodes);
    const navigateToNode = useStore(s => s.navigateToNode);
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const setSidePanelId = useStore(s => s.setSidePanelId);
    const setCenterPanelId = useStore(s => s.setCenterPanelId);

    const [results, setResults] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Initialize worker
    const worker = useMemo(() => new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' }), []);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        // Send task to worker
        worker.postMessage({ query, nodes });

        const handleMessage = (e: MessageEvent) => {
            setResults(e.data.results);
            setSelectedIndex(0);
        };

        worker.addEventListener('message', handleMessage);
        return () => worker.removeEventListener('message', handleMessage);
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

    const handleSelect = (nodeId: string) => {
        // Reset any panel states to ensure we see the canvas/node
        setFullscreenId(null);
        setSidePanelId(null);
        setCenterPanelId(null);

        navigateToNode(nodeId);
        onClose();
    };

    if (!query || results.length === 0) return null;

    return (
        <div className={styles.searchResults}>
            {results.map((result, index) => (
                <div
                    key={result.id}
                    className={`${styles.resultItem} ${index === selectedIndex ? styles.selected : ''}`}
                    onClick={() => handleSelect(result.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                >
                    <div className={styles.resultIcon}>
                        {result.type === 'note' ? <FileText size={16} /> : <Cuboid size={16} />}
                    </div>
                    <div className={styles.resultContent}>
                        <div className={styles.resultTitle}>
                            <span dangerouslySetInnerHTML={{ __html: highlightMatch(result.label, parseSearchQuery(query).text) }} />
                            {result.status && <span className={styles.resultBadge}>{result.status}</span>}
                        </div>
                        <div className={styles.resultMeta}>
                            {result.priority && (
                                <span className={`${styles.metaItem} ${styles[result.priority]}`}>
                                    <Flag size={10} /> {result.priority}
                                </span>
                            )}
                            {result.tags?.map((tag: string) => (
                                <span key={tag} className={styles.metaItem}>
                                    <Hash size={10} /> {tag}
                                </span>
                            ))}
                        </div>
                        {result.preview && (
                            <div className={styles.resultPreview}>
                                <span dangerouslySetInnerHTML={{ 
                                    __html: highlightMatch(
                                        result.preview.length > 80 ? result.preview.slice(0, 80) + '...' : result.preview,
                                        parseSearchQuery(query).text
                                    ) 
                                }} />
                            </div>
                        )}
                    </div>
                    {index === selectedIndex && <ChevronRight size={14} className={styles.enterIcon} />}
                </div>
            ))}
        </div>
    );
}
