/**
 * The board's calendar view.
 *
 * The same cards the lanes hold, read by time instead of by status. Nothing is
 * copied and nothing is converted: a day is one value of one *date* field on
 * the board's children, exactly as a lane is one value of one metadata field,
 * so a due date set here shows up in the card's own metadata panel and a due
 * date set there lands on the right cell without anything being synchronised.
 *
 * It owns no DndContext. The board's one context wraps both views and branches
 * its handlers on the view mode — the two are mutually exclusive, so a second
 * context would only mean two overlays to keep in step. See KanbanNode.
 *
 * What is local to this component, and stays local: the cursor (which screenful
 * of time you are looking at) and whether the tray is folded away. Persisting
 * the cursor would write to the store — and mark the document cloud-dirty — on
 * every arrow press, and would couple the canvas copy of a board to the
 * fullscreen copy, so paging one would page the other.
 */

import { memo, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus } from '../../components/icons';

import { useStore } from '../../store/useStore';
import type { NoteNode } from '../../types';
import {
    addDays,
    addMonths,
    addYears,
    dayKey,
    fromDayKey,
    monthMatrix,
    startOfMonth,
    startOfWeek,
    todayKey,
    weekDays,
    type DayKey,
} from '../../utils/cardDate';
import { KanbanCalendarDay } from './KanbanCalendarDay';
import { KanbanTimeGrid } from './KanbanTimeGrid';
import { KanbanCalendarTray } from './KanbanCalendarTray';
import { KanbanYearGrid } from './KanbanYearGrid';
import { buildCalendarIndex, type CalendarEntry } from './calendarModel';
import {
    CALENDAR_SCALES,
    CALENDAR_SCALE_LABEL,
    GRANULARITIES,
    GRANULARITY_LABEL,
    cardValue,
    dateFieldOf,
    granularityOf,
    toneOf,
    type BoardChild,
    type KanbanCalendarScale,
    type KanbanColumn,
    type KanbanGranularity,
    type KanbanNodeData,
    type KanbanTone,
} from './kanbanTypes';
import styles from './KanbanCalendar.module.css';
import toolbar from './KanbanNode.module.css';
import { Tabs, type TabItem } from '../../components/ui/Tabs';

/* The toolbar's two exclusive pickers, built from the same lists the calendar
   already keys everything else off. */
const GRANULARITY_TABS: TabItem<KanbanGranularity>[] = GRANULARITIES.map((id) => ({
    id,
    label: GRANULARITY_LABEL[id],
}));

const SCALE_TABS: TabItem<KanbanCalendarScale>[] = CALENDAR_SCALES.map((id) => ({
    id,
    label: CALENDAR_SCALE_LABEL[id],
}));

/**
 * How many chips of each kind a month cell draws before the rest collapse into
 * "+N more".
 *
 * A budget per mode rather than one number, because the cell is a fixed height
 * and the two chips are different sizes: a card chip is 19px, a task chip 18.
 * At 104px 'cards' fits three; at 132px 'both' fits two cards and three tasks,
 * and 'tasks' — which draws no card chips at all — fits five.
 */
const MONTH_BUDGET: Record<KanbanGranularity, { cards: number; tasks: number }> = {
    cards: { cards: 3, tasks: 0 },
    tasks: { cards: 0, tasks: 5 },
    both: { cards: 2, tasks: 3 },
};

/** Sunday first, matching CustomDatePicker and the year grid. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface KanbanCalendarProps {
    boardId: string;
    data: KanbanNodeData;
    cards: BoardChild[];
    /** The board's resolved lanes, read only for their colours. */
    columns: KanbanColumn[];
    cursor: Date;
    onCursorChange: (next: Date) => void;
    scale: KanbanCalendarScale;
    onScaleChange: (next: KanbanCalendarScale) => void;
    onGranularityChange: (next: KanbanGranularity) => void;
    trayCollapsed: boolean;
    onTrayToggle: () => void;
    onOpenCard: (id: string) => void;
    onAddCardOn: (key: DayKey) => void;
    /** Commits an edge drag in the hour grid. */
    onResizeCard: (cardId: string, dayKey: DayKey, startMinutes: number, endMinutes: number) => void;
    fullscreenView?: boolean;
}

