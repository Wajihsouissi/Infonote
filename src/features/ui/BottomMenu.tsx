import {
    Plus,
    LayoutGrid,
    KanbanSquare
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './BottomMenu.module.css';
import { MENU_ITEMS } from '../editor/menuConstants';
import { StorageControls } from './StorageControls';

export function BottomMenu() {
    const { addNode } = useStore();

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
            <StorageControls />

            <div className={styles.separator} />

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
                    <div className={styles.menuGrid}>
                        {MENU_ITEMS.map((block) => {
                            const Icon = block.icon;
                            return (
                                <div
                                    key={block.label}
                                    className={styles.draggableItem}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, block.type, block.meta)}
                                    title={block.label}
                                >
                                    <Icon size={18} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
