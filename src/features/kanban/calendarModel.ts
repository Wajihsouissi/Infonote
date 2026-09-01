/**
 * The calendar's read model: cards in, days out.
 *
 * Kept apart from the components for the same reason `groupCards` is kept apart
 * from the lanes — placing a card on a day is the part that can be wrong in a
 * way you cannot see, so it is a pure function over plain data rather than
 * something happening inside a render.
 *
 * The index is built once per (cards, field, order) and every scale reads the
 * same map, so paging from March to April — or from Month to Year — is pure
 * rendering with no re-bucketing.
 */

import type { BoardChild, KanbanDateField } from './kanbanTypes';
import { byBoardOrder, rankOf } from './kanbanTypes';
import { cardTasks, type CardTask } from '../card/cardTasks';
import type { NoteNode } from '../../types';
import { cardSpan, dayKeyOf, parseCardTime, type CardSpan, type DayKey } from '../../utils/cardDate';

/** One card's occupancy of one day. A span produces several of these. */
export interface CalendarEntry {
    card: NoteNode;
    span: CardSpan;
    /** Which day of the span this is — 0 is the first day the card occupies. */
    index: number;
}

/**
 * One task placed on one day.
 *
 * Deliberately not a `CalendarEntry`: a task occupies a single day and never a
 * span. It carries both dates in `data.tasks`, but drawing a bar for a task
 * inside a cell that is already drawing bars for cards would give the two
 * objects the same shape, and the whole point of the task chip is that it does
 * not look like a card. If a task ever needs a span, it wants its own row in
 * the hour grid, not a second kind of stripe.
 */
export interface CalendarTaskEntry {
    /** The card the task belongs to — its colour, and the way back to it. */
    card: NoteNode;
    task: CardTask;
}

/** A card's tasks that carry no date for the field being shown. */
export interface UnscheduledTaskGroup {
    card: NoteNode;
    tasks: CardTask[];
}

export interface CalendarIndex {
    /** Every day that holds something, in board order within each day. */
    byDay: Map<DayKey, CalendarEntry[]>;
    /**
     * Tasks placed on days, in the same order their cards are in.
     *
     * Empty unless the caller asked for tasks — building it walks every card's
     * body blocks, which is real work to do on a board whose calendar is only
     * ever showing cards. See `includeTasks`.
     */
    tasksByDay: Map<DayKey, CalendarTaskEntry[]>;
    /**
     * Open tasks carrying no date for this field, grouped by the card that owns
     * them — the tray's second section, and the pool you drag onto a day.
     * Completed tasks are left out: they are not waiting for a day.
     *
     * Grouped rather than flat because a task's text is written to be read
     * under its card ("Tier 3 — real toolbars" means nothing on its own), and
     * because the group header is the only place its colour is explained.
     */
    unscheduledTasks: UnscheduledTaskGroup[];
    /** Notes with no usable date for this field. They live in the tray. */
    unscheduled: NoteNode[];
    /**
     * Notes carrying a date string that could not be read at all.
     *
     * A subset of `unscheduled`, tracked separately so the tray can mark them.
     * Broken data shown as broken beats broken data shown as absent: "why is
     * this card not on the calendar" has an answer the user can act on.
     */
    malformed: NoteNode[];
    /**
     * Board children that are not notes.
     *
     * Blocks and fused notes carry no date fields at all (see BoardPlanningFields
     * in kanbanTypes and the data types in src/types.ts), so they cannot be
     * placed and cannot be scheduled by dragging either. They are counted, not
     * listed: a tray item that can never leave the tray is an affordance that
     * fails every time it is used.
     */
    excluded: number;
}

/** True when the card has something in the field but it could not be parsed. */
const hasUnreadableDate = (card: NoteNode, field: KanbanDateField): boolean => {
    const raw = field === 'createdAt' ? card.data.createdAt : card.data[field];
    return typeof raw === 'string' && raw.trim().length > 0;
};

/**
 * Bucket a board's children by the days they occupy.
 *
 * One pass, whatever the scale — the year view and the day view read the same
 * map. Days are keyed by `DayKey` (`YYYY-MM-DD`, zero-padded), which is both
 * the leading ten characters of the stored value and a valid `<input
 * type="date">` value, so nothing downstream has to re-derive it.
 */
