/**
 * The unscheduled rail.
 *
 * Every note on the board that has no usable date for the field the calendar is
 * showing. Without it a calendar is a report; with it a calendar is where you
 * plan, because the undated work is sitting right there to be dragged onto a
 * day — and dragged back off it again.
 *
 * It is built to read as the fullscreen note rail (see FullscreenNoteList), not
 * as a column of calendar chips: a list of cards you are choosing between wants
 * each card's own folder artwork and its title, the way that rail already does
 * it. Tinting every row by its lane, which is right in a dense month cell where
 * colour is the only thing that fits, turns a list into a wall of colour that
 * says nothing — the rows there are all one lane, so they are all one colour.
 *
 * Colour still gets in where it is the card's own: a card with a `color` wears
 * it as a left spine, the same signal and the same variable the rail uses.
 *
 * Collapsed it stays a drop target. Somewhere to put a card you want off the
 * calendar has to stay reachable even when you have folded the list away.
 */

import { memo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Check, PanelLeftClose, PanelLeftOpen } from '../../components/icons';

import { FolderArt } from '../card/FolderArt';
import { CardIcon, defaultIconName } from '../card/iconMap';
import { toggleTask, type CardTask } from '../card/cardTasks';
import { useStore } from '../../store/useStore';
import type { NoteNode } from '../../types';
import type { UnscheduledTaskGroup } from './calendarModel';
import { unscale, useKanbanZoom } from './kanbanDragScale';
import { TRAY_DROPPABLE_ID, taskDraggableId, type KanbanTone } from './kanbanTypes';
import styles from './KanbanCalendar.module.css';

/** Edge of the folder artwork on a row, matching the note rail's. */
const ART_SIZE = 46;

/**
 * The palette variable a tone names.
 *
 * 'neutral' has no `--a-neutral` — it is the absence of a hue, not a hue — so
 * it resolves to the faint text colour the rest of the tray's furniture uses.
 * The lane CSS makes the same choice in its own `--tone` default.
 */
const toneVar = (tone?: KanbanTone): string =>
    !tone || tone === 'neutral' ? 'var(--text-faint)' : `var(--a-${tone})`;

interface TrayRowProps {
    node: NoteNode;
    /** The stored date could not be read at all, as opposed to being absent. */
    malformed?: boolean;
    /** The calendar is showing a read-only field, so nothing may be dragged. */
    readOnly?: boolean;
    onOpen: (id: string) => void;
}

const TrayRow = memo(({ node, malformed, readOnly, onOpen }: TrayRowProps) => {
    const zoom = useKanbanZoom();
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: node.id,
        data: { type: 'chip' },
        disabled: readOnly,
    });

    const { data } = node;
    const label = data.label?.trim() || 'Untitled';

    return (
        <div
            ref={setNodeRef}
            className={`${styles.trayRow} nodrag`}
            data-ghost={isDragging || undefined}
            data-static={readOnly || undefined}
            data-accented={data.color ? '' : undefined}
            style={{
                // Translate only, divided by the canvas zoom — see kanbanDragScale.ts.
                transform: CSS.Translate.toString(unscale(transform, zoom)),
                ...(data.color ? { ['--node-accent' as string]: data.color } : null),
            }}
            title={malformed ? `“${data.dueDate ?? data.startDate}” could not be read as a date` : label}
            /* Click, not pointerdown: a drag ends in a pointerup elsewhere and
               never fires a click, so dragging a row does not also open it. */
            onClick={(e) => {
                e.stopPropagation();
                onOpen(node.id);
            }}
            {...attributes}
            {...(readOnly ? {} : listeners)}
        >
            {/* The card's own artwork, as the note rail draws it. Recognising a
                row by the picture it already has is the point. */}
            <span className={styles.trayArt}>
                <FolderArt coverImage={data.coverImage} icon={data.icon} size={ART_SIZE} />
            </span>

            <span className={styles.trayText}>
                <span className={styles.trayLabel}>{label}</span>
                {data.description && (
                    <span className={styles.trayDesc}>{data.description}</span>
                )}
            </span>

            {malformed && <AlertTriangle size={12} className={styles.trayWarn} />}
        </div>
    );
});
TrayRow.displayName = 'TrayRow';

