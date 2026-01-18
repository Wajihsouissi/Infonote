import { SearchResults } from './SearchResults';
import {
    Plus,
    LayoutGrid,
    KanbanSquare,
    Search,
    X,
    Filter,
    Tag,
    Calendar,
    Flag,
    CheckCircle
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import styles from './BottomMenu.module.css';
import { MENU_ITEMS } from '../editor/menuConstants';
import { StorageControls } from './StorageControls';
import { parseSearchQuery } from './searchUtils';

export function BottomMenu() {
    // Atomic Selectors
    const addNode = useStore(s => s.addNode);
    const nodes = useStore(s => s.nodes);
    
    const { screenToFlowPosition } = useReactFlow();
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const activeFilters = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

    // Extract all unique tags from nodes
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        nodes.forEach(node => {
            const nodeTags = (node.data as any).tags;
            if (Array.isArray(nodeTags)) {
                nodeTags.forEach(tag => tags.add(tag));
            }
        });
        return Array.from(tags);
    }, [nodes]);

    const toggleFilter = (key: string, value: string) => {
        const filters = { ...activeFilters };
        if (key === 'tag') {
            if (filters.tags.includes(value)) {
                filters.tags = filters.tags.filter(t => t !== value);
            } else {
                filters.tags.push(value);
            }
        } else if ((filters as any)[key] === value) {
            delete (filters as any)[key];
        } else {
            (filters as any)[key] = value;
        }

        // Reconstruct query string
        let newQuery = filters.text;
        filters.tags.forEach(t => newQuery += ` #${t}`);
        if (filters.status) newQuery += ` status:${filters.status}`;
        if (filters.priority) newQuery += ` priority:${filters.priority}`;
        if (filters.type) newQuery += ` is:${filters.type}`;
        if (filters.date) newQuery += ` date:${filters.date}`;
        if (filters.startDate) newQuery += ` after:${filters.startDate}`;
        if (filters.endDate) newQuery += ` before:${filters.endDate}`;

        setSearchQuery(newQuery.trim());
    };

    const handleAddNote = () => {
        addNode('note', { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 }, { viewMode: 'expanded' }, { width: 432, height: 432 });
    };

    const handleDragStart = (e: React.DragEvent, type: string, metadata?: any) => {
        e.dataTransfer.setData('application/reactflow-block-type', type);
        if (metadata) {
            e.dataTransfer.setData('application/infonote-block-metadata', JSON.stringify(metadata));
        }
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleBlockClick = (block: typeof MENU_ITEMS[0]) => {
        // Calculate center of viewport
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });

        // Add random offset to prevent exact overlap
        const offsetRange = 30;
        const offsetX = (Math.random() - 0.5) * offsetRange * 2;
        const offsetY = (Math.random() - 0.5) * offsetRange * 2;

        const BLOCK_WIDTH = 300;
        const BLOCK_HEIGHT = 100;

        const position = {
            x: flowPos.x - (BLOCK_WIDTH / 2) + offsetX,
            y: flowPos.y - (BLOCK_HEIGHT / 2) + offsetY
        };

        const newBlock = {
            id: uuidv4(),
            type: block.type,
            content: '',
            metadata: block.meta
        };

        addNode('block', position, {
            content: [newBlock]
        }, { width: BLOCK_WIDTH, height: BLOCK_HEIGHT });
    };

    return (
        <div className={styles.bottomMenu}>
            {isSearchMode ? (
                <div className={styles.searchContainer}>
                    <SearchResults
                        query={searchQuery}
                        onClose={() => {
                            setIsSearchMode(false);
                            setSearchQuery('');
                        }}
                    />
                    <Search size={20} className="text-muted-foreground" style={{ opacity: 0.5, marginLeft: 12 }} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search... (Try #tag, status:todo, is:note)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                    
                    <button 
                        className={`${styles.filterToggleBtn} ${showFilters ? styles.active : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                        title="Filters"
                    >
                        <Filter size={16} />
                    </button>

                    <button
                        className={styles.closeSearchBtn}
                        onClick={() => {
                            setIsSearchMode(false);
                            setSearchQuery('');
                            setShowFilters(false);
                        }}
                        title="Close Search"
                    >
                        <X size={16} />
                    </button>

                    {showFilters && (
                        <div className={styles.filterPanel}>
                            <div className={styles.filterGroup}>
                                <label><Tag size={12} /> Tags</label>
                                <div className={styles.filterChips}>
                                    {allTags.map(tag => (
                                        <span 
                                            key={tag} 
                                            className={`${styles.filterChip} ${activeFilters.tags.includes(tag.toLowerCase()) ? styles.selected : ''}`}
                                            onClick={() => toggleFilter('tag', tag.toLowerCase())}
                                        >
                                            #{tag}
                                        </span>
                                    ))}
                                    {allTags.length === 0 && <span className={styles.emptyText}>No tags found</span>}
                                </div>
                            </div>

                            <div className={styles.filterRow}>
                                <div className={styles.filterGroup}>
                                    <label><CheckCircle size={12} /> Status</label>
                                    <div className={styles.filterChips}>
                                        {['todo', 'in-progress', 'done', 'backlog'].map(s => (
                                            <span 
                                                key={s} 
                                                className={`${styles.filterChip} ${activeFilters.status === s ? styles.selected : ''}`}
                                                onClick={() => toggleFilter('status', s)}
                                            >
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.filterGroup}>
                                    <label><Flag size={12} /> Priority</label>
                                    <div className={styles.filterChips}>
                                        {['low', 'medium', 'high', 'urgent'].map(p => (
                                            <span 
                                                key={p} 
                                                className={`${styles.filterChip} ${activeFilters.priority === p ? styles.selected : ''}`}
                                                onClick={() => toggleFilter('priority', p)}
                                            >
                                                {p}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.filterRow}>
                                <div className={styles.filterGroup}>
                                    <label><Calendar size={12} /> Type</label>
                                    <div className={styles.filterChips}>
                                        {['note', 'kanban', 'block'].map(t => (
                                            <span 
                                                key={t} 
                                                className={`${styles.filterChip} ${activeFilters.type === t ? styles.selected : ''}`}
                                                onClick={() => toggleFilter('is', t)}
                                            >
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.filterGroup}>
                                    <label><Calendar size={12} /> Time</label>
                                    <div className={styles.filterChips}>
                                        <span 
                                            className={`${styles.filterChip} ${activeFilters.startDate === new Date().toISOString().split('T')[0] ? styles.selected : ''}`}
                                            onClick={() => toggleFilter('after', new Date().toISOString().split('T')[0])}
                                        >
                                            Today
                                        </span>
                                        <span 
                                            className={`${styles.filterChip} ${activeFilters.date?.includes(new Date().toISOString().split('T')[0].substring(0, 7)) ? styles.selected : ''}`}
                                            onClick={() => toggleFilter('date', new Date().toISOString().split('T')[0].substring(0, 7))}
                                        >
                                            This Month
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <StorageControls />

                    <div className={styles.separator} />

                    <button
                        className={styles.iconBtn}
                        onClick={() => setIsSearchMode(true)}
                        title="Search"
                    >
                        <Search size={20} />
                    </button>



                    <button className={styles.mainAddBtn} onClick={handleAddNote} title="Add New Note Card">
                        <Plus size={24} />
                    </button>

                    <button className={styles.iconBtn} onClick={() => useStore.getState().setKanbanModalOpen(true)} title="New Kanban Board" style={{ marginLeft: 8 }}>
                        <KanbanSquare size={20} />
                    </button>

                    <div className={styles.separator} />

                    <div className={styles.blocksWrapper}>
                        <button className={styles.iconBtn} title="Browse Blocks">
                            <LayoutGrid size={20} />
                        </button>

                        {/* Hover Menu */}
                        <div className={styles.hoverMenu}>
                            <h3 className={styles.menuTitle}>Blocks</h3>
                            <div className={styles.menuGrid}>
                                {MENU_ITEMS.map((block) => {
                                    const Icon = block.icon;
                                    return (
                                        <div
                                            key={block.label}
                                            className={styles.draggableItem}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, block.type, block.meta)}
                                            onClick={() => handleBlockClick(block)}
                                        >
                                            <div className={styles.itemIconWrapper}>
                                                <Icon size={20} />
                                            </div>
                                            <div className={styles.itemContent}>
                                                <div className={styles.itemLabel}>{block.label}</div>
                                                <div className={styles.itemDescription}>{block.description}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
