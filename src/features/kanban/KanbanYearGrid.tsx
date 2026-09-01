/**
 * The year at a glance: twelve mini-months, four across.
 *
 * This scale answers "when was I busy" rather than "what is on Tuesday", so it
 * draws density instead of cards — each day is a square shaded by how many
 * cards land on it, and reading a title is what the other three scales are for.
 *
 * The shading steps are fixed, not normalised against the busiest day of the
 * year. A normalised scale changes what a colour *means* every time the data
 * changes, so adding one card to next week would make last March look quieter
 * without anything about last March having moved.
 *
 * Nothing here is a drop target. A 14px square is a mis-drop generator, and a
 * calendar that files work on the wrong day is not reliable however correct its
 * date arithmetic is. This is a deliberate exclusion: to move something, click
 * into the month or the day and drag it there.
 */

import { memo } from 'react';

import { dayKey, startOfMonth, todayKey, yearMonths, type DayKey } from '../../utils/cardDate';
import type { CalendarEntry } from './calendarModel';
import styles from './KanbanCalendar.module.css';

/** Single letters, Sunday first — matching every other grid in the app. */
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** 0, 1, 2, 3+ — four steps, so a square's shade is a count you can read back. */
const densityStep = (count: number): 0 | 1 | 2 | 3 =>
    count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;

export interface KanbanYearGridProps {
    cursor: Date;
    byDay: Map<DayKey, CalendarEntry[]>;
    onPickDay: (key: DayKey) => void;
    onPickMonth: (month: Date) => void;
}

export const KanbanYearGrid = memo(({ cursor, byDay, onPickDay, onPickMonth }: KanbanYearGridProps) => {
    const today = todayKey();

    return (
        <div className={styles.yearGrid}>
            {yearMonths(cursor).map((month) => {
                const first = startOfMonth(month);
                const leading = first.getDay();
                const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

                return (
                    <section key={month.getMonth()} className={styles.miniMonth}>
                        <button
                            type="button"
                            className={`${styles.miniMonthName} nodrag`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onPickMonth(month);
                            }}
                        >
                            {month.toLocaleDateString(undefined, { month: 'long' })}
                        </button>

                        <div className={styles.miniWeekdays} aria-hidden="true">
                            {WEEKDAY_INITIALS.map((letter, i) => (
                                <span key={i}>{letter}</span>
                            ))}
                        </div>

                        <div className={styles.miniDays}>
                            {Array.from({ length: leading }, (_, i) => (
                                <span key={`pad-${i}`} className={styles.miniPad} />
                            ))}

                            {Array.from({ length: days }, (_, i) => {
                                const date = new Date(month.getFullYear(), month.getMonth(), i + 1, 12);
                                const key = dayKey(date);
                                const count = byDay.get(key)?.length ?? 0;

                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        className={`${styles.miniDay} nodrag`}
                                        data-density={densityStep(count)}
                                        data-today={key === today || undefined}
                                        title={`${date.toLocaleDateString()} — ${
                                            count === 1 ? '1 card' : `${count} cards`
                                        }`}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPickDay(key);
                                        }}
                                    >
                                        {i + 1}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
});

KanbanYearGrid.displayName = 'KanbanYearGrid';