export function buildCalendarIndex(
    cards: BoardChild[],
    field: KanbanDateField,
    cardOrder: string[] = [],
    includeTasks = false,
): CalendarIndex {
    const byDay = new Map<DayKey, CalendarEntry[]>();
    const tasksByDay = new Map<DayKey, CalendarTaskEntry[]>();
    const unscheduledTasks: UnscheduledTaskGroup[] = [];
    const unscheduled: NoteNode[] = [];
    const malformed: NoteNode[] = [];
    let excluded = 0;

    for (const card of cards) {
        if (card.type !== 'note') {
            excluded++;
            continue;
        }

        if (includeTasks) collectTasks(card, field, tasksByDay, unscheduledTasks);

        const span = cardSpan(card.data.startDate, card.data.dueDate, field, card.data.createdAt);
        if (!span) {
            unscheduled.push(card);
            if (hasUnreadableDate(card, field)) malformed.push(card);
            continue;
        }

        span.keys.forEach((key, index) => {
            const bucket = byDay.get(key);
            if (bucket) bucket.push({ card, span, index });
            else byDay.set(key, [{ card, span, index }]);
        });
    }

    /* The board's own comparator, not a calendar-local one: two views that sort
       the same cards differently are two views disagreeing about which card is
       first. See byBoardOrder. */
    const compare = byBoardOrder(rankOf(cardOrder));
    for (const bucket of byDay.values()) {
        bucket.sort((a, b) => compare(a.card, b.card));
    }
    unscheduled.sort(compare);

    /* Tasks inherit their card's place in the board order, and keep body order
       within a card — that is reading order, and it is the order the card's own
       checklist shows. The sort is stable, so the second clause never fires
       between two tasks of one card. */
    for (const bucket of tasksByDay.values()) {
        bucket.sort((a, b) => compare(a.card, b.card));
    }
    unscheduledTasks.sort((a, b) => compare(a.card, b.card));

    return { byDay, tasksByDay, unscheduledTasks, unscheduled, malformed, excluded };
}

/**
 * One card's tasks, split into the days they fall on and the ones with no date.
 *
 * A task carries `startDate` and `dueDate` and nothing else, so `createdAt`
 * places none of them — which is right rather than a gap: that field is the
 * calendar's read-only mode, and a task pool you cannot schedule from is worse
 * than no pool at all. The caller only asks for tasks when the field is one a
 * task can answer.
 */
function collectTasks(
    card: NoteNode,
    field: KanbanDateField,
    tasksByDay: Map<DayKey, CalendarTaskEntry[]>,
    unscheduledTasks: UnscheduledTaskGroup[],
): void {
    if (field === 'createdAt') return;

    const tasks = cardTasks(card.data);
    if (tasks.length === 0) return;

    const undated: CardTask[] = [];

    for (const task of tasks) {
        const key = dayKeyOf(task[field]);
        if (!key) {
            /* A finished task with no date is not waiting for one. The tray is
               the pool you drag onto days, so it holds work; a done task stays
               visible on the day it was done, and nowhere else. */
            if (!task.completed) undated.push(task);
            continue;
        }
        const bucket = tasksByDay.get(key);
        if (bucket) bucket.push({ card, task });
        else tasksByDay.set(key, [{ card, task }]);
    }

    if (undated.length > 0) unscheduledTasks.push({ card, tasks: undated });
}

/** How far through its tasks one day is. Null when the day holds none. */
export function dayTaskProgress(
    entries: CalendarTaskEntry[] | undefined,
): { done: number; total: number } | null {
    if (!entries || entries.length === 0) return null;
    return {
        done: entries.filter((e) => e.task.completed).length,
        total: entries.length,
    };
}

/* -------------------------------------------------------------- time grid */

/** A timed event has to be tall enough to read even if it is five minutes. */
export const MIN_EVENT_MINUTES = 30;

/** How long an event runs when only one end of it is known. */
export const DEFAULT_EVENT_MINUTES = 60;

/** One card placed in a day's hour grid. */
export interface TimedEvent {
    entry: CalendarEntry;
    /** Minutes past midnight. */
    start: number;
    /** Minutes past midnight; always greater than `start`. */
    end: number;
    /** Which of the overlapping columns this event sits in. */
    column: number;
    /** How many columns the overlapping group was split into. */
    columns: number;
}

