/**
 * The hour grid — Day and Week.
 *
 * One component for both, because they are the same thing at different widths:
 * a column of hour labels, then one column per day with events placed at their
 * time and sized by their duration. Week is seven of those columns; Day is one.
 *
 * Two rows above the grid, in the order a calendar reads:
 *  - the day headers, and
 *  - the all-day strip, which is where a card that names a day but no hour
 *    goes. That strip is not a fallback — it is the honest home for most of
 *    this app's cards, because the date picker writes a day, not a time. A
 *    grid that guessed an hour for them would be inventing information.
 *
 * Positioning is percentage-based against a fixed pixel height per hour, so a
 * card sits at the same place whatever the canvas zoom is doing, and nothing
 * here measures the DOM.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from '../../components/icons';

import {
    MINUTES_PER_DAY,
    dayKey,
    formatHour,
    todayKey,
    type DayKey,
} from '../../utils/cardDate';
import { KanbanCalendarChip } from './KanbanCalendarChip';
import { KanbanTimedEvent } from './KanbanTimedEvent';
import { labelsSegment, segmentOf, splitDayEntries, type CalendarEntry } from './calendarModel';
import { dayDroppableId, slotDroppableId, type KanbanDateField, type KanbanTone } from './kanbanTypes';
import styles from './KanbanTimeGrid.module.css';

/** Height of one hour of the grid. Everything else is a fraction of this. */
const HOUR_HEIGHT = 52;

/** Drops snap to this, which is what a calendar's half-hour lines imply. */
const SLOT_MINUTES = 30;

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** One droppable per half hour, per day — the drop target for a time. */
const SLOTS_PER_DAY = MINUTES_PER_DAY / SLOT_MINUTES;

interface DayColumnProps {
    key_: DayKey;
    entries: CalendarEntry[];
    field: KanbanDateField;
    toneOfCard: (entry: CalendarEntry) => KanbanTone;
    readOnly?: boolean;
    onOpenCard: (id: string) => void;
    onResize: (cardId: string, dayKey: string, startMinutes: number, endMinutes: number) => void;
}

/** The stack of half-hour drop targets behind one day's events. */
const SlotColumn = memo(({ dayKey: key, readOnly }: { dayKey: DayKey; readOnly?: boolean }) => (
    <div className={styles.slots} aria-hidden="true">
        {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
            <Slot key={i} dayKey={key} minutes={i * SLOT_MINUTES} disabled={readOnly} />
        ))}
    </div>
));
SlotColumn.displayName = 'SlotColumn';

const Slot = memo(({ dayKey: key, minutes, disabled }: {
    dayKey: DayKey; minutes: number; disabled?: boolean;
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id: slotDroppableId(key, minutes),
        data: { type: 'slot', dayKey: key, minutes },
        disabled,
    });
    return (
        <div
            ref={setNodeRef}
            className={styles.slot}
            data-over={isOver || undefined}
            /* Names the time this slot stands for. Read by the e2e suite, which
               has to aim at a slot rather than compute an offset — the board
               lives on a zoomed canvas, so screen pixels are not grid minutes. */
            data-slot-day={key}
            data-slot={minutes}
            style={{ height: (HOUR_HEIGHT * SLOT_MINUTES) / 60 }}
        />
    );
});
Slot.displayName = 'Slot';

const DayColumn = memo(({
    key_, entries, field, toneOfCard, readOnly, onOpenCard, onResize,
}: DayColumnProps) => {
    const { timed } = useMemo(() => splitDayEntries(entries, field), [entries, field]);

    return (
        <div className={styles.dayColumn} data-today={key_ === todayKey() || undefined}>
            <SlotColumn dayKey={key_} readOnly={readOnly} />

            {timed.map((event) => (
                <KanbanTimedEvent
                    key={event.entry.card.id}
                    event={event}
                    hourHeight={HOUR_HEIGHT}
                    tone={toneOfCard(event.entry)}
                    readOnly={readOnly}
                    onOpen={onOpenCard}
                    onResize={onResize}
                    dayKey={key_}
                />
            ))}

            {key_ === todayKey() && <NowLine />}
        </div>
    );
});
DayColumn.displayName = 'DayColumn';

/**
 * Minutes past midnight, right now, re-read on the turn of each minute.
 *
 * The first wait is short — however long is left of the current minute — so the
 * line moves when the clock does rather than up to 59 seconds late.
 */
function useMinutesNow(): number {
    const [minutes, setMinutes] = useState(() => {
        const now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    });

    useEffect(() => {
        const read = () => {
            const now = new Date();
            setMinutes(now.getHours() * 60 + now.getMinutes());
        };
        const now = new Date();
        const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

        let interval: ReturnType<typeof setInterval> | undefined;
        const timeout = setTimeout(() => {
            read();
            interval = setInterval(read, 60_000);
        }, msToNextMinute);

        return () => {
            clearTimeout(timeout);
            if (interval) clearInterval(interval);
        };
    }, []);

    return minutes;
}

/** Where we are in the day. */
const NowLine = memo(() => {
    const minutes = useMinutesNow();
    return (
        <div
            className={styles.nowLine}
            style={{ top: (minutes / 60) * HOUR_HEIGHT }}
            aria-hidden="true"
        >
            <span className={styles.nowDot} />
        </div>
    );
});
NowLine.displayName = 'NowLine';

