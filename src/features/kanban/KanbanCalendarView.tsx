import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
    DndContext,
    useDroppable,
    DragOverlay,
    type DragEndEvent,
    type DragStartEvent,
    useSensor,
    useSensors,
    PointerSensor,
    type Modifier
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { NoteNode } from '../../types';
import { SortableCalendarCard, CalendarCard } from './SortableCalendarCard';
import styles from './KanbanCalendarView.module.css';

interface KanbanCalendarViewProps {
    cards: NoteNode[];
    onCardClick: (card: NoteNode) => void;
    onUpdateCard?: (cardId: string, data: Partial<NoteNode['data']>) => void;
    onAddCard?: (startDate?: string) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Droppable Cell Component
interface CalendarCellProps {
    dateKey: string;
    dayNum: number;
    cards: NoteNode[];
    isToday: boolean;
    otherMonth: boolean;
    onCardClick: (card: NoteNode) => void;
    onAddCard?: (isoDate: string) => void;
}

const CalendarCell = ({ dateKey, dayNum, cards, isToday, otherMonth, onCardClick, onAddCard }: CalendarCellProps) => {
    const { setNodeRef, isOver } = useDroppable({
        id: dateKey,
        data: { type: 'cell', date: dateKey }
    });

    return (
        <div
            ref={setNodeRef}
            className={`${styles.dayCell} ${isToday ? styles.today : ''} ${otherMonth ? styles.otherMonth : ''}`}
            style={{ backgroundColor: isOver ? 'rgba(255,255,255,0.05)' : undefined }}
        >
            <div className={styles.cellHeader}>
                <div className={styles.dayNumber}>{dayNum}</div>
                <button
                    className={styles.addBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        // dateKey is YYYY-M-D, need ISO
                        const [y, m, d] = dateKey.split('-').map(Number);
                        const date = new Date(y, m - 1, d, 9, 0, 0); // 9 AM default
                        onAddCard?.(date.toISOString());
                    }}
                >
                    <Plus size={12} />
                </button>
            </div>
            <SortableContext items={cards.map((c: NoteNode) => c.id)} strategy={rectSortingStrategy}>
                {cards.map((card: NoteNode) => (
                    <SortableCalendarCard
                        key={card.id}
                        card={card}
                        onCardClick={onCardClick}
                    />
                ))}
            </SortableContext>
        </div>
    );
};

