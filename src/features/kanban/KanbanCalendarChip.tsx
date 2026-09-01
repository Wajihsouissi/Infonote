/**
 * A card as it appears on the calendar.
 *
 * The compact cousin of KanbanCard: a month cell is about 240px wide and holds
 * three of these, so what survives is the icon, the title, and whatever is
 * genuinely alarming. Like KanbanCard it is a *view* — nothing here writes.
 *
 * It takes its colour from the lane the card sits in on the board's other view,
 * so a card that is amber under "In Progress" is amber here too. One board, two
 * readings, one palette.
 *
 * It is a `useDraggable`, deliberately not a `useSortable`. Chips are never
 * droppables — only day cells and the tray are — which is what makes a drop
 * unambiguous: `over.id` is always a day or the tray, never another card whose
 * own dates would then have to be interrogated to guess which day was meant.
 * The cost is that cards cannot be reordered within a day; that order comes
 * from the board's `cardOrder`, and the board is where it is changed.
 */

import { memo, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle } from '../../components/icons';

import { CardIcon, defaultIconName } from '../card/iconMap';
import { taskProgress } from '../card/cardTasks';
import { TaskProgressMeter } from '../card/tasks/TaskProgress';
import { useStore } from '../../store/useStore';
import type { NoteNode } from '../../types';
import { unscale, useKanbanZoom } from './kanbanDragScale';
import type { SpanSegment } from './calendarModel';
import type { KanbanTone } from './kanbanTypes';
import styles from './KanbanCalendar.module.css';

export interface KanbanCalendarChipProps {
    node: NoteNode;
    /** Which part of a bar this cell holds; 'solo' for a single-day card. */
    segment?: SpanSegment;
    /** Print the title here. False makes the chip an unlabelled span stripe. */
    showTitle?: boolean;
    /** The lane colour this card carries on the board view. */
    tone?: KanbanTone;
    /** The card's two dates are inverted — it is drawn on its anchor day only. */
    inverted?: boolean;
    /** The span was longer than a year and was cut short. */
    truncated?: boolean;
    /** Dragging is off — the calendar is showing a read-only date field. */
    disabled?: boolean;
    /** Drawn in the drag overlay rather than in a cell. */
    isOverlay?: boolean;
    onOpen?: (id: string) => void;
}

export const KanbanCalendarChip = memo(({
    node, segment = 'solo', showTitle = true, tone = 'neutral',
    inverted, truncated, disabled, isOverlay, onOpen,
}: KanbanCalendarChipProps) => {
    const zoom = useKanbanZoom();
    const setTasksCardId = useStore((s) => s.setTasksCardId);
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: node.id,
        data: { type: 'chip' },
        disabled: disabled || isOverlay,
    });

    const { data } = node;
    const title = data.label?.trim() || 'Untitled';
    const tasks = useMemo(() => taskProgress(data), [data]);
    const warning = inverted
        ? 'This card’s start date is after its due date, so it is shown on one day only.'
        : truncated
            ? 'This card spans more than a year; only the first year is drawn.'
            : null;

    return (
        <div
            ref={isOverlay ? undefined : setNodeRef}
            className={`${styles.chip} nodrag`}
            data-tone={tone}
            data-seg={segment}
            data-labelled={showTitle || undefined}
            data-ghost={isDragging || undefined}
            data-overlay={isOverlay || undefined}
            data-static={disabled || undefined}
            style={{
                /* Translate only, divided by the canvas zoom — see
                   kanbanDragScale.ts. The overlay is portalled to the body and
                   already lives in unscaled space, so it takes no transform. */
                transform: isOverlay ? undefined : CSS.Translate.toString(unscale(transform, zoom)),
            }}
            title={warning ?? title}
            /* Click, not pointerdown: a drag ends in a pointerup elsewhere and
               never fires a click, so dragging a chip does not also open it. */
            onClick={(e) => {
                e.stopPropagation();
                onOpen?.(node.id);
            }}
            {...attributes}
            {...(disabled || isOverlay ? {} : listeners)}
        >
            {showTitle && (
                <>
                    <CardIcon
                        icon={data.icon || defaultIconName}
                        size={11}
                        style={{ color: 'currentColor', flex: 'none' }}
                    />
                    {data.priority && (
                        <span className={styles.chipPriority} data-priority={data.priority} />
                    )}
                    <span className={styles.chipLabel}>{title}</span>
                    {warning && <AlertTriangle size={10} className={styles.chipWarn} />}
                    {/* A month cell is about 190px wide, so the count alone —
                        the bar goes on the board card, where there is room.
                        It is the way into the list either way. */}
                    {!isOverlay && (
                        <TaskProgressMeter
                            progress={tasks}
                            variant="badge"
                            onOpen={() => setTasksCardId(node.id)}
                        />
                    )}
                </>
            )}
        </div>
    );
});

KanbanCalendarChip.displayName = 'KanbanCalendarChip';