interface TrayTaskRowProps {
    card: NoteNode;
    task: CardTask;
    readOnly?: boolean;
}

/**
 * One undated task, waiting for a day.
 *
 * The same two gestures as the calendar's task chip — tick writes, row drags —
 * at the list's proportions rather than the month cell's. It shares the chip's
 * drag id so KanbanNode has exactly one task-drop path to maintain: dropping a
 * row here on a day and dropping a chip there on a day are the same event.
 */
const TrayTaskRow = memo(({ card, task, readOnly }: TrayTaskRowProps) => {
    const zoom = useKanbanZoom();
    const updateNodeData = useStore((s) => s.updateNodeData);
    const setTasksCardId = useStore((s) => s.setTasksCardId);

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: taskDraggableId(card.id, task.id),
        data: { type: 'task', cardId: card.id, taskId: task.id },
        disabled: readOnly,
    });

    const text = task.text.trim() || 'Untitled task';

    return (
        <div
            ref={setNodeRef}
            className={`${styles.trayTaskRow} nodrag`}
            data-depth={task.depth}
            data-done={task.completed || undefined}
            data-ghost={isDragging || undefined}
            data-static={readOnly || undefined}
            style={{ transform: CSS.Translate.toString(unscale(transform, zoom)) }}
            title={text}
            onClick={(e) => {
                e.stopPropagation();
                setTasksCardId(card.id);
            }}
            {...attributes}
            {...(readOnly ? {} : listeners)}
        >
            <button
                type="button"
                className={`${styles.trayTaskBox} nodrag`}
                role="checkbox"
                aria-checked={task.completed}
                aria-label={text}
                /* Keeps dnd-kit from seeing the press — see the calendar chip. */
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    updateNodeData(card.id, toggleTask(card.data, task.id));
                }}
            >
                {task.completed && <Check size={9} strokeWidth={3.5} />}
            </button>
            <span className={styles.trayTaskText}>{text}</span>
        </div>
    );
});
TrayTaskRow.displayName = 'TrayTaskRow';

export interface KanbanCalendarTrayProps {
    cards: NoteNode[];
    /** Undated tasks grouped by their card. Absent when the calendar is showing
     *  cards only, which is what keeps this section from appearing unasked. */
    taskGroups?: UnscheduledTaskGroup[];
    /** The lane colour a card carries, for the group headers' dots. */
    toneOfNote?: (card: NoteNode) => KanbanTone;
    /** A subset of `cards` whose stored date could not be read at all. */
    malformed: Set<string>;
    /** Board children that carry no date fields and never can. */
    excluded: number;
    collapsed: boolean;
    onToggle: () => void;
    /** The calendar is showing a read-only field, so nothing may be dragged. */
    readOnly?: boolean;
    onOpenCard: (id: string) => void;
}

