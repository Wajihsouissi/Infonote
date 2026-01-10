
import { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './CustomDatePicker.module.css';

interface CustomDatePickerProps {
    value: string; // ISO String
    onChange: (date: string) => void;
    placeholder?: string;
}

export function CustomDatePicker({ value, onChange, placeholder }: CustomDatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewDate, setViewDate] = useState(new Date());

    useEffect(() => {
        if (value) {
            const d = new Date(value);
            if (!isNaN(d.getTime())) setViewDate(d);
        }
    }, [value, isOpen]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay(); // 0 = Sun

    const handleDateClick = (day: number) => {
        const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        // Correct for timezone offset to store simpler ISO string if desired, or just UTC
        const iso = new Date(newDate.getTime() - (newDate.getTimezoneOffset() * 60000)).toISOString();
        onChange(iso);
        setIsOpen(false);
    };

    const nextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const prevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const days = daysInMonth(year, month);
        const startDay = firstDayOfMonth(year, month);

        const cells = [];
        // Empty slots
        for (let i = 0; i < startDay; i++) {
            cells.push(<div key={`empty-${i}`} />);
        }

        // Days
        for (let d = 1; d <= days; d++) {
            const isSelected = value && new Date(value).toDateString() === new Date(year, month, d).toDateString();
            const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();

            cells.push(
                <div
                    key={d}
                    className={`${styles.day} ${isSelected ? styles.selected : ''} ${isToday ? styles.today : ''}`}
                    onClick={() => handleDateClick(d)}
                >
                    {d}
                </div>
            );
        }

        return cells;
    };

    const displayValue = value ? new Date(value).toLocaleDateString() : '';

    return (
        <div className={styles.container} ref={containerRef}>
            <div
                className={`${styles.trigger} ${isOpen ? styles.open : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className={styles.triggerContent}>
                    <CalendarIcon size={16} className={styles.icon} />
                    <span className={styles.value}>
                        {displayValue || placeholder || 'Pick a date'}
                    </span>
                </div>
            </div>

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.header}>
                        <button onClick={(e) => { e.stopPropagation(); prevMonth(); }} className={styles.navBtn}>
                            <ChevronLeft size={16} />
                        </button>
                        <span className={styles.monthLabel}>
                            {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); nextMonth(); }} className={styles.navBtn}>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <div className={styles.weekdays}>
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                            <div key={d} className={styles.weekday}>{d}</div>
                        ))}
                    </div>
                    <div className={styles.grid}>
                        {renderCalendar()}
                    </div>
                </div>
            )}
        </div>
    );
}
