/**
 * A task as it appears on the calendar.
 *
 * A card is a cluster; this is one thing inside it, placed on the day its own
 * date names. It is drawn against the card chip rather than like it — see the
 * "cards fill, tasks mark" note in KanbanCalendar.module.css — because a cell
 * that drew both as washes would be a cell where colour meant nothing.
 *
 * Two gestures, and they are deliberately different objects:
 *
 *  - the tick box writes. It stops its own pointerdown so dnd-kit never sees
 *    it, which is what keeps a box that is inside a drag handle from starting a
 *    drag. `toggleTask` decides whether the tick lands on the body block or on
 *    the metadata entry; this component does not know and must not care.
 *  - the row drags, and dropping it on a day sets that task's date. Which field
 *    is written is the calendar's business, not the chip's, so the drop handler
 *    in KanbanNode does it from the drag id alone.
 *
 * Clicking anywhere else opens the card's task modal, which is where a task's
 * description, image and subtasks live. There is no room for any of that here
 * and pretending otherwise is how a 190px cell becomes unreadable.
 */

import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Check } from '../../components/icons';

import { toggleTask, type CardTask } from '../card/cardTasks';
import { useStore } from '../../store/useStore';
import type { NoteNode } from '../../types';
import { dayKeyOf, todayKey } from '../../utils/cardDate';
import { unscale, useKanbanZoom } from './kanbanDragScale';
import { taskDraggableId, type KanbanTone } from './kanbanTypes';
import styles from './KanbanCalendar.module.css';

export interface KanbanCalendarTaskChipProps {
    /** The card that owns the task — its colour, and where the write goes. */
    card: NoteNode;
    task: CardTask;
    /** The lane colour the owning card carries on the board view. */
    tone?: KanbanTone;
    /** Dragging is off — the calendar is showing a read-only date field. */
    disabled?: boolean;
    /** Drawn in the drag overlay rather than in a cell. */
    isOverlay?: boolean;
}

/**
 * True when this task is past its due date and still open.
 *
 * Day-key strings compare correctly as strings — that is the whole reason the
 * format is zero-padded `YYYY-MM-DD` — so this needs no Date objects. A done
 * task is never late: the deadline stopped mattering when the work landed.
 */
const isOverdue = (task: CardTask): boolean => {
    if (task.completed) return false;
    const due = dayKeyOf(task.dueDate);
    return due !== null && due < todayKey();
};

export const KanbanCalendarTaskChip = memo(({
    card, task, tone = 'neutral', disabled, isOverlay,
}: KanbanCalendarTaskChipProps) => {
    const zoom = useKanbanZoom();
    const updateNodeData = useStore((s) => s.updateNodeData);
    const setTasksCardId = useStore((s) => s.setTasksCardId);

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: taskDraggableId(card.id, task.id),
        data: { type: 'task', cardId: card.id, taskId: task.id },
        disabled: disabled || isOverlay,
    });

    const late = isOverdue(task);
    const text = task.text.trim() || 'Untitled task';
    const cardName = card.data.label?.trim() || 'Untitled';

    return (
        <div
            ref={isOverlay ? undefined : setNodeRef}
            className={`${styles.taskChip} nodrag`}
            data-tone={tone}
            data-depth={task.depth}
            data-done={task.completed || undefined}
            data-late={late || undefined}
            data-ghost={isDragging || undefined}
            data-overlay={isOverlay || undefined}
            data-static={disabled || undefined}
            style={{
                /* Translate only, divided by the canvas zoom — see
                   kanbanDragScale.ts. The overlay is already in unscaled
                   client space and so takes no transform. */
                transform: isOverlay ? undefined : CSS.Translate.toString(unscale(transform, zoom)),
            }}
            title={`${text} — ${cardName}`}
            onClick={(e) => {
                e.stopPropagation();
                setTasksCardId(card.id);
            }}
            {...attributes}
            {...(disabled || isOverlay ? {} : listeners)}
        >
            {/* The spine carries the owning card's hue. It is the only thing
                that says which card this task belongs to, so it is drawn even
                on a neutral card — where it resolves to a faint grey. */}
            <span className={styles.taskSpine} aria-hidden="true" />

            <button
                type="button"
                className={`${styles.taskBox} nodrag`}
                role="checkbox"
                aria-checked={task.completed}
                aria-label={text}
                /* Stops dnd-kit seeing the press at all: the row is the drag
                   handle and the box lives inside it, so without this a tick
                   would be the first four pixels of a drag. */
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    updateNodeData(card.id, toggleTask(card.data, task.id));
                }}
            >
                {task.completed && <Check size={8} strokeWidth={3.5} />}
            </button>

            <span className={styles.taskLabel}>{text}</span>

            {late && <AlertTriangle size={10} className={styles.taskWarn} />}
        </div>
    );
});

KanbanCalendarTaskChip.displayName = 'KanbanCalendarTaskChip';
