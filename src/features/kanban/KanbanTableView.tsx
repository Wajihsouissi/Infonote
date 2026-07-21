import { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, User, Flag, Plus, GripVertical, PlusCircle, X, Tag, Link, BarChart3, FileText, FolderOpen } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { NoteNode, KanbanColumn, NoteData } from '../../types';

/** Value of an extra (metadata) table cell. */
type CellValue = string | number | string[];
import styles from './KanbanTableView.module.css';

// --- Types ---

interface TableColumnDef {
    id: string;
    label: string;
    icon: React.ElementType;
    isDefault?: boolean;
    field: string;
}

type EditingCell = { cardId: string; columnId: string } | null;

interface KanbanTableViewProps {
    cards: NoteNode[];
    columns: KanbanColumn[];
    onCardClick: (node: NoteNode) => void;
    onAddCard: (statusValue: string) => void;
    onReorderCards: (orderedIds: string[]) => void;
    onUpdateCard: (cardId: string, data: Partial<NoteData>) => void;
    visibleExtraColumns: string[];
    onVisibleExtraColumnsChange: (cols: string[]) => void;
}

// --- Column Definitions ---

const DEFAULT_COLUMNS: TableColumnDef[] = [
    { id: 'title', label: 'Title', icon: FileText, isDefault: true, field: 'label' },
    { id: 'status', label: 'Status', icon: FolderOpen, isDefault: true, field: 'status' },
    { id: 'priority', label: 'Priority', icon: Flag, isDefault: true, field: 'priority' },
    { id: 'assignee', label: 'Assignee', icon: User, isDefault: true, field: 'assignee' },
    { id: 'dueDate', label: 'Due Date', icon: Calendar, isDefault: true, field: 'dueDate' },
    { id: 'created', label: 'Created', icon: Clock, isDefault: true, field: 'createdAt' },
];

const EXTRA_COLUMNS: TableColumnDef[] = [
    { id: 'tags', label: 'Tags', icon: Tag, field: 'tags' },
    { id: 'url', label: 'URL', icon: Link, field: 'url' },
    { id: 'progress', label: 'Progress', icon: BarChart3, field: 'progress' },
    { id: 'description', label: 'Description', icon: FileText, field: 'description' },
    { id: 'category', label: 'Category', icon: FolderOpen, field: 'category' },
];

const priorityConfig: Record<string, { label: string; color: string }> = {
    urgent: { label: 'Urgent', color: '#ef4444' },
    high: { label: 'High', color: '#f97316' },
    medium: { label: 'Medium', color: '#eab308' },
    low: { label: 'Low', color: '#22c55e' },
};

const PRIORITY_OPTIONS = ['urgent', 'high', 'medium', 'low'] as const;

// --- Helpers ---

