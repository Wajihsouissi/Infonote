/**
 * One card as a block in the hour grid.
 *
 * Positioned by its start time and sized by its duration, in the lane's own
 * colour so a card reads the same here as on the board. Overlapping events are
 * split into columns by `packColumns`; this only renders the slice it was given.
 *
 * Draggable like a chip — the board's one DndContext handles the drop, and a
 * release on a half-hour slot sets the card's time.
 */

import { memo, useCallback, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useReactFlow } from '@xyflow/react';
import { CSS } from '@dnd-kit/utilities';

import { CardIcon, defaultIconName } from '../card/iconMap';
import { taskProgress } from '../card/cardTasks';
import { TaskProgressMeter } from '../card/tasks/TaskProgress';
import { useStore } from '../../store/useStore';
import { formatTimeOfDay } from '../../utils/cardDate';
import { unscale, useKanbanZoom } from './kanbanDragScale';
import type { TimedEvent } from './calendarModel';
import type { KanbanTone } from './kanbanTypes';
import styles from './KanbanTimeGrid.module.css';

/** Under this many minutes there is only room for one line. */
const COMPACT_MINUTES = 45;

/** Resize snaps to this, matching the grid's half-hour drop slots. */
const SNAP_MINUTES = 15;

export interface KanbanTimedEventProps {
    event: TimedEvent;
    hourHeight: number;
    tone?: KanbanTone;
    readOnly?: boolean;
    onOpen: (id: string) => void;
    /** Commits a resize: the card, its day, and the new start and end. */
    onResize: (cardId: string, dayKey: string, startMinutes: number, endMinutes: number) => void;
    /** The day this column stands for — a resize stays inside it. */
    dayKey: string;
}

