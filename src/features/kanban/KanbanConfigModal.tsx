import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { X, Plus, Trash2 } from 'lucide-react';
import type { KanbanColumn } from '../../types';
import styles from './KanbanConfigModal.module.css';

const DEFAULT_COLUMNS: KanbanColumn[] = [
    { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
    { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
    { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' }
];

export function KanbanConfigModal() {
    const { isKanbanModalOpen, setKanbanModalOpen, addNode } = useStore() as any; // Cast for now as we updated types

    const [boardName, setBoardName] = useState('My Board');
    const [columns, setColumns] = useState<KanbanColumn[]>(DEFAULT_COLUMNS);

    if (!isKanbanModalOpen) return null;

    const handleAddColumn = () => {
        const id = `col-${Date.now()}`;
        setColumns([...columns, {
            id,
            label: 'New Column',
            statusValue: 'new-status',
            color: '#888888'
        }]);
    };

    const updateColumn = (id: string, field: keyof KanbanColumn, value: string) => {
        setColumns(cols => cols.map(c =>
            c.id === id ? { ...c, [field]: value } : c
        ));
    };

    const removeColumn = (id: string) => {
        setColumns(cols => cols.filter(c => c.id !== id));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Calculate center position
        // We'll just put it in the center of the viewport roughly, or offset from 0,0
        // Ideally we use getViewport() but we can lazily place it at center of screen if we had access to center.
        // For now, let's place it at a default location + random offset to avoid exact overlap
        const x = 400 + Math.random() * 50;
        const y = 200 + Math.random() * 50;

        addNode('kanban', { x, y }, {
            label: boardName,
            columns: columns
        }, { width: 700, height: 500 });

        setKanbanModalOpen(false);
        // Reset state
        setBoardName('My Board');
        setColumns(DEFAULT_COLUMNS);
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>Add Kanban Board</h2>
                    <button onClick={() => setKanbanModalOpen(false)} className={styles.closeBtn}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className={styles.fieldGroup}>
                        <label>Board Name</label>
                        <input
                            type="text"
                            value={boardName}
                            onChange={e => setBoardName(e.target.value)}
                            className={styles.input}
                            autoFocus
                        />
                    </div>

                    <div className={styles.columnsSection}>
                        <div className={styles.sectionHeader}>
                            <label>Columns</label>
                            <button type="button" onClick={handleAddColumn} className={styles.addColBtn}>
                                <Plus size={16} /> Add Column
                            </button>
                        </div>

                        <div className={styles.columnsList}>
                            {columns.map((col) => (
                                <div key={col.id} className={styles.columnRow}>
                                    <div className={styles.colorIndicator} style={{ background: col.color }} />
                                    <input
                                        type="text"
                                        value={col.label}
                                        onChange={e => updateColumn(col.id, 'label', e.target.value)}
                                        className={styles.colInput}
                                        placeholder="Label"
                                    />
                                    <input
                                        type="text"
                                        value={col.statusValue}
                                        onChange={e => updateColumn(col.id, 'statusValue', e.target.value)}
                                        className={`${styles.colInput} ${styles.statusInput}`}
                                        placeholder="Status Value"
                                        title="The status value written to card metadata"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeColumn(col.id)}
                                        className={styles.deleteBtn}
                                        disabled={columns.length <= 1}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.actions}>
                        <button type="button" onClick={() => setKanbanModalOpen(false)} className={styles.cancelBtn}>
                            Cancel
                        </button>
                        <button type="submit" className={styles.submitBtn}>
                            Create Board
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