/**
 * A day's entries split into the all-day strip and the hour grid.
 *
 * A card is timed only when the field the calendar is placing by carries a
 * clock reading — see `parseCardTime`, and note that midnight means "no time"
 * because that is what the date picker writes for a plain day. Everything else
 * goes to the all-day strip above the grid, which is where a date-only card
 * honestly belongs: it names a day, not an hour.
 */
export function splitDayEntries(
    entries: CalendarEntry[],
    field: KanbanDateField,
): { allDay: CalendarEntry[]; timed: TimedEvent[] } {
    const allDay: CalendarEntry[] = [];
    const raw: { entry: CalendarEntry; start: number; end: number }[] = [];

    for (const entry of entries) {
        const { startDate, dueDate, createdAt } = entry.card.data;
        const anchorRaw = field === 'startDate' ? startDate
            : field === 'createdAt' ? createdAt
                : dueDate;
        const start = parseCardTime(anchorRaw);

        if (start === null) {
            allDay.push(entry);
            continue;
        }

        /* Both ends on the same day give a real duration; anything else gets
           the default block, because a start with no end is not a zero-length
           event — it is an event of unknown length. */
        const partner = field === 'startDate' ? parseCardTime(dueDate) : parseCardTime(startDate);
        const sameDay = entry.span.keys.length === 1;
        let end = start + DEFAULT_EVENT_MINUTES;
        if (partner !== null && sameDay) {
            const [lo, hi] = field === 'startDate' ? [start, partner] : [partner, start];
            if (hi > lo) {
                raw.push({ entry, start: lo, end: Math.max(hi, lo + MIN_EVENT_MINUTES) });
                continue;
            }
        }
        end = Math.max(end, start + MIN_EVENT_MINUTES);
        raw.push({ entry, start, end });
    }

    return { allDay, timed: packColumns(raw) };
}

/**
 * Lay overlapping events out side by side.
 *
 * Events are swept in start order and grouped into runs that overlap something
 * already in the run; each run is split into as many columns as its busiest
 * moment needs, and every event in it is measured against that same number so
 * the group reads as one block of columns rather than a staircase.
 */
function packColumns(
    raw: { entry: CalendarEntry; start: number; end: number }[],
): TimedEvent[] {
    const sorted = [...raw].sort((a, b) => a.start - b.start || a.end - b.end);
    const out: TimedEvent[] = [];

    let run: TimedEvent[] = [];
    let runEnd = -1;

    const closeRun = () => {
        if (run.length === 0) return;
        const width = Math.max(...run.map((e) => e.column)) + 1;
        for (const event of run) event.columns = width;
        out.push(...run);
        run = [];
        runEnd = -1;
    };

    for (const item of sorted) {
        // A gap means the previous overlap group is finished.
        if (item.start >= runEnd) closeRun();

        // The leftmost column no event still running is occupying.
        const taken = new Set(run.filter((e) => e.end > item.start).map((e) => e.column));
        let column = 0;
        while (taken.has(column)) column++;

        run.push({ ...item, column, columns: 1 });
        runEnd = Math.max(runEnd, item.end);
    }
    closeRun();

    return out;
}

/** Which part of a bar one day holds — drives the chip's shape. */
export type SpanSegment = 'solo' | 'start' | 'mid' | 'end';

/** The segment an entry draws in its cell. */
export const segmentOf = (entry: CalendarEntry): SpanSegment => {
    if (!entry.span.isSpan) return 'solo';
    if (entry.index === 0) return 'start';
    if (entry.index === entry.span.keys.length - 1) return 'end';
    return 'mid';
};

/**
 * Whether this cell prints the card's title.
 *
 * The first day of a span, and again on every Sunday, so a bar that runs into a
 * second week row still says what it is instead of becoming an anonymous
 * stripe. `alwaysLabel` is for the week and day scales, where there is room and
 * every column is read on its own.
 */
export const labelsSegment = (entry: CalendarEntry, date: Date, alwaysLabel: boolean): boolean =>
    alwaysLabel || entry.index === 0 || date.getDay() === 0;