export const KanbanTimedEvent = memo(({
    event, hourHeight, tone = 'neutral', readOnly, onOpen, onResize, dayKey,
}: KanbanTimedEventProps) => {
    const zoom = useKanbanZoom();
    const { getZoom } = useReactFlow();
    const setTasksCardId = useStore((s) => s.setTasksCardId);
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: event.entry.card.id,
        data: { type: 'chip' },
        disabled: readOnly,
    });

    /**
     * The edge being dragged, and where it has got to.
     *
     * Resizing is deliberately NOT a dnd-kit drag. dnd-kit moves a thing from
     * one droppable to another, which is the wrong shape entirely: nothing is
     * being dropped anywhere, one edge is being pushed along a continuous axis.
     * Pointer capture on the handle gives that directly, and keeps the board's
     * single DndContext free to mean only "this card moved day or time".
     */
    const [resize, setResize] = useState<{ edge: 'start' | 'end'; start: number; end: number } | null>(null);

    const beginResize = useCallback((edge: 'start' | 'end') => (e: React.PointerEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();

        const handle = e.currentTarget as HTMLElement;
        /* Capture is an enhancement, not the mechanism: it keeps the pointer
           bound to the handle if the cursor outruns it, but it throws for a
           pointer the browser does not consider active, and a resize that dies
           on that would be a gesture that silently does nothing. The listeners
           go on `window` either way, which works with or without it. */
        try {
            handle.setPointerCapture(e.pointerId);
        } catch {
            /* no capture — the window listeners below still see the drag */
        }

        const originY = e.clientY;
        const from = { start: event.start, end: event.end };
        let latest = from;

        /* The LIVE canvas zoom, read once as the gesture begins.
           Deliberately not `useKanbanZoom()`, which the board only populates
           for the length of a dnd-kit drag and which therefore reads 1 here —
           dividing screen pixels by 1 on a canvas scaled to 0.6 turned an hour
           of pointer travel into half an hour of calendar. */
        const canvasZoom = getZoom() || 1;

        const move = (ev: PointerEvent) => {
            /* Divided by the canvas zoom for the same reason every other drag on
               this board is — see kanbanDragScale.ts. Screen pixels are not grid
               minutes when the canvas is scaled. */
            const deltaMinutes = ((ev.clientY - originY) / canvasZoom / hourHeight) * 60;
            const snapped = Math.round(deltaMinutes / SNAP_MINUTES) * SNAP_MINUTES;

            latest = edge === 'start'
                ? { start: Math.min(from.start + snapped, from.end - SNAP_MINUTES), end: from.end }
                : { start: from.start, end: Math.max(from.end + snapped, from.start + SNAP_MINUTES) };
            setResize({ edge, ...latest });
        };

        const finish = () => {
            try {
                handle.releasePointerCapture(e.pointerId);
            } catch {
                /* never captured; nothing to release */
            }
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            setResize(null);
            // A resize that changed nothing must not reach the store.
            if (latest.start !== from.start || latest.end !== from.end) {
                onResize(event.entry.card.id, dayKey, latest.start, latest.end);
            }
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
    }, [readOnly, event.start, event.end, event.entry.card.id, dayKey, getZoom, hourHeight, onResize]);

    const { card, span } = event.entry;
    const { data } = card;
    const title = data.label?.trim() || 'Untitled';
    const tasks = taskProgress(data);

    /* While an edge is held the block follows the pointer, so the size you
       release at is the size you were looking at. */
    const shownStart = resize?.start ?? event.start;
    const shownEnd = resize?.end ?? event.end;
    const minutes = shownEnd - shownStart;
    const compact = minutes <= COMPACT_MINUTES;

    /* Columns share the width of their overlap group with a small gap, and each
       is nudged right by its own index. Percentages, so the block keeps its
       place at any canvas zoom without anything measuring the DOM. */
    const width = 100 / event.columns;

    return (
        <article
            ref={setNodeRef}
            className={`${styles.event} nodrag`}
            data-tone={tone}
            data-compact={compact || undefined}
            data-ghost={isDragging || undefined}
            data-static={readOnly || undefined}
            data-resizing={resize ? resize.edge : undefined}
            style={{
                top: (shownStart / 60) * hourHeight,
                height: Math.max(((minutes / 60) * hourHeight) - 2, 18),
                left: `${event.column * width}%`,
                width: `calc(${width}% - 4px)`,
                /* While an edge is held the block is following the pointer on its
                   own; letting dnd-kit's move transform apply too would drag it
                   twice at once. */
                transform: resize ? undefined : CSS.Translate.toString(unscale(transform, zoom)),
            }}
            title={`${title} — ${formatTimeOfDay(shownStart)} to ${formatTimeOfDay(shownEnd)}`}
            data-day={dayKey}
            onClick={(e) => {
                e.stopPropagation();
                if (!resize) onOpen(card.id);
            }}
            {...attributes}
            {...(readOnly || resize ? {} : listeners)}
        >
            <div className={styles.eventHead}>
                <CardIcon
                    icon={data.icon || defaultIconName}
                    size={11}
                    style={{ color: 'currentColor', flex: 'none' }}
                />
                <span className={styles.eventTitle}>{title}</span>
                {span.inverted && <span className={styles.eventWarn} title="Start is after due">!</span>}
            </div>

            {!compact && (
                <span className={styles.eventTime}>
                    {formatTimeOfDay(shownStart)}
                    {resize && ` – ${formatTimeOfDay(shownEnd)}`}
                </span>
            )}

            {!compact && !resize && tasks.total > 0 && (
                <TaskProgressMeter
                    progress={tasks}
                    variant="badge"
                    onOpen={() => setTasksCardId(card.id)}
                />
            )}

            {/* Grab the top edge to move the start, the bottom to move the end.
                Hidden until the block is hovered, like every other affordance on
                this board, and absent entirely when the field is read-only. */}
            {!readOnly && (
                <>
                    <span
                        className={`${styles.resizeHandle} ${styles.resizeTop} nodrag`}
                        role="separator"
                        aria-label={`Change when ${title} starts`}
                        onPointerDown={beginResize('start')}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <span
                        className={`${styles.resizeHandle} ${styles.resizeBottom} nodrag`}
                        role="separator"
                        aria-label={`Change when ${title} ends`}
                        onPointerDown={beginResize('end')}
                        onClick={(e) => e.stopPropagation()}
                    />
                </>
            )}
        </article>
    );
});

KanbanTimedEvent.displayName = 'KanbanTimedEvent';