export interface KanbanTimeGridProps {
    /** One column per day: seven for a week, one for a day. */
    days: Date[];
    entriesFor: (key: DayKey) => CalendarEntry[];
    field: KanbanDateField;
    toneOfCard: (entry: CalendarEntry) => KanbanTone;
    readOnly?: boolean;
    onAddCard: (key: DayKey) => void;
    onOpenCard: (id: string) => void;
    /** Commits an edge drag: the card, and its new start and end in minutes. */
    onResize: (cardId: string, dayKey: string, startMinutes: number, endMinutes: number) => void;
    /** 'day' drops the weekday header down to a single line. */
    variant: 'day' | 'week';
}

export const KanbanTimeGrid = memo(({
    days, entriesFor, field, toneOfCard, readOnly, onAddCard, onOpenCard, onResize, variant,
}: KanbanTimeGridProps) => {
    const bodyRef = useRef<HTMLDivElement>(null);
    const today = todayKey();

    /* Open on the working day rather than on midnight. Done once per mount, not
       on every render, so paging a week does not yank the reader back to 8am
       after they have scrolled to the evening. */
    useEffect(() => {
        const body = bodyRef.current;
        if (body) body.scrollTop = 8 * HOUR_HEIGHT;
    }, []);

    const columns = useMemo(
        () => days.map((date) => ({ date, key: dayKey(date), entries: entriesFor(dayKey(date)) })),
        [days, entriesFor],
    );

    const allDayRows = useMemo(
        () => columns.map((c) => splitDayEntries(c.entries, field).allDay),
        [columns, field],
    );

    const hasAllDay = allDayRows.some((row) => row.length > 0);

    return (
        <div className={styles.timeGrid} data-variant={variant}>
            <header className={styles.gridHead}>
                <span className={styles.gutterHead} />
                {columns.map(({ date, key }) => (
                    <div key={key} className={styles.colHead} data-today={key === today || undefined}>
                        <span className={styles.colWeekday}>
                            {date.toLocaleDateString(undefined, { weekday: variant === 'day' ? 'long' : 'short' })}
                        </span>
                        <span className={styles.colDate}>{date.getDate()}</span>
                        <button
                            type="button"
                            className={`${styles.colAdd} nodrag`}
                            title={`Add a card on ${date.toLocaleDateString()}`}
                            aria-label={`Add a card on ${date.toLocaleDateString()}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onAddCard(key); }}
                        >
                            <Plus size={12} strokeWidth={2.5} />
                        </button>
                    </div>
                ))}
            </header>

            {/* The all-day strip. Present whenever anything is in it — a card
                that names a day and no hour belongs here, not at midnight. */}
            {hasAllDay && (
                <div className={styles.allDayRow}>
                    <span className={styles.gutterLabel}>All day</span>
                    {columns.map(({ date, key }, i) => (
                        <AllDayCell
                            key={key}
                            date={date}
                            dayKey={key}
                            entries={allDayRows[i]}
                            toneOfCard={toneOfCard}
                            readOnly={readOnly}
                            onOpenCard={onOpenCard}
                            alwaysLabel={variant === 'day'}
                        />
                    ))}
                </div>
            )}

            <div className={styles.gridBody} ref={bodyRef}>
                <div className={styles.gutter}>
                    {HOURS.map((hour) => (
                        <span key={hour} className={styles.hourLabel} style={{ height: HOUR_HEIGHT }}>
                            {/* The midnight label would sit half outside the
                                scroll box, and nobody needs telling where the
                                top of the day is. */}
                            {hour > 0 && formatHour(hour)}
                        </span>
                    ))}
                </div>

                <div className={styles.gridCols}>
                    {/* One set of lines behind every column, so the rules stay
                        aligned across the week without each column drawing its
                        own and rounding differently. */}
                    <div className={styles.hourLines} aria-hidden="true">
                        {HOURS.map((hour) => (
                            <span key={hour} className={styles.hourLine} style={{ height: HOUR_HEIGHT }} />
                        ))}
                    </div>

                    {columns.map(({ key, entries }) => (
                        <DayColumn
                            key={key}
                            key_={key}
                            entries={entries}
                            field={field}
                            toneOfCard={toneOfCard}
                            readOnly={readOnly}
                            onOpenCard={onOpenCard}
                            onResize={onResize}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
});

KanbanTimeGrid.displayName = 'KanbanTimeGrid';

/** One day's all-day cell, and a drop target for "this day, no time". */
const AllDayCell = memo(({ date, dayKey: key, entries, toneOfCard, readOnly, onOpenCard, alwaysLabel }: {
    date: Date;
    dayKey: DayKey;
    entries: CalendarEntry[];
    toneOfCard: (entry: CalendarEntry) => KanbanTone;
    readOnly?: boolean;
    onOpenCard: (id: string) => void;
    alwaysLabel?: boolean;
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id: dayDroppableId(key),
        data: { type: 'day', dayKey: key },
        disabled: readOnly,
    });

    return (
        <div
            ref={setNodeRef}
            className={styles.allDayCell}
            data-over={isOver || undefined}
            data-kanban-day={key}
        >
            {entries.map((entry) => (
                <KanbanCalendarChip
                    key={entry.card.id}
                    node={entry.card}
                    segment={segmentOf(entry)}
                    showTitle={labelsSegment(entry, date, !!alwaysLabel)}
                    tone={toneOfCard(entry)}
                    inverted={entry.span.inverted}
                    truncated={entry.span.truncated}
                    disabled={readOnly}
                    onOpen={onOpenCard}
                />
            ))}
        </div>
    );
});
AllDayCell.displayName = 'AllDayCell';