function formatRelativeTime(dateStr?: string): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays > 30) return date.toLocaleDateString();
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHr > 0) return `${diffHr}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return 'Just now';
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(dateStr?: string): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
}

// --- Inline Editors ---

const InlineTextInput = ({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) => {
    const [val, setVal] = useState(value);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
    return (
        <input
            ref={ref}
            className={styles.inlineInput}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={() => onSave(val)}
            onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onSave(value); }}
            placeholder={placeholder}
            onClick={e => e.stopPropagation()}
        />
    );
};

const InlineDateInput = ({ value, onSave }: { value: string; onSave: (v: string) => void }) => {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); }, []);
    return (
        <input
            ref={ref}
            type="date"
            className={styles.inlineDateInput}
            defaultValue={value ? value.split('T')[0] : ''}
            onBlur={e => onSave(e.target.value ? new Date(e.target.value).toISOString() : '')}
            onChange={e => onSave(e.target.value ? new Date(e.target.value).toISOString() : '')}
            onClick={e => e.stopPropagation()}
        />
    );
};

const InlineSelect = ({ value, options, onSave, anchorRef }: { value: string; options: { value: string; label: string; color?: string }[]; onSave: (v: string) => void; anchorRef?: React.RefObject<HTMLElement | null> }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    // Position the dropdown relative to the anchor element (the <td>)
    useEffect(() => {
        const anchor = anchorRef?.current;
        if (anchor) {
            const rect = anchor.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.left });
        }
    }, [anchorRef]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onSave(value);
        };
        document.addEventListener('pointerdown', handler, true);
        return () => document.removeEventListener('pointerdown', handler, true);
    }, [value, onSave]);

    return createPortal(
        <div
            ref={ref}
            className={styles.inlineSelect}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
            onClick={e => e.stopPropagation()}
        >
            {options.map(opt => (
                <div
                    key={opt.value}
                    className={`${styles.inlineSelectOption} ${opt.value === value ? styles.inlineSelectActive : ''}`}
                    onClick={() => onSave(opt.value)}
                >
                    {opt.color && <span className={styles.statusDot} style={{ backgroundColor: opt.color }} />}
                    {opt.label}
                </div>
            ))}
        </div>,
        document.body
    );
};

// --- Sortable Row ---

const SortableRow = memo(({
    card,
    columnColorMap,
    statusOptions,
    onCardClick,
    activeExtraCols,
    editingCell,
    onCellClick,
    onCellSave,
}: {
    card: NoteNode;
    columnColorMap: Record<string, { label: string; color: string }>;
    statusOptions: { value: string; label: string; color?: string }[];
    onCardClick: (node: NoteNode) => void;
    activeExtraCols: TableColumnDef[];
    editingCell: EditingCell;
    onCellClick: (cardId: string, columnId: string) => void;
    onCellSave: (cardId: string, field: string, value: CellValue) => void;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: card.id });

    // Click timer: single-click = edit cell (250ms delay), double-click = open card
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCellInteraction = useCallback((colId: string) => {
        if (clickTimerRef.current) {
            // Second click within 250ms => double-click => open card
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
            onCardClick(card);
        } else {
            // First click => wait 250ms then enter edit mode
            clickTimerRef.current = setTimeout(() => {
                clickTimerRef.current = null;
                onCellClick(card.id, colId);
            }, 250);
        }
    }, [card, onCardClick, onCellClick]);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative' as const,
        zIndex: isDragging ? 100 : undefined,
    };

    const statusCellRef = useRef<HTMLTableCellElement>(null);
    const priorityCellRef = useRef<HTMLTableCellElement>(null);

    const isEditing = (colId: string) => editingCell?.cardId === card.id && editingCell?.columnId === colId;

    const statusInfo = columnColorMap[card.data.status || ''];
    const priorityInfo = card.data.priority ? priorityConfig[card.data.priority] : null;
    const overdue = isOverdue(card.data.dueDate);

    return (
        <tr
            ref={setNodeRef}
            style={style}
            className={`${styles.row} ${isDragging ? styles.rowDragging : ''}`}
        >
            {/* Drag Handle */}
            <td className={styles.cellHandle}>
                <div {...attributes} {...listeners} className={styles.dragHandle} onClick={e => e.stopPropagation()}>
                    <GripVertical size={14} />
                </div>
            </td>

            {/* Title */}
            <td className={styles.cellTitle} onClick={() => handleCellInteraction('title')}>
                {isEditing('title') ? (
                    <InlineTextInput value={card.data.label || ''} onSave={v => onCellSave(card.id, 'label', v)} placeholder="Untitled" />
                ) : (
                    <>
                        <span className={styles.titleText}>{card.data.label || 'Untitled'}</span>
                        {card.data.description && (
                            <span className={styles.descriptionHint}>
                                {card.data.description.slice(0, 50)}{card.data.description.length > 50 ? '…' : ''}
                            </span>
                        )}
                    </>
                )}
            </td>

            {/* Status */}
            <td ref={statusCellRef} className={styles.cellStatus} onClick={() => handleCellInteraction('status')}>
                {isEditing('status') ? (
                    <InlineSelect value={card.data.status || ''} options={statusOptions} onSave={v => onCellSave(card.id, 'status', v)} anchorRef={statusCellRef} />
                ) : statusInfo ? (
                    <span className={styles.statusPill} style={{ backgroundColor: `${statusInfo.color}22`, color: statusInfo.color, borderColor: `${statusInfo.color}44` }}>
                        <span className={styles.statusDot} style={{ backgroundColor: statusInfo.color }} />
                        {statusInfo.label}
                    </span>
                ) : (
                    <span className={styles.muted}>—</span>
                )}
            </td>

            {/* Priority */}
            <td ref={priorityCellRef} className={styles.cellPriority} onClick={() => handleCellInteraction('priority')}>
                {isEditing('priority') ? (
                    <InlineSelect
                        value={card.data.priority || ''}
                        options={PRIORITY_OPTIONS.map(p => ({ value: p, label: priorityConfig[p].label, color: priorityConfig[p].color }))}
                        onSave={v => onCellSave(card.id, 'priority', v)}
                        anchorRef={priorityCellRef}
                    />
                ) : priorityInfo ? (
                    <span className={styles.priorityBadge}>
                        <Flag size={12} style={{ color: priorityInfo.color }} />
                        <span style={{ color: priorityInfo.color }}>{priorityInfo.label}</span>
                    </span>
                ) : (
                    <span className={styles.muted}>—</span>
                )}
            </td>

            {/* Assignee */}
            <td className={styles.cellAssignee} onClick={() => handleCellInteraction('assignee')}>
                {isEditing('assignee') ? (
                    <InlineTextInput value={card.data.assignee || ''} onSave={v => onCellSave(card.id, 'assignee', v)} placeholder="Assignee" />
                ) : card.data.assignee ? (
                    <span className={styles.assigneeBadge}><User size={12} />{card.data.assignee}</span>
                ) : (
                    <span className={styles.muted}>—</span>
                )}
            </td>

            {/* Due Date */}
            <td className={`${styles.cellDueDate} ${overdue ? styles.overdue : ''}`} onClick={() => handleCellInteraction('dueDate')}>
                {isEditing('dueDate') ? (
                    <InlineDateInput value={card.data.dueDate || ''} onSave={v => onCellSave(card.id, 'dueDate', v)} />
                ) : card.data.dueDate ? (
                    <span className={styles.dateBadge}><Calendar size={12} />{formatDate(card.data.dueDate)}</span>
                ) : (
                    <span className={styles.muted}>—</span>
                )}
            </td>

            {/* Created (read-only) */}
            <td className={styles.cellCreated}>
                {card.data.createdAt ? (
                    <span className={styles.dateBadge}><Clock size={12} />{formatRelativeTime(card.data.createdAt)}</span>
                ) : (
                    <span className={styles.muted}>—</span>
                )}
            </td>

            {/* Extra Columns */}
            {activeExtraCols.map(col => (
                <td key={col.id} className={styles.cellExtra} onClick={() => handleCellInteraction(col.id)}>
                    {isEditing(col.id) ? (
                        renderExtraCellEditor(card, col, (v) => onCellSave(card.id, col.field, v))
                    ) : (
                        renderExtraCell(card, col)
                    )}
                </td>
            ))}
        </tr>
    );
});

// --- Extra Cell Renderers ---

function renderExtraCell(card: NoteNode, col: TableColumnDef): React.ReactNode {
    const value = (card.data as unknown as Record<string, CellValue | undefined>)[col.field];
    if (value === undefined || value === null || value === '') return <span className={styles.muted}>—</span>;

    switch (col.id) {
        case 'tags':
            if (!Array.isArray(value) || value.length === 0) return <span className={styles.muted}>—</span>;
            return (
                <div className={styles.tagsList}>
                    {value.slice(0, 3).map((tag: string) => <span key={tag} className={styles.tagChip}>#{tag}</span>)}
                    {value.length > 3 && <span className={styles.muted}>+{value.length - 3}</span>}
                </div>
            );
        case 'url':
            try {
                return <a href={String(value)} className={styles.urlLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{new URL(String(value)).hostname}</a>;
            } catch { return <span className={styles.muted}>{String(value)}</span>; }
        case 'progress':
            const pct = Math.min(100, Math.max(0, Number(value)));
            return (
                <div className={styles.progressCell}>
                    <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
                    <span className={styles.progressText}>{pct}%</span>
                </div>
            );
        case 'description':
            return <span className={styles.descriptionCell}>{String(value).slice(0, 60)}{String(value).length > 60 ? '…' : ''}</span>;
        case 'category':
            return <span className={styles.categoryChip}>{String(value)}</span>;
        default:
            return <span>{String(value)}</span>;
    }
}

function renderExtraCellEditor(card: NoteNode, col: TableColumnDef, onSave: (v: CellValue) => void): React.ReactNode {
    const value = (card.data as unknown as Record<string, CellValue | undefined>)[col.field];
    switch (col.id) {
        case 'tags':
            return <InlineTextInput value={Array.isArray(value) ? value.join(', ') : ''} onSave={v => onSave(v.split(',').map((s: string) => s.trim()).filter(Boolean))} placeholder="tag1, tag2" />;
        case 'url':
            return <InlineTextInput value={String(value ?? '')} onSave={onSave} placeholder="https://..." />;
        case 'progress':
            return <InlineTextInput value={String(value ?? '')} onSave={v => onSave(Math.min(100, Math.max(0, parseInt(v) || 0)))} placeholder="0-100" />;
        case 'description':
            return <InlineTextInput value={String(value ?? '')} onSave={onSave} placeholder="Description" />;
        case 'category':
            return <InlineTextInput value={String(value ?? '')} onSave={onSave} placeholder="Category" />;
        default:
            return <InlineTextInput value={String(value ?? '')} onSave={onSave} />;
    }
}

// --- Main Component ---

export const KanbanTableView = memo(({
    cards,
    columns,
    onCardClick,
    onAddCard,
    onReorderCards,
    onUpdateCard,
    visibleExtraColumns,
    onVisibleExtraColumnsChange,
}: KanbanTableViewProps) => {
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [editingCell, setEditingCell] = useState<EditingCell>(null);

    const columnColorMap = useMemo(() => {
        const map: Record<string, { label: string; color: string }> = {};
        columns.forEach(col => { map[col.statusValue] = { label: col.label, color: col.color || '#666' }; });
        return map;
    }, [columns]);

    const statusOptions = useMemo(() =>
        columns.map(col => ({ value: col.statusValue, label: col.label, color: col.color })),
        [columns]);

    const activeExtraCols = useMemo(() => EXTRA_COLUMNS.filter(c => visibleExtraColumns.includes(c.id)), [visibleExtraColumns]);
    const availableExtraCols = useMemo(() => EXTRA_COLUMNS.filter(c => !visibleExtraColumns.includes(c.id)), [visibleExtraColumns]);

    const totalColCount = DEFAULT_COLUMNS.length + 1 + activeExtraCols.length + 1;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = cards.findIndex(c => c.id === active.id);
        const newIndex = cards.findIndex(c => c.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(cards, oldIndex, newIndex);
        onReorderCards(reordered.map(c => c.id));
    }, [cards, onReorderCards]);

    const toggleExtraColumn = useCallback((colId: string) => {
        if (visibleExtraColumns.includes(colId)) {
            onVisibleExtraColumnsChange(visibleExtraColumns.filter(c => c !== colId));
        } else {
            onVisibleExtraColumnsChange([...visibleExtraColumns, colId]);
        }
    }, [visibleExtraColumns, onVisibleExtraColumnsChange]);

    const handleCellClick = useCallback((cardId: string, columnId: string) => {
        // Don't allow editing read-only fields
        if (columnId === 'created') return;
        setEditingCell({ cardId, columnId });
    }, []);

    const handleCellSave = useCallback((cardId: string, field: string, value: CellValue) => {
        onUpdateCard(cardId, { [field]: value } as Partial<NoteData>);
        setEditingCell(null);
    }, [onUpdateCard]);

    const defaultStatus = columns[0]?.statusValue || 'todo';

    // Close editing when clicking outside table (but not when clicking portaled dropdowns)
    const wrapperRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!editingCell) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Don't close if clicking inside the table wrapper
            if (wrapperRef.current && wrapperRef.current.contains(target)) return;
            // Don't close if clicking inside a portaled inline select dropdown
            if (target.closest('[class*="inlineSelect"]')) return;
            setEditingCell(null);
        };
        document.addEventListener('pointerdown', handler, true);
        return () => document.removeEventListener('pointerdown', handler, true);
    }, [editingCell]);

    return (
        <div className={styles.tableWrapper} ref={wrapperRef}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.thHandle}></th>
                            <th className={styles.thTitle}>Title</th>
                            <th className={styles.thStatus}>Status</th>
                            <th className={styles.thPriority}>Priority</th>
                            <th className={styles.thAssignee}>Assignee</th>
                            <th className={styles.thDueDate}>Due Date</th>
                            <th className={styles.thCreated}>Created</th>
                            {activeExtraCols.map(col => (
                                <th key={col.id} className={styles.thExtra}>
                                    <div className={styles.extraColHeader}>
                                        <col.icon size={12} />
                                        {col.label}
                                        <button className={styles.removeColBtn} onClick={() => toggleExtraColumn(col.id)} title={`Remove ${col.label}`}>
                                            <X size={10} />
                                        </button>
                                    </div>
                                </th>
                            ))}
                            <th className={styles.thAddCol}>
                                <div className={styles.addColContainer}>
                                    <button className={styles.addColBtn} onClick={() => setShowColumnPicker(!showColumnPicker)} title="Add column">
                                        <PlusCircle size={14} />
                                    </button>
                                    {showColumnPicker && availableExtraCols.length > 0 && (
                                        <div className={styles.columnPicker}>
                                            {availableExtraCols.map(col => (
                                                <div key={col.id} className={styles.columnPickerItem} onClick={() => { toggleExtraColumn(col.id); setShowColumnPicker(false); }}>
                                                    <col.icon size={14} />
                                                    {col.label}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                            {cards.length === 0 ? (
                                <tr><td colSpan={totalColCount} className={styles.emptyRow}>No cards to display</td></tr>
                            ) : (
                                cards.map(card => (
                                    <SortableRow
                                        key={card.id}
                                        card={card}
                                        columnColorMap={columnColorMap}
                                        statusOptions={statusOptions}
                                        onCardClick={onCardClick}
                                        activeExtraCols={activeExtraCols}
                                        editingCell={editingCell}
                                        onCellClick={handleCellClick}
                                        onCellSave={handleCellSave}
                                    />
                                ))
                            )}
                        </SortableContext>
                    </tbody>
                </table>
            </DndContext>

            <button className={styles.addRowBtn} onClick={() => onAddCard(defaultStatus)}>
                <Plus size={14} />
                New row
            </button>
        </div>
    );
});