export const KanbanCalendar = memo(({
    boardId, data, cards, columns, cursor, onCursorChange, scale, onScaleChange,
    onGranularityChange, trayCollapsed, onTrayToggle, onOpenCard, onAddCardOn,
    onResizeCard, fullscreenView,
}: KanbanCalendarProps) => {
    const field = dateFieldOf(data);

    /* Created is a fact, not a plan — and it is the stable sort fallback the
       board orders lanes by besides, so a drag that rewrote it would silently
       reshuffle a board nobody was editing. */
    const readOnly = field === 'createdAt';

    /* A task carries only startDate and dueDate, so Created can place none of
       them. Rather than showing an empty Tasks mode, the switch is hidden and
       the calendar falls back to cards — the field is read-only anyway, and a
       task pool you cannot schedule from is worse than no pool. */
    const canShowTasks = !readOnly;
    const granularity = canShowTasks ? granularityOf(data) : 'cards';
    const showTasks = granularity !== 'cards';
    const budget = MONTH_BUDGET[granularity];

    const index = useMemo(
        () => buildCalendarIndex(cards, field, data.cardOrder, showTasks),
        [cards, field, data.cardOrder, showTasks],
    );

    const malformedIds = useMemo(
        () => new Set(index.malformed.map((c) => c.id)),
        [index.malformed],
    );

    /* A chip wears the colour of the lane its card sits in on the board view,
       so the two readings of one board share a palette. */
    const toneByValue = useMemo(() => {
        const map = new Map<string, KanbanTone>();
        for (const column of columns) map.set(column.value, toneOf(column));
        return map;
    }, [columns]);

    const toneOfNote = useCallback(
        (card: NoteNode): KanbanTone =>
            toneByValue.get(cardValue(card.data, data.groupBy)) ?? 'neutral',
        [toneByValue, data.groupBy],
    );
    const toneOfEntry = useCallback(
        (entry: CalendarEntry) => toneOfNote(entry.card),
        [toneOfNote],
    );

    /* A card dragged in from the canvas is a React Flow gesture that never
       reaches dnd-kit, so the calendar advertises itself the way a lane does
       and washes while one is held over it. */
    const isCanvasTarget = useStore(
        (s) => s.interactionState.hoveredKanbanLane?.boardId === boardId,
    );

    const today = todayKey();

    /* ------------------------------------------------------------- paging */

    const step = useCallback((direction: 1 | -1) => {
        switch (scale) {
            case 'day':
                return onCursorChange(addDays(cursor, direction));
            case 'week':
                return onCursorChange(addDays(cursor, 7 * direction));
            case 'year':
                return onCursorChange(addYears(cursor, direction));
            case 'month':
            default:
                /* Normalised to the 1st before stepping. Paging from a cursor
                   sitting on the 31st would otherwise clamp into February and
                   then step out of it again, skipping the month entirely. */
                return onCursorChange(addMonths(startOfMonth(cursor), direction));
        }
    }, [scale, cursor, onCursorChange]);

    const goToDay = useCallback((key: DayKey) => {
        const date = fromDayKey(key);
        if (!date) return;
        onCursorChange(date);
        onScaleChange('day');
    }, [onCursorChange, onScaleChange]);

    const title = useMemo(() => {
        switch (scale) {
            case 'day':
                return cursor.toLocaleDateString(undefined, {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                });
            case 'week': {
                const from = startOfWeek(cursor);
                const to = addDays(from, 6);
                const sameMonth = from.getMonth() === to.getMonth();
                return `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${
                    to.toLocaleDateString(undefined, sameMonth
                        ? { day: 'numeric', year: 'numeric' }
                        : { day: 'numeric', month: 'short', year: 'numeric' })}`;
            }
            case 'year':
                return String(cursor.getFullYear());
            case 'month':
            default:
                return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        }
    }, [scale, cursor]);

    /* --------------------------------------------------------------- grid */

    const grid = useMemo(() => {
        const entriesFor = (key: DayKey) => index.byDay.get(key) ?? [];

        if (scale === 'year') {
            return (
                <KanbanYearGrid
                    cursor={cursor}
                    byDay={index.byDay}
                    onPickDay={goToDay}
                    onPickMonth={(month) => {
                        onCursorChange(month);
                        onScaleChange('month');
                    }}
                />
            );
        }

        if (scale === 'day') {
            return (
                <KanbanTimeGrid
                    days={[cursor]}
                    entriesFor={entriesFor}
                    field={field}
                    toneOfCard={toneOfEntry}
                    readOnly={readOnly}
                    onAddCard={onAddCardOn}
                    onOpenCard={onOpenCard}
                    onResize={onResizeCard}
                    variant="day"
                />
            );
        }

        if (scale === 'week') {
            return (
                <KanbanTimeGrid
                    days={weekDays(cursor)}
                    entriesFor={entriesFor}
                    field={field}
                    toneOfCard={toneOfEntry}
                    readOnly={readOnly}
                    onAddCard={onAddCardOn}
                    onOpenCard={onOpenCard}
                    onResize={onResizeCard}
                    variant="week"
                />
            );
        }

        const month = cursor.getMonth();
        return (
            <div className={styles.monthGrid}>
                <div className={styles.weekdayRow} aria-hidden="true">
                    {WEEKDAY_NAMES.map((name) => (
                        <span key={name} className={styles.weekdayCell}>{name.slice(0, 3)}</span>
                    ))}
                </div>

                <div className={styles.monthCells}>
                    {monthMatrix(cursor).map((date) => {
                        const key = dayKey(date);
                        return (
                            <KanbanCalendarDay
                                key={key}
                                date={date}
                                dayKey={key}
                                entries={entriesFor(key)}
                                taskEntries={showTasks ? index.tasksByDay.get(key) : undefined}
                                toneOfCard={toneOfEntry}
                                toneOfNote={toneOfNote}
                                isToday={key === today}
                                isOutside={date.getMonth() !== month}
                                maxChips={budget.cards}
                                maxTaskChips={budget.tasks}
                                variant="month"
                                readOnly={readOnly}
                                onAddCard={onAddCardOn}
                                onOpenCard={onOpenCard}
                                onOverflow={goToDay}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }, [
        scale, cursor, index.byDay, index.tasksByDay, today, field, toneOfEntry, toneOfNote,
        readOnly, showTasks, budget, onAddCardOn, onOpenCard, onResizeCard,
        onCursorChange, onScaleChange, goToDay,
    ]);

    return (
        <div
            className={`${styles.calendar} ${fullscreenView ? styles.fullscreenView : ''}`}
            data-over={isCanvasTarget || undefined}
            /* Drives the cell height: tasks need two more rows than cards do,
               and the cell is a fixed constant per mode. See the module. */
            data-granularity={granularity}
            /* Read by useCanvasNodeDrag via elementsFromPoint. An empty lane
               value is accepted there and writes `undefined` onto the card, so
               a card dragged from the canvas onto the calendar joins the board
               with no group value and no date — and lands in the tray, which is
               where undated cards belong. */
            data-kanban-board={boardId}
            data-kanban-lane=""
        >
            <header className={styles.calHead}>
                <div className={styles.nav}>
                    <button
                        type="button"
                        className={`${styles.navBtn} nodrag`}
                        aria-label="Previous"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); step(-1); }}
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        type="button"
                        className={`${styles.todayBtn} nodrag`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onCursorChange(new Date()); }}
                    >
                        Today
                    </button>
                    <button
                        type="button"
                        className={`${styles.navBtn} nodrag`}
                        aria-label="Next"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); step(1); }}
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>

                <h2 className={styles.calTitle}>{title}</h2>

                <div className={styles.calTools}>
                    {readOnly && (
                        <span className={styles.readOnlyNote} title="Pick Due date or Start date to schedule by dragging.">
                            Created is read-only
                        </span>
                    )}

                    {/* What a day is made of. Hidden on Created, which no task
                        can answer — see `canShowTasks`. */}
                    {canShowTasks && (
                        <div
                            className={`${toolbar.viewToggle} nodrag`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Tabs
                                items={GRANULARITY_TABS}
                                value={granularity}
                                onChange={onGranularityChange}
                                variant="light"
                                color="accent"
                                size="sm"
                                semantics="radio"
                                aria-label="Show on days"
                            />
                        </div>
                    )}

                    {/* The same segmented control as the board's view switcher,
                        deliberately: two controls that must read as one family
                        share the classes rather than resembling each other. */}
                    <div
                        className={`${toolbar.viewToggle} nodrag`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Tabs
                            items={SCALE_TABS}
                            value={scale}
                            onChange={onScaleChange}
                            variant="light"
                            color="accent"
                            size="sm"
                            semantics="radio"
                            aria-label="Calendar range"
                        />
                    </div>

                    <button
                        type="button"
                        className={`${styles.addHere} nodrag`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onAddCardOn(dayKey(scale === 'day' ? cursor : new Date()));
                        }}
                    >
                        <Plus size={13} strokeWidth={2.5} />
                        Add card
                    </button>
                </div>
            </header>

            <div className={styles.calBody}>
                {grid}

                <KanbanCalendarTray
                    cards={index.unscheduled}
                    taskGroups={showTasks ? index.unscheduledTasks : undefined}
                    toneOfNote={toneOfNote}
                    malformed={malformedIds}
                    excluded={index.excluded}
                    collapsed={trayCollapsed}
                    onToggle={onTrayToggle}
                    readOnly={readOnly}
                    onOpenCard={onOpenCard}
                />
            </div>
        </div>
    );
});

KanbanCalendar.displayName = 'KanbanCalendar';

