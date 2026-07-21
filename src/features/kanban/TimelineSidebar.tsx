import React from 'react';
import type { NoteNode } from '../../types';
import styles from './KanbanTimeline.module.css';
import { GripVertical, Plus } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TimelineSidebarProps {
    cards: NoteNode[];
    onScroll?: (scrollTop: number) => void;
    scrollRef?: React.RefObject<HTMLDivElement | null>;
    onCardClick?: (card: NoteNode) => void;
    onReorder?: (newOrder: string[]) => void;
    onAddCard?: () => void;
}

const SortableSidebarItem = ({ card, onClick }: { card: NoteNode; onClick?: (card: NoteNode) => void }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: card.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none'
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={styles.sidebarItem}
            onClick={() => onClick?.(card)}
        >
            <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', marginRight: 8 }}>
                <GripVertical size={14} style={{ opacity: 0.5 }} />
            </div>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {card.data.label || 'Untitled'}
            </span>
        </div>
    );
};

export const TimelineSidebar: React.FC<TimelineSidebarProps> = ({ cards, onScroll, scrollRef, onCardClick, onReorder, onAddCard }) => {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = cards.findIndex((item) => item.id === active.id);
            const newIndex = cards.findIndex((item) => item.id === over.id);
            const newOrder = arrayMove(cards, oldIndex, newIndex).map(c => c.id);
            onReorder?.(newOrder);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (onScroll) {
            onScroll(e.currentTarget.scrollTop);
        }
    };

    return (
        <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                Tasks
            </div>
            <div
                className={styles.sidebarContent}
                ref={scrollRef}
                onScroll={handleScroll}
            >
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={cards.map(c => c.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {cards.map((card) => (
                            <SortableSidebarItem key={card.id} card={card} onClick={onCardClick} />
                        ))}
                    </SortableContext>
                </DndContext>

                <button
                    onClick={() => onAddCard?.()}
                    className={`${styles.newTaskButton} nodrag`}
                >
                    <Plus size={14} />
                    New Task
                </button>
            </div>
        </div>
    );
};
