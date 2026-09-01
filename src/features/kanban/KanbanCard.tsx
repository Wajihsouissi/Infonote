/**
 * A card as it appears on a board.
 *
 * This is a *view* of a node, not a second copy of one: everything it draws is
 * read from that node, so the board shows what the node already knows rather
 * than asking the user to fill a board-shaped form. A card with nothing but a
 * title draws as a title; one with a cover, a checklist and a due date draws the
 * lot. Nothing here writes.
 *
 * It renders whatever a board can hold — notes, blocks, fused notes — because
 * nothing is converted on its way onto a board. See `factsOf` for how the three
 * are reduced to one shape.
 *
 * The order of the rows — cover, title, blurb, checklist, progress, meta — is
 * the order the reference board reads in, and it is deliberately fixed. Cards
 * whose rows line up can be compared down a lane at a glance; cards that
 * reshuffle their contents to suit themselves cannot.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { Calendar, Check } from '../../components/icons';
import { CardIcon, defaultIconName } from '../card/iconMap';
import { IconPicker } from '../card/IconPicker';
import { displaySrc } from '../editor/mediaThumbnail';
import { useStore } from '../../store/useStore';
import type { Block } from '../editor/types';
import type { NoteData, NoteNode } from '../../types';
import { diffDays, parseCardDate } from '../../utils/cardDate';
import { cardTasks, taskProgress, toggleTask } from '../card/cardTasks';
import { TaskProgressMeter } from '../card/tasks/TaskProgress';
import { KanbanCardMetaEditor } from './KanbanCardMetaEditor';
import type { KanbanGroupField } from './kanbanTypes';
import styles from './KanbanCard.module.css';

/** Checklist rows drawn before the rest collapse into a "+n more". */
const MAX_CHECKLIST_ROWS = 4;
/** Tag chips drawn before the rest collapse into a count. A 404px card fits a
 *  fourth without the row wrapping onto a second line. */
const MAX_TAGS = 4;

/**
 * A checklist line as the card draws it.
 *
 * Where it is actually stored — a `todo` block in the body, or an entry in
 * `tasks` — is cardTasks.ts's business, and ticking one goes back through
 * `toggleTask` rather than being written from here.
 */
type ChecklistRow = {
    id: string;
    text: string;
    done: boolean;
    /** 0 is a task; deeper is a subtask, indented to match. */
    depth: number;
    /**
     * The task's own due date, read the way the card's is.
     *
     * Null on a finished task: the deadline stopped mattering when the work
     * landed, and a lane of struck-through rows still shouting "3d late" is a
     * board that cannot tell you what is actually wrong. The calendar's overdue
     * chip makes the same call.
     */
    due: DueLabel | null;
};

type DueLabel = { text: string; state: 'overdue' | 'today' | 'soon' | 'later' };

type CardPreview = {
    cover?: string;
    snippet?: string;
    checklist: ChecklistRow[];
    checklistDone: number;
    checklistTotal: number;
};

const asBlocks = (content: NoteData['content']): Block[] =>
    Array.isArray(content) ? content : [];

