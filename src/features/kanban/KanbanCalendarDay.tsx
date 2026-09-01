/**
 * One day of the calendar — a cell in the month grid, a column in the week.
 *
 * Unlike KanbanLane, this owns its own `isOver`. A lane has to be told whether
 * it is the drop target because its nested card droppables swallow the
 * collision; a day cell has no nested droppables at all (chips are draggable
 * only — see KanbanCalendarChip), so `useDroppable().isOver` is both correct
 * here and cheaper: it re-renders one cell instead of all forty-two.
 *
 * The cell itself carries no `nodrag`. The empty parts of the grid are still
 * how you pick the board up, which is what keeps a board feeling like one
 * object rather than a collection of widgets.
 */

import { memo, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from '../../components/icons';

import type { NoteNode } from '../../types';
import type { DayKey } from '../../utils/cardDate';
import { KanbanCalendarChip } from './KanbanCalendarChip';
import { KanbanCalendarTaskChip } from './KanbanCalendarTaskChip';
import {
    dayTaskProgress,
    labelsSegment,
    segmentOf,
    type CalendarEntry,
    type CalendarTaskEntry,
} from './calendarModel';
import { dayDroppableId, type KanbanTone } from './kanbanTypes';
import styles from './KanbanCalendar.module.css';

export interface KanbanCalendarDayProps {
    date: Date;
    dayKey: DayKey;
    entries: CalendarEntry[];
    /** The day's tasks, in their cards' board order. Empty unless the calendar
     *  is showing tasks — see `granularityOf`. */
    taskEntries?: CalendarTaskEntry[];
    /** Lane colours by group value, so a chip matches its column. */
    toneOfCard: (entry: CalendarEntry) => KanbanTone;
    /** The same lookup for a bare card — a task chip has no span to pass. */
    toneOfNote?: (card: NoteNode) => KanbanTone;
    isToday: boolean;
    /** A leading or trailing day from a neighbouring month. */
    isOutside?: boolean;
    /** Card chips drawn before the rest collapse into "+N more". */
    maxChips: number;
    /** Task chips drawn before the rest collapse. Counted into the same
     *  "+N more", because the user is asking one question: what else is here. */
    maxTaskChips?: number;
    /** Print every title rather than only the first of each week row. */
    alwaysLabel?: boolean;
    /** The calendar is showing a read-only date field, so nothing may be dragged. */
    readOnly?: boolean;
    /** 'month' is a fixed-height cell; 'week' is a column that grows. */
    variant: 'month' | 'week';
    onAddCard: (key: DayKey) => void;
    onOpenCard: (id: string) => void;
    /** "+N more" — drills into the day rather than opening a popover. */
    onOverflow: (key: DayKey) => void;
    /**
     * Rendered inside the cell, below the chips.
     *
     * Day view puts its full cards here rather than beside the cell, so that
     * the whole surface a card is drawn on is also the surface it can be
     * dropped onto. A droppable that is only the day's header strip looks like
     * a drop target that ignores you.
     */
    children?: ReactNode;
}

export const KanbanCalendarDay = memo(({
    date, dayKey, entries, taskEntries, toneOfCard, toneOfNote, isToday, isOutside, maxChips,
    maxTaskChips = 0, alwaysLabel, readOnly, variant, onAddCard, onOpenCard, onOverflow, children,
}: KanbanCalendarDayProps) => {
    const { setNodeRef, isOver } = useDroppable({
        id: dayDroppableId(dayKey),
        data: { type: 'day', dayKey },
    });

    const tasks = taskEntries ?? [];
    const shown = entries.slice(0, maxChips);
    const shownTasks = tasks.slice(0, maxTaskChips);
    /* One count for both pools. "+2 more" answers "what else is on this day",
       and splitting it into cards and tasks would make the user add up two
       numbers to get the answer they actually wanted. */
    const hidden = (entries.length - shown.length) + (tasks.length - shownTasks.length);

    /* Drawn from every task on the day, not only the ones that fitted: a badge
       that changed when a chip scrolled out of view would be lying. */
    const progress = dayTaskProgress(taskEntries);
    const complete = progress !== null && progress.done === progress.total;

    return (
        <div
            ref={setNodeRef}
            className={styles.day}
            data-variant={variant}
            data-today={isToday || undefined}
            data-outside={isOutside || undefined}
            data-over={isOver || undefined}
            /* Read by useCanvasNodeDrag via elementsFromPoint. Present so a
               later version can schedule a card dragged in from the canvas;
               today the calendar root claims the whole board (see
               KanbanCalendar), and a card dropped anywhere on it joins
               undated. */
            data-kanban-day={dayKey}
        >
            <header className={styles.dayHead}>
                <span className={styles.dayNum}>
                    {variant === 'week'
                        ? date.toLocaleDateString(undefined, { weekday: 'short' })
                        : date.getDate()}
                </span>
                {variant === 'week' && <span className={styles.dayNumBig}>{date.getDate()}</span>}

                {progress && (
                    <span
                        className={styles.dayTasks}
                        data-complete={complete || undefined}
                        title={`${progress.done} of ${progress.total} tasks done on this day`}
                    >
                        {progress.done}/{progress.total}
                    </span>
                )}

                <button
                    type="button"
                    className={`${styles.dayAdd} nodrag`}
                    title={`Add a card on ${date.toLocaleDateString()}`}
                    aria-label={`Add a card on ${date.toLocaleDateString()}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddCard(dayKey);
                    }}
                >
                    <Plus size={12} strokeWidth={2.5} />
                </button>
            </header>

            <div className={styles.dayBody}>
                {shown.map((entry) => (
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

                {/* Tasks after cards, always. A task belongs to a card, so a
                    cell that interleaved them would break the one relationship
                    the spine exists to draw. */}
                {shownTasks.map(({ card, task }) => (
                    <KanbanCalendarTaskChip
                        key={`${card.id}:${task.id}`}
                        card={card}
                        task={task}
                        tone={toneOfNote?.(card)}
                        disabled={readOnly}
                    />
                ))}

                {hidden > 0 && (
                    /* Drills into the day rather than opening a popover. A card
                       clips its own overflow and lives inside a scaled canvas,
                       so anything anchored here would be cropped at the cell
                       edge and mis-scaled besides — the same reason the icon
                       picker portals itself out. Day view needs no portal and
                       lands the user somewhere they can actually work. */
                    <button
                        type="button"
                        className={`${styles.dayMore} nodrag`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onOverflow(dayKey);
                        }}
                    >
                        +{hidden} more
                    </button>
                )}

                {children}
            </div>
        </div>
    );
});

KanbanCalendarDay.displayName = 'KanbanCalendarDay';
