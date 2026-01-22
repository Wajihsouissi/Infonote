import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, ChevronLeft } from 'lucide-react';
import type { KanbanColumn as IKanbanColumn, NoteNode } from '../../types';
import { SortableCard } from './SortableCard';
import { useStore } from '../../store/useStore';
import styles from './KanbanNode.module.css';

interface KanbanColumnProps {
    column: IKanbanColumn;
    cards: NoteNode[];
    onAddCard?: (e: React.MouseEvent, columnId: string, statusValue: string) => void;
    onToggleCollapse: (columnId: string) => void;
    kanbanId: string;
}

export const KanbanColumn = ({ column, cards, onAddCard, onToggleCollapse, kanbanId }: KanbanColumnProps) => {
    const interactionState = useStore(s => s.interactionState);
    
    // Check if this specific column is being hovered from canvas drag
    const isHoveredFromCanvas = interactionState.hoveredKanbanColumn?.kanbanId === kanbanId && 
                               interactionState.hoveredKanbanColumn?.columnId === column.statusValue;

    // We make the column itself droppable so we can drop items into empty columns
    const { setNodeRef, isOver } = useDroppable({
        id: column.statusValue,
        data: {
            type: 'column',
            column
        },
        disabled: column.collapsed // Disable dropping if collapsed? Optional choice.
    });

    const isCollapsed = column.collapsed;

    return (
        <div
            ref={setNodeRef}
            className={`
                ${styles.column} 
                ${(isOver || isHoveredFromCanvas) && !isCollapsed ? styles.columnHovered : ''} 
                ${isCollapsed ? styles.columnCollapsed : ''}
            `}
            onClick={(e) => {
                if (isCollapsed) {
                    onToggleCollapse(column.id);
                }
            }}
        >
            <div className={styles.columnHeader}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className={styles.columnColorBar} style={{ background: column.color || '#ccc' }} />
                    <span className={styles.columnTitle}>{column.label}</span>
                </div>

                {!isCollapsed && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span
                            className={styles.statusBadge}
                            style={{ background: `${column.color}33`, color: column.color }}
                        >
                            {cards.length}
                        </span>

                        {onAddCard && (
                            <button
                                className={styles.addCardBtn}
                                onClick={(e) => onAddCard(e, column.id, column.statusValue)}
                            >
                                <Plus size={14} />
                            </button>
                        )}

                        <button
                            className={styles.collapseBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleCollapse(column.id);
                            }}
                        >
                            <ChevronLeft size={16} />
                        </button>
                    </div>
                )}
            </div>

            {!isCollapsed && (
                <SortableContext
                    items={cards.map(c => c.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className={styles.dropZone}>
                        {cards.map((card) => (
                            <div key={card.id} className={styles.cardWrapper}>
                                <SortableCard node={card} style={{ height: card.style?.height ?? 112 }} />
                            </div>
                        ))}
                    </div>
                </SortableContext>
            )}
        </div>
    );
};