/** Markdown is the storage format; a preview line wants the words only. */
const stripInline = (text: string): string =>
    text
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__|~~|`|^#{1,6}\s*)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

/**
 * What this card has worth showing.
 *
 * Explicit metadata always wins over anything inferred from the body: a card
 * with a `coverImage` set has been given one on purpose, and quietly preferring
 * some image further down its content would override that choice. The body is
 * only ever consulted for rows the metadata left empty, which is what lets an
 * ordinary note that was never "made for" a board still arrive looking like one.
 */
function buildPreview(data: NoteData): CardPreview {
    const blocks = asBlocks(data.content);

    let cover = data.coverImage;
    if (!cover) {
        const image = blocks.find((b) => b.type === 'image' && !!b.content);
        if (image) cover = displaySrc(image.content, image.metadata?.thumb as string | undefined);
    }

    /* One list, however it was written — a checklist typed into the body and a
       task added from the metadata panel are the same thing to a card. See
       features/card/cardTasks.ts; the board must not have its own idea of what
       a task is. */
    const checklist: ChecklistRow[] = cardTasks(data).map((t) => ({
        id: t.id,
        text: t.text,
        done: t.completed,
        depth: t.depth,
        due: t.completed ? null : dueLabel(t.dueDate),
    }));

    let snippet = data.description?.trim();
    if (!snippet) {
        /* The heading already became the title for a block, so starting the
           snippet at the same line would print it twice. */
        const prose = blocks.find(
            (b) => ['text', 'quote', 'callout'].includes(b.type) && b.content.trim().length > 0,
        ) ?? blocks.find(
            (b) => ['heading1', 'heading2', 'heading3'].includes(b.type)
                && b.content.trim().length > 0
                && stripInline(b.content) !== (data.label ?? ''),
        );
        if (prose) snippet = stripInline(prose.content);
    }

    return {
        cover,
        snippet: snippet || undefined,
        checklist: checklist.filter((row) => row.text.length > 0),
        checklistDone: checklist.filter((row) => row.done).length,
        checklistTotal: checklist.length,
    };
}

/** How a due date should read, which is mostly about how alarming it is. */
function dueLabel(iso?: string): DueLabel | null {
    /* Both through cardDate, not `new Date(iso)`: a bare `YYYY-MM-DD` parses as
       UTC midnight, which read a card due today as due yesterday everywhere
       west of UTC. See src/utils/cardDate.ts. */
    const due = parseCardDate(iso);
    if (!due) return null;

    const days = diffDays(new Date(), due);

    if (days < 0) return { text: days === -1 ? 'Yesterday' : `${Math.abs(days)}d late`, state: 'overdue' };
    if (days === 0) return { text: 'Today', state: 'today' };
    if (days === 1) return { text: 'Tomorrow', state: 'soon' };
    if (days <= 7) return { text: `${days} days`, state: 'soon' };
    return {
        text: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        state: 'later',
    };
}

const initials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export interface KanbanCardProps {
    node: NoteNode;
    /** The board's group field. Its own chip is redundant here — the lane says it. */
    groupBy: KanbanGroupField;
    /** True while this card is the one being dragged (the source, not the overlay). */
    isGhost?: boolean;
    /** True when drawn in the drag overlay rather than in a lane. */
    isOverlay?: boolean;
    /**
     * Selected: the card becomes editable in place — title, icon and the
     * metadata strip. Unselected it stays a view, and the lane hands its whole
     * surface to the drag.
     */
    isSelected?: boolean;
}

export const KanbanCard = memo(({ node, groupBy, isGhost, isOverlay, isSelected }: KanbanCardProps) => {
    const { data } = node;
    const updateNodeData = useStore((s) => s.updateNodeData);
    const setTasksCardId = useStore((s) => s.setTasksCardId);
    const preview = useMemo(() => buildPreview(data), [data]);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);

    /* The overlay is a picture of the card being moved, never the card itself. */
    const isEditing = !!isSelected && !isOverlay;

    const patch = useCallback((next: Partial<NoteData>) => {
        updateNodeData(node.id, next as Record<string, unknown>);
    }, [node.id, updateNodeData]);

    /**
     * Tick a line.
     *
     * Deliberately available whether or not the card is selected: ticking a task
     * is the one edit you make *while reading* a board, and making it wait for a
     * selection would turn the commonest action into a two-step. Which store the
     * tick lands in is `toggleTask`'s decision, not this component's.
     */
    const toggleCheck = useCallback((row: ChecklistRow) => {
        patch(toggleTask(data, row.id));
    }, [data, patch]);

    const due = dueLabel(data.dueDate);
    const tags = data.tags ?? [];
    const showPriority = groupBy !== 'priority' && !!data.priority;
    const showAssignee = groupBy !== 'assignee' && !!data.assignee;

    /* An explicit percentage is a claim the user made; a checklist is one the
       card can prove. Prefer the claim, fall back to the proof, and draw
       nothing when there is neither. */
    const progress = typeof data.progress === 'number'
        ? Math.max(0, Math.min(100, data.progress))
        : null;
    const tasks = useMemo(() => taskProgress(data), [data]);

    const extraChecks = preview.checklist.length - MAX_CHECKLIST_ROWS;
    const extraTags = tags.length - MAX_TAGS;
    const hasMeta = !!due || showPriority || showAssignee || tags.length > 0;

    return (
        <article
            className={styles.card}
            data-ghost={isGhost || undefined}
            data-overlay={isOverlay || undefined}
            style={data.color ? { ["--card-tint" as string]: data.color } : undefined}
        >
            {preview.cover && (
                <div className={styles.cover}>
                    <img src={preview.cover} alt="" loading="lazy" draggable={false} />
                </div>
            )}

            <div className={styles.body}>
                <header className={styles.head}>
                    {/* The tile is the icon control once the card is selected. Same
                        square either way, so the card does not reflow when it is
                        picked — only what it answers to changes. */}
                    <span className={styles.iconWrap}>
                        <button
                            type="button"
                            className={`${styles.iconTile}${isEditing ? ' icon-hover' : ''}`}
                            aria-label={isEditing ? 'Change icon' : undefined}
                            disabled={!isEditing}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isEditing) setIconPickerOpen((v) => !v);
                            }}
                        >
                            {/* CardIcon merges `{ color: registeredColor, ...style }`, so
                                without this the glyph keeps the per-icon colour from the
                                registry — a grey FileText inside a tinted tile. On a board
                                the tile and its glyph have to read as one object, and the
                                colour that object takes is the card's, so it stays a
                                single tint per card rather than a different one per icon. */}
                            <CardIcon
                                icon={data.icon || defaultIconName}
                                size={14}
                                style={{ color: 'currentColor' }}
                            />
                        </button>

                        {/* Renders itself into document.body — deliberately not
                            anchored to the tile. The card clips its own overflow
                            and lives inside a scaled canvas, so a popover pinned
                            here would be cropped at the card's edge and mis-scaled
                            besides. It also stages the choice and commits on close,
                            which is the picker's own contract, not something to
                            work around. */}
                        {iconPickerOpen && isEditing && (
                            <IconPicker
                                currentIcon={data.icon || defaultIconName}
                                onSelect={(icon) => patch({ icon })}
                                onClose={() => setIconPickerOpen(false)}
                            />
                        )}
                    </span>

                    {isEditing ? (
                        <input
                            className={`${styles.titleInput} nodrag nopan`}
                            value={data.label ?? ''}
                            placeholder="Untitled"
                            aria-label="Card title"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => patch({ label: e.target.value })}
                            /* The canvas listens globally for single-key shortcuts;
                               without this, naming a card deletes and pans instead
                               of typing. */
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                e.stopPropagation();
                            }}
                            onKeyUp={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <h4 className={styles.title}>{data.label?.trim() || 'Untitled'}</h4>
                    )}
                </header>

                {preview.snippet && <p className={styles.snippet}>{preview.snippet}</p>}

                {preview.checklist.length > 0 && (
                    <ul className={styles.checklist}>
                        {preview.checklist.slice(0, MAX_CHECKLIST_ROWS).map((row) => (
                            <li
                                key={row.id}
                                className={styles.check}
                                style={{ ['--check-depth' as string]: row.depth }}
                                data-done={row.done || undefined}
                            >
                                {/* A real button: ticking a task is the one edit worth
                                    making straight from a board, so it never waits for
                                    the card to be selected. */}
                                <button
                                    type="button"
                                    className={`${styles.box} nodrag`}
                                    role="checkbox"
                                    aria-checked={row.done}
                                    aria-label={row.text}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleCheck(row);
                                    }}
                                >
                                    {row.done && <Check size={11} strokeWidth={3.5} />}
                                </button>
                                <span className={styles.checkText}>{row.text}</span>
                                {/* A task's own deadline, in the same words the
                                    card's uses. Right-aligned into the space the
                                    text leaves, so a checklist with no dates on
                                    it looks exactly as it did before. */}
                                {row.due && (
                                    <span className={styles.checkWhen} data-state={row.due.state}>
                                        {row.due.text}
                                    </span>
                                )}
                            </li>
                        ))}
                        {extraChecks > 0 && (
                            <li className={styles.more}>+{extraChecks} more</li>
                        )}
                    </ul>
                )}

                {/* Tasks get their own meter, which is also the way into the
                    full list — the card can only show the first few rows, so
                    the count is where "and the rest" lives. A hand-set
                    `progress` with no tasks behind it keeps the plain bar,
                    because there is nothing to open into. */}
                {tasks.total > 0 ? (
                    <TaskProgressMeter
                        progress={tasks}
                        onOpen={() => setTasksCardId(node.id)}
                    />
                ) : progress !== null && (
                    <div className={styles.progress}>
                        <div className={styles.track}>
                            <div className={styles.fill} style={{ width: `${progress}%` }} />
                        </div>
                        <span className={styles.progressValue}>{progress}%</span>
                    </div>
                )}

                {hasMeta && (
                    <footer className={styles.meta}>
                        {showPriority && (
                            <span className={styles.priority} data-priority={data.priority}>
                                <span className={styles.dot} />
                                {data.priority}
                            </span>
                        )}

                        {due && (
                            <span className={styles.due} data-state={due.state}>
                                <Calendar size={11} strokeWidth={2.5} />
                                {due.text}
                            </span>
                        )}

                        {tags.slice(0, MAX_TAGS).map((tag) => (
                            <span key={tag} className={styles.tag}>{tag}</span>
                        ))}
                        {extraTags > 0 && <span className={styles.tag}>+{extraTags}</span>}

                        {showAssignee && (
                            <span className={styles.assignee} title={data.assignee}>
                                {initials(data.assignee!)}
                            </span>
                        )}
                    </footer>
                )}

                {/* The chips above are the reading view and stay exactly as they
                    were; this is where they are set. Below the meta row, so the
                    card still reads top-to-bottom and the controls are the last
                    thing rather than an interruption in the middle. */}
                {isEditing && <KanbanCardMetaEditor data={data} onChange={patch} />}
            </div>
        </article>
    );
});

KanbanCard.displayName = 'KanbanCard';
