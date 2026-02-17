import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { NoteNode } from '../../types';
import { TimelineBar } from './TimelineBar';
import styles from './KanbanTimeline.module.css';

interface TimelineChartProps {
    cards: NoteNode[];
    startDate: Date;
    daysToShow: number;
    columnWidth?: number;
    onUpdateCard?: (cardId: string, data: Partial<NoteNode['data']>) => void;
    onScroll?: (scrollTop: number) => void;
    scrollRef?: React.RefObject<HTMLDivElement | null>;
    onAddCard?: (startDate?: string) => void;
}

export const TimelineChart: React.FC<TimelineChartProps> = ({
    cards,
    startDate,
    daysToShow,
    columnWidth = 50,
    onUpdateCard,
    onScroll,
    scrollRef,
    onAddCard
}) => {
    // Interaction State
    const [dragState, setDragState] = useState<{
        cardId: string;
        type: 'move' | 'resize-l' | 'resize-r';
        initialX: number;
        initialLeft: number;
        initialWidth: number;
        currentX: number;
    } | null>(null);

    // Helpers
    const getDaysDiff = (d1: Date, d2: Date) => {
        const start = new Date(d1);
        const end = new Date(d2);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    };

    const addDays = (d: Date, days: number) => {
        const newDate = new Date(d);
        newDate.setDate(d.getDate() + days);
        return newDate;
    };

    // Generate Date Columns
    const dates = useMemo(() => {
        const arr = [];
        for (let i = 0; i < daysToShow; i++) {
            arr.push(addDays(startDate, i));
        }
        return arr;
    }, [startDate, daysToShow]);

    // Group columns by month for header
    const months = useMemo(() => {
        const groups: { label: string; count: number }[] = [];
        if (dates.length === 0) return groups;

        let currentMonth = dates[0].toLocaleString('default', { month: 'long', year: 'numeric' });
        let count = 0;

        dates.forEach(date => {
            const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (month !== currentMonth) {
                groups.push({ label: currentMonth, count });
                currentMonth = month;
                count = 1;
            } else {
                count++;
            }
        });
        groups.push({ label: currentMonth, count });
        return groups;
    }, [dates]);

    const headerRef = useRef<HTMLDivElement>(null);

    // Handle Scroll Sync
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        // Sync Sidebar Vertical Scroll
        if (onScroll) {
            onScroll(e.currentTarget.scrollTop);
        }

        // Sync Header Horizontal Scroll
        if (headerRef.current) {
            headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    // Drag Logic
    const handleMouseDown = (e: React.MouseEvent, card: NoteNode, type: 'move' | 'resize-l' | 'resize-r', left: number, width: number) => {
        setDragState({
            cardId: card.id,
            type,
            initialX: e.clientX,
            initialLeft: left,
            initialWidth: width,
            currentX: e.clientX
        });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragState) return;
        setDragState(prev => prev ? { ...prev, currentX: e.clientX } : null);
    }, [dragState]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (!dragState || !onUpdateCard) {
            setDragState(null);
            return;
        }

        const deltaX = e.clientX - dragState.initialX;
        const deltaDays = Math.round(deltaX / columnWidth);

        if (deltaDays !== 0) {
            const card = cards.find(c => c.id === dragState.cardId);
            if (card) {
                // Determine existing dates
                let start = card.data.startDate ? new Date(card.data.startDate) : new Date();
                let end = card.data.dueDate ? new Date(card.data.dueDate) : new Date();

                // Fallback if dates missing
                if (!card.data.startDate && card.data.dueDate) start = new Date(card.data.dueDate);
                if (!card.data.dueDate && card.data.startDate) end = new Date(card.data.startDate);

                if (dragState.type === 'move') {
                    const newStart = addDays(start, deltaDays);
                    const newEnd = addDays(end, deltaDays);
                    onUpdateCard(card.id, {
                        startDate: newStart.toISOString(),
                        dueDate: newEnd.toISOString()
                    });
                } else if (dragState.type === 'resize-l') {
                    const newStart = addDays(start, deltaDays);
                    // Prevent end < start
                    if (newStart <= end) {
                        onUpdateCard(card.id, { startDate: newStart.toISOString() });
                    }
                } else if (dragState.type === 'resize-r') {
                    const newEnd = addDays(end, deltaDays);
                    if (newEnd >= start) {
                        onUpdateCard(card.id, { dueDate: newEnd.toISOString() });
                    }
                }
            }
        }

        setDragState(null);
    }, [dragState, cards, columnWidth, onUpdateCard]);

    useEffect(() => {
        if (dragState) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, handleMouseMove, handleMouseUp]);


    // Double Click to Add
    const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!onAddCard) return;
        const rect = e.currentTarget.getBoundingClientRect();
        // Calculate X relative to the grid
        const x = e.clientX - rect.left;
        const dayIndex = Math.floor(x / columnWidth);
        const clickedDate = addDays(startDate, dayIndex);
        onAddCard(clickedDate.toISOString());
    }, [onAddCard, startDate, columnWidth]);

    // Render Rows
    return (
        <div className={styles.chartContainer}>
            {/* Header */}
            <div
                className={styles.chartHeader}
                ref={headerRef}
                style={{ overflowX: 'hidden', overflowY: 'hidden' }}
            >
                <div style={{ width: dates.length * columnWidth, height: '100%' }}>
                    <div className={styles.monthRow}>
                        {months.map((m, i) => (
                            <div key={i} className={styles.monthLabel} style={{ width: m.count * columnWidth }}>
                                {m.label}
                            </div>
                        ))}
                    </div>
                    <div className={styles.dayRow}>
                        {dates.map((d, i) => {
                            const isToday = new Date().toDateString() === d.toDateString();
                            return (
                                <div
                                    key={i}
                                    className={`${styles.dayLabel} ${isToday ? styles.today : ''}`}
                                    style={{ width: columnWidth }}
                                >
                                    {d.toLocaleString('default', { weekday: 'short' }).substring(0, 2)} {d.getDate()}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Scrollable Grid */}
            <div
                className={styles.timelineScrollArea}
                ref={scrollRef}
                onScroll={handleScroll}
            >
                <div
                    className={styles.gridContainer}
                    style={{ width: dates.length * columnWidth, minHeight: cards.length * 40 }}
                    onDoubleClick={handleDoubleClick}
                >
                    {/* Background Grid Lines */}
                    <div className={styles.gridBackground}>
                        {dates.map((d, i) => {
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            return (
                                <div
                                    key={i}
                                    className={`${styles.gridColumn} ${isWeekend ? styles.weekend : ''}`}
                                    style={{ left: i * columnWidth, width: columnWidth }}
                                />
                            );
                        })}
                        {/* Today Line */}
                        {(() => {
                            const today = new Date();
                            const diff = getDaysDiff(startDate, today);
                            if (diff >= 0 && diff < daysToShow) {
                                return <div className={styles.todayLine} style={{ left: (diff * columnWidth) + (columnWidth / 2) }} />;
                            }
                            return null;
                        })()}
                    </div>

                    {/* Card Bars */}
                    {cards.map((card, index) => {
                        // Calculate position
                        let cardStart = card.data.startDate ? new Date(card.data.startDate) : (card.data.dueDate ? new Date(card.data.dueDate) : null);
                        let cardEnd = card.data.dueDate ? new Date(card.data.dueDate) : (card.data.startDate ? new Date(card.data.startDate) : null);

                        if (!cardStart && !cardEnd) return null; // Skip invalid cards
                        if (!cardStart) cardStart = cardEnd;
                        if (!cardEnd) cardEnd = cardStart;

                        // Calculate offset and width
                        const startOffset = getDaysDiff(startDate, cardStart!) * columnWidth;
                        const duration = getDaysDiff(cardStart!, cardEnd!) + 1; // Inclusive
                        const width = duration * columnWidth;

                        // Optimistic Drag Updates
                        let renderLeft = startOffset;
                        let renderWidth = width;

                        if (dragState && dragState.cardId === card.id) {
                            const delta = dragState.currentX - dragState.initialX;
                            if (dragState.type === 'move') {
                                renderLeft += delta;
                            } else if (dragState.type === 'resize-l') {
                                renderLeft += delta;
                                renderWidth -= delta;
                            } else if (dragState.type === 'resize-r') {
                                renderWidth += delta;
                            }
                        }

                        // Don't render if completely out of view?
                        // Actually better to render for smoothness, virtualize if needed.

                        return (
                            <div
                                key={card.id}
                                className={styles.chartRow}
                                style={{ top: index * 40, position: 'absolute', width: '100%', left: 0 }}
                            >
                                <TimelineBar
                                    label={card.data.label || 'Untitled'}
                                    left={renderLeft}
                                    width={renderWidth}
                                    color={card.data.color || (card.data.status === 'done' ? '#10b981' : undefined)}
                                    onMouseDown={(e, type) => handleMouseDown(e, card, type, startOffset, width)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
