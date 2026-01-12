import { SearchResults } from './SearchResults';
import {
    Plus,
    LayoutGrid,
    KanbanSquare,
    Search,
    X
} from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../../store/useStore';
import styles from './BottomMenu.module.css';
import { MENU_ITEMS } from '../editor/menuConstants';
import { StorageControls } from './StorageControls';

export function BottomMenu() {
    const { addNode } = useStore();
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const handleAddNote = () => {
        addNode('note', { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 });
    };

    const handleDragStart = (e: React.DragEvent, type: string, metadata?: any) => {
        e.dataTransfer.setData('application/reactflow-block-type', type);
        if (metadata) {
            e.dataTransfer.setData('application/infonote-block-metadata', JSON.stringify(metadata));
        }
        e.dataTransfer.effectAllowed = 'copy';
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
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                    <button
                        className={styles.closeSearchBtn}
                        onClick={() => {
                            setIsSearchMode(false);
                            setSearchQuery('');
                        }}
                        title="Close Search"
                    >
                        <X size={16} />
                    </button>
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