export const KanbanCalendarView = ({ cards, onCardClick, onUpdateCard, onAddCard }: KanbanCalendarViewProps) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
    const [activeId, setActiveId] = useState<string | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Group cards by date string "YYYY-MM-DD"
    const cardsByDate = useMemo(() => {
        const map: Record<string, NoteNode[]> = {};
        cards.forEach(card => {
            // Prioritize startDate for calendar placement
            const dateStr = card.data.startDate || card.data.dueDate;
            if (!dateStr) return;
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return;
                const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
                if (!map[key]) map[key] = [];
                map[key].push(card);
            } catch { /* skip cards with unparseable dates */ }
        });
        return map;
    }, [cards]);

    // Navigation handlers
    const handlePrev = () => {
        const newDate = new Date(currentDate);
        if (viewMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
        else if (viewMode === 'week') newDate.setDate(newDate.getDate() - 7);
        else if (viewMode === 'day') newDate.setDate(newDate.getDate() - 1);
        setCurrentDate(newDate);
    };

    const handleNext = () => {
        const newDate = new Date(currentDate);
        if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
        else if (viewMode === 'week') newDate.setDate(newDate.getDate() + 7);
        else if (viewMode === 'day') newDate.setDate(newDate.getDate() + 1);
        setCurrentDate(newDate);
    };

    const goToToday = () => setCurrentDate(new Date());

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over || !onUpdateCard) return;

        const cardId = active.id as string;
        let targetDate = '';

        if (over.data.current?.type === 'cell') {
            targetDate = over.id as string;
        } else if (over.data.current?.type === 'card') {
            const overCard = cards.find(c => c.id === over.id);
            if (overCard && (overCard.data.startDate || overCard.data.dueDate)) {
                // Use startDate if available on the target card too
                const d = new Date(overCard.data.startDate || overCard.data.dueDate!);
                targetDate = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            }
        }

        if (targetDate) {
            const card = cards.find(c => c.id === cardId);
            if (card) {
                const [y, m, d] = targetDate.split('-').map(Number);
                const newStart = new Date(y, m - 1, d, 9, 0, 0); // 9 AM

                // Calculate duration to preserve it
                let duration = 0;
                if (card.data.startDate && card.data.dueDate) {
                    const s = new Date(card.data.startDate);
                    const e = new Date(card.data.dueDate);
                    duration = e.getTime() - s.getTime();
                } else if (!card.data.startDate && card.data.dueDate) {
                    // treating moving a due-date-only card as setting start date? 
                    // Or continue just setting due date?
                    // If we switched to vis by start date, we should set start date.
                    // Let's assume 1 hour duration or just update start date.
                }

                const updates: Partial<NoteNode['data']> = {
                    startDate: newStart.toISOString()
                };

                if (duration > 0) {
                    updates.dueDate = new Date(newStart.getTime() + duration).toISOString();
                } else if (card.data.dueDate && !card.data.startDate) {
                    // If it only had due date, move due date to new spot (effectively treating it as start)
                    updates.dueDate = newStart.toISOString();
                    // And maybe set start date too?
                    updates.startDate = newStart.toISOString();
                }

                onUpdateCard(cardId, updates);
            }
        }
    }, [cards, onUpdateCard]);

    const activeCard = useMemo(() => cards.find(c => c.id === activeId), [cards, activeId]);

    // Render Grid Logic
    const renderGrid = () => {
        const cells = [];
        const today = new Date();

        let startDate: Date;
        let daysCount: number;

        if (viewMode === 'month') {
            const firstDayOfMonth = new Date(year, month, 1);
            const dayOfWeek = firstDayOfMonth.getDay(); // 0=Sun
            startDate = new Date(year, month, 1 - dayOfWeek); // Start from previous Sunday
            daysCount = 42; // Fixed 6 weeks
        } else if (viewMode === 'week') {
            const dayOfWeek = currentDate.getDay();
            startDate = new Date(currentDate);
            startDate.setDate(currentDate.getDate() - dayOfWeek); // Start of week (Sun)
            daysCount = 7;
        } else {
            // Day view
            startDate = new Date(currentDate);
            daysCount = 1;
        }

        for (let i = 0; i < daysCount; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);

            const dateKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            const dayCards = cardsByDate[dateKey] || [];

            const isToday = d.toDateString() === today.toDateString();
            const isOtherMonth = viewMode === 'month' && d.getMonth() !== month;

            cells.push(
                <CalendarCell
                    key={dateKey}
                    dateKey={dateKey}
                    dayNum={d.getDate()}
                    cards={dayCards}
                    isToday={isToday}
                    otherMonth={isOtherMonth}
                    onCardClick={onCardClick}
                    onAddCard={onAddCard}
                />
            );
        }
        return cells;
    };

    // Header Title
    const getHeaderTitle = () => {
        if (viewMode === 'month') return `${MONTHS[month]} ${year}`;
        if (viewMode === 'day') return currentDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        // Week range
        const start = new Date(currentDate);
        start.setDate(currentDate.getDate() - currentDate.getDay());
        const end = new Date(start);
        end.setDate(start.getDate() + 6);

        const startMonth = MONTHS[start.getMonth()];
        const endMonth = MONTHS[end.getMonth()];

        if (startMonth === endMonth) return `${startMonth} ${year}`;
        return `${startMonth.substring(0, 3)} - ${endMonth.substring(0, 3)} ${year}`;
    };

    // Style for grid container
    const gridStyle = {
        gridTemplateColumns: viewMode === 'day' ? '1fr' : 'repeat(7, 1fr)',
        gridTemplateRows: viewMode === 'month' ? 'repeat(6, 1fr)' : '1fr',
    };

    // Modifier: Adjust overlay position
    const adjustOffset: Modifier = useCallback(({ transform, activatorEvent, draggingNodeRect }) => {
        if (!activatorEvent || !draggingNodeRect) return transform;
        const event = activatorEvent as PointerEvent;
        if (!event.clientX) return transform;
        const offsetX = event.clientX - draggingNodeRect.left;
        const offsetY = event.clientY - draggingNodeRect.top;
        return {
            ...transform,
            x: transform.x - (draggingNodeRect.width / 2 - offsetX),
            y: transform.y - (draggingNodeRect.height / 2 - offsetY),
        };
    }, []);

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className={styles.calendarWrapper}>
                <div className={styles.header}>
                    <div className={styles.titleSection}>
                        <div className={styles.monthTitle}>{getHeaderTitle()}</div>
                        <div className={styles.viewControls}>
                            {(['day', 'week', 'month'] as const).map(mode => (
                                <button
                                    key={mode}
                                    className={`${styles.viewBtn} ${viewMode === mode ? styles.activeView : ''}`}
                                    onClick={() => setViewMode(mode)}
                                >
                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.navControls}>
                        <button className={styles.navBtn} onClick={handlePrev} title="Previous">
                            <ChevronLeft size={16} />
                        </button>
                        <button className={`${styles.navBtn} ${styles.todayBtn}`} onClick={goToToday}>
                            Today
                        </button>
                        <button className={styles.navBtn} onClick={handleNext} title="Next">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

                <div className={styles.grid}>
                    {viewMode !== 'day' && (
                        <div className={styles.daysGrid} style={{ gridTemplateRows: '30px' }}>
                            {DAYS.map(day => (
                                <div key={day} className={styles.dayHeader}>{day}</div>
                            ))}
                        </div>
                    )}
                    <div className={styles.daysGrid} style={gridStyle}>
                        {renderGrid()}
                    </div>
                </div>

                {typeof document !== 'undefined' && createPortal(
                    <DragOverlay modifiers={[adjustOffset]}>
                        {activeCard ? (
                            <CalendarCard
                                card={activeCard}
                                isOverlay
                                style={{
                                    cursor: 'grabbing',
                                    transition: 'none',
                                    width: '100%',
                                    maxWidth: '150px'
                                }}
                            />
                        ) : null}
                    </DragOverlay>,
                    document.body
                )}
            </div>
        </DndContext>
    );
};

