import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { NoteNode } from '../../types';
import styles from './KanbanCalendarView.module.css';

interface KanbanCalendarViewProps {
    cards: NoteNode[];
    onCardClick: (card: NoteNode) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const KanbanCalendarView = ({ cards, onCardClick }: KanbanCalendarViewProps) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Helper: get number of days in a month
    const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

    // Helper: get day of week for the 1st of the month (0 = Sun, 6 = Sat)
    const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    // Group cards by date string "YYYY-MM-DD"
    const cardsByDate = useMemo(() => {
        const map: Record<string, NoteNode[]> = {};
        cards.forEach(card => {
            if (!card.data.dueDate) return;
            try {
                // Ensure date string format consistency
                const d = new Date(card.data.dueDate);
                if (isNaN(d.getTime())) return;

                const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
                if (!map[key]) map[key] = [];
                map[key].push(card);
            } catch (e) {
                // Ignore invalid dates
            }
        });
        return map;
    }, [cards]);

    // Navigation handlers
    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToToday = () => setCurrentDate(new Date());

    // Generate grid cells
    const renderCalendarGrid = () => {
        const cells = [];
        const prevMonthDays = getDaysInMonth(year, month - 1);

        // adjust firstDay to start from Monday? No, strict standard is Sunday for US/Universal usually
        // But many users prefer Monday. Let's stick to Sunday start for simplicity (0 index)

        // Previous month padding
        for (let i = 0; i < firstDay; i++) {
            const dayNum = prevMonthDays - firstDay + i + 1;
            cells.push(
                <div key={`prev-${i}`} className={`${styles.dayCell} ${styles.otherMonth}`}>
                    <div className={styles.dayNumber}>{dayNum}</div>
                </div>
            );
        }

        // Current month days
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
        const todayDate = today.getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${year}-${month + 1}-${day}`;
            const dayCards = cardsByDate[dateKey] || [];
            const isToday = isCurrentMonth && day === todayDate;

            cells.push(
                <div key={`curr-${day}`} className={`${styles.dayCell} ${isToday ? styles.today : ''}`}>
                    <div className={styles.dayNumber}>{day}</div>
                    {dayCards.map(card => (
                        <div
                            key={card.id}
                            className={`${styles.cardPill} ${card.data.status === 'done' ? styles.cardCompleted : ''}`}
                            onClick={(e) => { e.stopPropagation(); onCardClick(card); }}
                            style={{ borderLeftColor: getPriorityColor(card.data.priority) }}
                            title={card.data.label}
                        >
                            {card.data.label || 'Untitled'}
                        </div>
                    ))}
                </div>
            );
        }

        // Next month padding to fill 6 rows (42 cells total usually covers all months)
        const totalCells = firstDay + daysInMonth;
        const nextMonthPadding = 42 - totalCells; // Fixed 6-row grid

        for (let i = 1; i <= nextMonthPadding; i++) {
            cells.push(
                <div key={`next-${i}`} className={`${styles.dayCell} ${styles.otherMonth}`}>
                    <div className={styles.dayNumber}>{i}</div>
                </div>
            );
        }

        return cells;
    };

    return (
        <div className={styles.calendarWrapper}>
            <div className={styles.header}>
                <div className={styles.monthTitle}>
                    {MONTHS[month]} {year}
                </div>
                <div className={styles.navControls}>
                    <button className={styles.navBtn} onClick={prevMonth} title="Previous Month">
                        <ChevronLeft size={16} />
                    </button>
                    <button className={`${styles.navBtn} ${styles.todayBtn}`} onClick={goToToday}>
                        Today
                    </button>
                    <button className={styles.navBtn} onClick={nextMonth} title="Next Month">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <div className={styles.grid}>
                <div className={styles.daysGrid} style={{ gridTemplateRows: '30px' }}>
                    {DAYS.map(day => (
                        <div key={day} className={styles.dayHeader}>{day}</div>
                    ))}
                </div>
                <div className={styles.daysGrid}>
                    {renderCalendarGrid()}
                </div>
            </div>
        </div>
    );
};

function getPriorityColor(priority?: string) {
    switch (priority) {
        case 'urgent': return '#ef4444';
        case 'high': return '#f97316';
        case 'medium': return '#eab308';
        case 'low': return '#22c55e';
        default: return 'transparent';
    }
}