export const KanbanCalendarTray = memo(({
    cards, taskGroups, toneOfNote, malformed, excluded, collapsed, onToggle, readOnly, onOpenCard,
}: KanbanCalendarTrayProps) => {
    const setTasksCardId = useStore((s) => s.setTasksCardId);
    const { setNodeRef, isOver } = useDroppable({
        id: TRAY_DROPPABLE_ID,
        data: { type: 'tray' },
    });

    const showTasks = !!taskGroups;
    const taskCount = taskGroups?.reduce((n, g) => n + g.tasks.length, 0) ?? 0;

    if (collapsed) {
        /* The same list narrowed to its icons, exactly as the note rail folds.
           Still a drop target, and still navigable — a rail that collapsed to
           nothing would be neither. */
        return (
            <aside ref={setNodeRef} className={styles.trayRail} data-over={isOver || undefined}>
                <button
                    type="button"
                    className={`${styles.trayToggle} nodrag nopan`}
                    title="Show unscheduled cards"
                    aria-label="Show unscheduled cards"
                    aria-expanded={false}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                >
                    <PanelLeftOpen size={15} />
                </button>

                <span className={styles.trayCountRail}>{cards.length}</span>

                <div className={styles.trayRailList}>
                    {cards.map((card) => (
                        <button
                            key={card.id}
                            type="button"
                            className={`${styles.trayRailItem} nodrag`}
                            title={card.data.label?.trim() || 'Untitled'}
                            aria-label={card.data.label?.trim() || 'Untitled'}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onOpenCard(card.id); }}
                        >
                            <CardIcon icon={card.data.icon || defaultIconName} size={17} />
                        </button>
                    ))}
                </div>
            </aside>
        );
    }

    return (
        <aside
            ref={setNodeRef}
            className={styles.tray}
            data-over={isOver || undefined}
            aria-label="Unscheduled cards"
        >
            <header className={styles.trayHead}>
                {/* "Unscheduled" is the whole tray while it holds only cards.
                    Once tasks are shown it has to name which of the two this
                    list is, and both are unscheduled by definition. */}
                <span className={styles.trayTitle}>
                    {showTasks ? 'Cards' : 'Unscheduled'}
                    <span className={styles.trayCount}>{cards.length}</span>
                </span>
                <button
                    type="button"
                    className={`${styles.trayToggle} nodrag nopan`}
                    title="Hide unscheduled cards"
                    aria-label="Hide unscheduled cards"
                    aria-expanded
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                >
                    <PanelLeftClose size={15} />
                </button>
            </header>

            <div className={styles.trayBody}>
                {cards.map((card) => (
                    <TrayRow
                        key={card.id}
                        node={card}
                        malformed={malformed.has(card.id)}
                        readOnly={readOnly}
                        onOpen={onOpenCard}
                    />
                ))}

                {cards.length === 0 && (
                    <p className={styles.trayEmpty}>
                        {readOnly
                            ? 'Every card has a creation date.'
                            : 'Everything is scheduled. Drag a card here to take it off the calendar.'}
                    </p>
                )}

                {malformed.size > 0 && (
                    <p className={styles.trayNote}>
                        {malformed.size === 1
                            ? '1 card has a date that could not be read.'
                            : `${malformed.size} cards have dates that could not be read.`}
                    </p>
                )}

                {/* Blocks and fused notes carry no date fields at all, so they
                    cannot be placed and cannot be dragged onto a day either.
                    Counted rather than listed: a tray item that can never leave
                    the tray fails every time it is used. */}
                {excluded > 0 && (
                    <p className={styles.trayNote}>
                        {excluded === 1 ? '1 block is' : `${excluded} blocks are`} not on this
                        calendar — they carry no dates. Switch to Board to see them.
                    </p>
                )}

                {/* ------------------------------------------- undated tasks */}
                {showTasks && (
                    <>
                        <div className={styles.traySplit} aria-hidden="true" />

                        <div className={styles.trayTasksHead}>
                            Tasks
                            <span className={styles.trayCount}>{taskCount}</span>
                        </div>

                        {taskGroups.map(({ card, tasks }) => (
                            <div key={card.id} className={styles.trayGroup}>
                                <button
                                    type="button"
                                    className={`${styles.trayOwner} nodrag`}
                                    style={{ ['--tone' as string]: toneVar(toneOfNote?.(card)) }}
                                    title={`Open the tasks of ${card.data.label?.trim() || 'Untitled'}`}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); setTasksCardId(card.id); }}
                                >
                                    <span className={styles.trayOwnerDot} />
                                    <span className={styles.trayOwnerName}>
                                        {card.data.label?.trim() || 'Untitled'}
                                    </span>
                                    <span className={styles.trayOwnerCount}>{tasks.length}</span>
                                </button>

                                {tasks.map((task) => (
                                    <TrayTaskRow
                                        key={task.id}
                                        card={card}
                                        task={task}
                                        readOnly={readOnly}
                                    />
                                ))}
                            </div>
                        ))}

                        {taskCount === 0 && (
                            <p className={styles.trayEmpty}>
                                Every task has a date. Drag one here to take it off the calendar.
                            </p>
                        )}
                    </>
                )}
            </div>
        </aside>
    );
});

KanbanCalendarTray.displayName = 'KanbanCalendarTray';
