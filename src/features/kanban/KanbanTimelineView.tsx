import { useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { NoteNode } from '../../types';
import { TimelineSidebar } from './TimelineSidebar';
import { TimelineChart } from './TimelineChart';
import styles from './KanbanTimeline.module.css';

interface KanbanTimelineViewProps {
    cards: NoteNode[];
    onCardClick: (card: NoteNode) => void;
    onUpdateCard?: (cardId: string, data: Partial<NoteNode['data']>) => void;
    onAddCard?: (startDate?: string) => void;
    onReorder?: (newOrder: string[]) => void;
}

export const KanbanTimelineView = ({ cards, onCardClick, onUpdateCard, onAddCard, onReorder }: KanbanTimelineViewProps) => {
    const [startDate, setStartDate] = useState(new Date()); // Viewport start
    const sidebarScrollRef = useRef<HTMLDivElement>(null);
    const chartScrollRef = useRef<HTMLDivElement>(null);

    // Scroll Sync
    const handleScroll = useCallback((scrollTop: number, source: 'sidebar' | 'chart') => {
        if (source === 'sidebar' && chartScrollRef.current) {
            chartScrollRef.current.scrollTop = scrollTop;
        } else if (source === 'chart' && sidebarScrollRef.current) {
            sidebarScrollRef.current.scrollTop = scrollTop;
        }
    }, []);

    const shiftTimeline = (days: number) => {
        const newDate = new Date(startDate);
        newDate.setDate(startDate.getDate() + days);
        setStartDate(newDate);
    };

    return (
        <div className={styles.container}>
            {/* Sidebar */}
            {/* Sidebar */}
            <TimelineSidebar
                cards={cards}
                onScroll={(top) => handleScroll(top, 'sidebar')}
                scrollRef={sidebarScrollRef}
                onCardClick={onCardClick}
                onAddCard={onAddCard}
                onReorder={onReorder}
            />

            {/* Chart Area */}
            <div className={styles.chartContainer}>
                {/* Global Timeline Controls (can be moved deeper if needed) */}
                <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 16,
                    zIndex: 20,
                    display: 'flex',
                    gap: 8,
                    background: 'rgba(0,0,0,0.5)',
                    padding: 4,
                    borderRadius: 8,
                    backdropFilter: 'blur(4px)'
                }}>
                    <button className="nodrag" onClick={() => shiftTimeline(-7)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                        <ChevronLeft size={16} />
                    </button>
                    <button className="nodrag" onClick={() => setStartDate(new Date())} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                        Today
                    </button>
                    <button className="nodrag" onClick={() => shiftTimeline(7)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                        <ChevronRight size={16} />
                    </button>
                </div>

                <TimelineChart
                    cards={cards}
                    startDate={startDate}
                    daysToShow={21} // Show 3 weeks
                    columnWidth={60}
                    onUpdateCard={onUpdateCard}
                    onScroll={(top) => handleScroll(top, 'chart')}
                    scrollRef={chartScrollRef}
                    onAddCard={onAddCard}
                />
            </div>
        </div>
    );
};
