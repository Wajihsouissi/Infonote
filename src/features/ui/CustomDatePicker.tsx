
import { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, X } from '../../components/icons';
import {
    dayKey,
    formatTimeOfDay,
    parseCardDate,
    parseCardTime,
    toStoredDate,
    toStoredDateTime,
} from '../../utils/cardDate';
import styles from './CustomDatePicker.module.css';

/** `540` → `"09:00"`, the value an `<input type="time">` wants. */
const toTimeInput = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** `"09:00"` → `540`, or null if the field was cleared. */
const fromTimeInput = (raw: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!m) return null;
    const minutes = Number(m[1]) * 60 + Number(m[2]);
    return Number.isFinite(minutes) ? minutes : null;
};

interface CustomDatePickerProps {
    /**
     * A stored card date. Both shapes the app has ever written are accepted —
     * see src/utils/cardDate.ts — and what this writes back is the canonical
     * one, so a value that passes through here comes out normalised.
     */
    value: string;
    onChange: (date: string) => void;
    placeholder?: string;
    /**
     * Offer a time of day as well as a day.
     *
     * Off by default, so every existing caller keeps exactly the behaviour it
     * had — including closing the moment a day is picked, which a picker that
     * also takes a time must not do.
     *
     * Deliberately not the editor's CustomDateTimePicker, which looks like the
     * same control and is not: that one writes `toISOString()`, a true UTC
     * instant, while a card date is the local wall clock labelled `Z`. Pointing
     * it at a card date would shift every time by the reader's own offset.
     */
    withTime?: boolean;
    /**
     * Open on mount, and without a trigger of its own.
     *
     * For a picker that already sits inside a popover the caller opened — a
     * second trigger in there would mean two clicks to reach one calendar.
     */
    defaultOpen?: boolean;
}

export function CustomDatePicker({
    value, onChange, placeholder, withTime, defaultOpen,
}: CustomDatePickerProps) {
    const [isOpen, setIsOpen] = useState(!!defaultOpen);
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewDate, setViewDate] = useState(new Date());

    useEffect(() => {
        const d = parseCardDate(value);
        if (d) setViewDate(d);
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

    /** Minutes past midnight the value carries, or null when it is all-day. */
    const minutes = parseCardTime(value);

    const handleDateClick = (day: number) => {
        /* The old line here built local midnight, subtracted getTimezoneOffset()
           and serialised as UTC — a composition that only ever cancels back to
           the local wall clock, so the offset was never doing any work while
           looking like it was. toStoredDate names the day directly and produces
           the identical string. */
        const picked = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        // Changing the day must not silently drop the time already set on it.
        onChange(withTime ? toStoredDateTime(picked, minutes) : toStoredDate(picked));
        // A picker that also takes a time cannot close on the day.
        if (!withTime) setIsOpen(false);
    };

    /** Set, change or clear the time, keeping whatever day is already chosen. */
    const handleTimeChange = (raw: string) => {
        const day = parseCardDate(value) ?? new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate());
        onChange(toStoredDateTime(day, fromTimeInput(raw)));
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
        const selected = parseCardDate(value);
        const selectedKey = selected ? dayKey(selected) : null;
        const todaysKey = dayKey(new Date());

        for (let d = 1; d <= days; d++) {
            const cellKey = dayKey(new Date(year, month, d));
            const isSelected = selectedKey === cellKey;
            const isToday = todaysKey === cellKey;

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

    const parsed = parseCardDate(value);
    /* The trigger says the time too, or the control would claim a card was due
       "1 September" when it is due at half past one that afternoon. */
    const displayValue = parsed
        ? `${parsed.toLocaleDateString()}${minutes !== null ? `, ${formatTimeOfDay(minutes)}` : ''}`
        : '';

    return (
        <div className={`${styles.container} ${defaultOpen ? styles.bare : ''}`} ref={containerRef}>
            {!defaultOpen && (
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
            )}

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.header}>
                        <button onClick={(e) => { e.stopPropagation(); prevMonth(); }} className={`${styles.navBtn} icon-hover`}>
                            <ChevronLeft size={16} />
                        </button>
                        <span className={styles.monthLabel}>
                            {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); nextMonth(); }} className={`${styles.navBtn} icon-hover`}>
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

                    {/* A native time field: locale-aware display, keyboard and
                        screen-reader support for free, and a value that is
                        always 24-hour `HH:MM` however it is shown. */}
                    {withTime && (
                        <div className={styles.timeRow}>
                            <Clock size={14} className={styles.icon} aria-hidden="true" />
                            <input
                                type="time"
                                className={styles.timeInput}
                                value={minutes === null ? '' : toTimeInput(minutes)}
                                aria-label="Time"
                                disabled={!parsed}
                                onChange={(e) => handleTimeChange(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                onKeyUp={(e) => e.stopPropagation()}
                            />
                            {minutes === null ? (
                                <span className={styles.timeHint}>
                                    {parsed ? 'All day' : 'Pick a day first'}
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className={styles.timeClear}
                                    title="Make this all day"
                                    aria-label="Make this all day"
                                    onClick={() => parsed && onChange(toStoredDate(parsed))}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
