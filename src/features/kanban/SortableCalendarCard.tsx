import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { NoteNode } from '../../types';
import styles from './KanbanCalendarView.module.css';

interface SortableCalendarCardProps {
    card: NoteNode;
    onCardClick: (card: NoteNode) => void;
}

function getPriorityColor(priority?: string) {
    switch (priority) {
        case 'urgent': return '#ef4444';
        case 'high': return '#f97316';
        case 'medium': return '#eab308';
        case 'low': return '#22c55e';
        default: return 'transparent';
    }
}

export const CalendarCard = ({ card, onCardClick, style, listeners, attributes, isOverlay }: any) => {
    return (
        <div
            style={style}
            {...attributes}
            {...listeners}
            className={`${styles.cardPill} ${card.data.status === 'done' ? styles.cardCompleted : ''} ${isOverlay ? styles.cardOverlay : ''}`}
            onClick={(e) => { e.stopPropagation(); onCardClick?.(card); }}
            title={card.data.label}
        >
            <div
                className={styles.priorityIndicator}
                style={{ backgroundColor: getPriorityColor(card.data.priority) }}
            />
            <span className={styles.cardLabel}>
                {card.data.label || 'Untitled'}
            </span>
        </div>
    );
};

export const SortableCalendarCard = ({ card, onCardClick }: SortableCalendarCardProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: card.id,
        data: {
            type: 'card',
            card
        }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1, // Lower opacity for the dragging item in the list
    };

    return (
        <div ref={setNodeRef} style={{ width: '100%' }}>
            <CalendarCard
                card={card}
                onCardClick={onCardClick}
                style={style}
                listeners={listeners}
                attributes={attributes}
            />
        </div>
    );
};
