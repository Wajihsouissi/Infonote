import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import type { KanbanColumn, KanbanNode, NoteData } from '../../types';
import styles from './KanbanConfigModal.module.css';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DEFAULT_COLUMNS: KanbanColumn[] = [
    { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
    { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
    { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' }
];

// Sortable Item Component
const SortableColumnRow = ({ column, updateColumn, removeColumn, canDelete }: any) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: column.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className={styles.columnRow}>
            <div {...attributes} {...listeners} className={styles.dragHandle}>
                <GripVertical size={16} color="#666" />
            </div>
            <div className={styles.colorIndicator} style={{ background: column.color }} />
            <input
                type="text"
                value={column.label}
                onChange={e => updateColumn(column.id, 'label', e.target.value)}
                className={styles.colInput}
                placeholder="Label"
            />
            <input
                type="text"
                value={column.statusValue}
                onChange={e => updateColumn(column.id, 'statusValue', e.target.value)}
                className={`${styles.colInput} ${styles.statusInput}`}
                placeholder="Status Value"
                title="The status value used for cards"
            />
            <button
                type="button"
                onClick={() => removeColumn(column.id)}
                className={styles.deleteBtn}
                disabled={!canDelete}
            >
                <Trash2 size={16} />
            </button>
        </div>
    );
};

export function KanbanConfigModal() {
    // Atomic Selectors
    const isKanbanModalOpen = useStore(s => s.isKanbanModalOpen);
    const setKanbanModalOpen = useStore(s => s.setKanbanModalOpen);
    const setEditingKanbanId = useStore(s => s.setEditingKanbanId);
    const addNode = useStore(s => s.addNode);
    const updateNodeData = useStore(s => s.updateNodeData);
    const editingKanbanId = useStore(s => s.editingKanbanId);
    const nodes = useStore(s => s.nodes);

    const [boardName, setBoardName] = useState('My Board');
    const [background, setBackground] = useState<string>(''); // '' = default/glass
    const [columns, setColumns] = useState<KanbanColumn[]>(DEFAULT_COLUMNS);

    // Load existing data if editing
    useEffect(() => {
        if (isKanbanModalOpen && editingKanbanId) {
            const node = nodes.find(n => n.id === editingKanbanId) as KanbanNode;
            if (node) {
                setBoardName(node.data.label);
                setBackground(node.data.background || '');
                setColumns(node.data.columns || []);
            }
        } else if (isKanbanModalOpen && !editingKanbanId) {
            // Reset for new creation
            setBoardName('My Board');
            setBackground('');
            setColumns(DEFAULT_COLUMNS);
        }
    }, [isKanbanModalOpen, editingKanbanId, nodes]);


    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setColumns((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };


    if (!isKanbanModalOpen) return null;

    const handleAddColumn = () => {
        const id = `col-${Date.now()}`;
        setColumns([...columns, {
            id,
            label: 'New Column',
            statusValue: `status-${Math.floor(Math.random() * 1000)}`,
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

    const onClose = () => {
        setKanbanModalOpen(false);
        setEditingKanbanId(null);
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingKanbanId) {
            // --- EDIT MODE ---

            // 1. Identify Deleted Statuses
            const node = nodes.find(n => n.id === editingKanbanId) as KanbanNode;
            const oldColumns = node.data.columns || [];
            const newStatusValues = new Set(columns.map(c => c.statusValue));
            const removedStatuses = oldColumns
                .map(c => c.statusValue)
                .filter(s => !newStatusValues.has(s));

            // 2. Update Board Data
            updateNodeData(editingKanbanId, {
                label: boardName,
                columns,
                background
            });

            // 3. Handle Orphaned Cards
            // If statuses were removed, move those cards to first column
            if (removedStatuses.length > 0) {
                const fallbackStatus = columns[0]?.statusValue || 'todo';
                // Find all child notes of this board
                const childNotes = nodes.filter(n => n.parentId === editingKanbanId && n.type === 'note');

                childNotes.forEach(note => {
                    const noteData = note.data as unknown as NoteData;
                    const noteStatus = noteData.status;
                    if (noteStatus && removedStatuses.includes(noteStatus)) {
                        updateNodeData(note.id, { status: fallbackStatus });
                    }
                });
            }

        } else {
            // --- CREATE MODE ---
            const x = 400 + Math.random() * 50;
            const y = 200 + Math.random() * 50;

            // @ts-ignore
            addNode('kanban', { x, y }, {
                label: boardName,
                columns: columns,
                background
            }, { width: 700, height: 500 });
        }

        onClose();
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>{editingKanbanId ? 'Edit Board' : 'Add Kanban Board'}</h2>
                    <button onClick={onClose} className={styles.closeBtn}>
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

                    <div className={styles.fieldGroup}>
                        <label>Background</label>
                        <div className={styles.backgroundOptions}>
                            {[
                                { id: '', label: 'Glass' },
                                { id: 'dots', label: 'Dots' },
                                { id: 'grid', label: 'Grid' },
                                { id: 'gradient-blue', label: 'Blue' },
                                { id: 'gradient-purple', label: 'Purple' }
                            ].map(bg => (
                                <button
                                    key={bg.id}
                                    type="button"
                                    className={`${styles.bgOption} ${background === bg.id ? styles.bgOptionActive : ''}`}
                                    onClick={() => setBackground(bg.id)}
                                >
                                    {bg.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.columnsSection}>
                        <div className={styles.sectionHeader}>
                            <label>Columns (Drag to Reorder)</label>
                            <button type="button" onClick={handleAddColumn} className={styles.addColBtn}>
                                <Plus size={16} /> Add Column
                            </button>
                        </div>

                        <div className={styles.columnsList}>
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={columns.map(c => c.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {columns.map((col) => (
                                        <SortableColumnRow
                                            key={col.id}
                                            column={col}
                                            updateColumn={updateColumn}
                                            removeColumn={removeColumn}
                                            canDelete={columns.length > 1}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                        </div>
                    </div>

                    <div className={styles.actions}>
                        <button type="button" onClick={onClose} className={styles.cancelBtn}>
                            Cancel
                        </button>
                        <button type="submit" className={styles.submitBtn}>
                            {editingKanbanId ? 'Save Changes' : 'Create Board'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
