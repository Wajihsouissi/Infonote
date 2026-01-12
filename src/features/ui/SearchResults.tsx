import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import styles from './BottomMenu.module.css';
import { FileText, Cuboid, ChevronRight } from 'lucide-react';

interface SearchResultsProps {
    query: string;
    onClose: () => void;
}

export function SearchResults({ query, onClose }: SearchResultsProps) {
    const { nodes, navigateToNode, setFullscreenId, setSidePanelId, setCenterPanelId } = useStore();
    const [results, setResults] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const lowerQuery = query.toLowerCase();
        const filtered = nodes.filter(node => {
            if (!node || !node.data) return false;
            const data = node.data as any;

            const label = String(data.label || '').toLowerCase();
            const content = String(data.content || '').toLowerCase();
            const description = String(data.description || '').toLowerCase();

            return label.includes(lowerQuery) ||
                content.includes(lowerQuery) ||
                description.includes(lowerQuery);
        }).map(node => {
            const data = node.data as any;
            return {
                id: node.id,
                label: String(data.label || 'Untitled'),
                type: node.type,
                preview: String(data.description || data.content || '')
            };
        }).slice(0, 5); // Limit to 5 results

        setResults(filtered);
        setSelectedIndex(0);
    }, [query, nodes]);

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
                        <div className={styles.resultTitle}>{result.label}</div>
                        {result.preview && (
                            <div className={styles.resultPreview}>
                                {result.preview.slice(0, 40)}{result.preview.length > 40 ? '...' : ''}
                            </div>
                        )}
                    </div>
                    {index === selectedIndex && <ChevronRight size={14} className={styles.enterIcon} />}
                </div>
            ))}
        </div>
    );
}
