/**
 * Kanban board node — its data shape and the metadata contract behind it.
 *
 * A board owns no card data. Its children are ordinary canvas nodes — notes,
 * blocks, fused notes — whose `parentId` points at the board, and a lane is
 * nothing more than one value of one metadata field on them, `status` by
 * default. Dropping something into a lane writes that single field and nothing
 * else, so the board, the search index and the node's own metadata panel can
 * never disagree about where a task stands.
 *
 * Nothing is converted on the way in: a block dropped on a board is still a
 * block, and dragging it back out returns exactly what was dropped.
 *
 * What that buys, and what it costs:
 *  - A card that was given a status anywhere else in the app lands in the right
 *    lane the moment it joins a board. No import step, no second source.
 *  - Deleting a board leaves its cards' meaning intact — the field survives.
 *  - Lanes for open-ended fields (category, assignee) are discovered from the
 *    cards rather than configured, so a board is never born needing setup.
 *  - The cost is that two boards grouped by the same field are two views of one
 *    truth: moving a card on one moves it on the other. That is the intended
 *    reading of "plan with the cards you already have".
 */

import { MIN_EXPANDED_SIZE } from '../../config/layout';
import type { BlockNode, FusedNoteNode, NoteNode } from '../../types';
import type { CardDateField } from '../../utils/cardDate';

/**
 * The metadata a board plans by, carried by every node type a board can hold.
 *
 * Notes already had these; blocks and fused notes gained them so that anything
 * dropped on a board keeps being what it is instead of being converted into a
 * card. A lane is still one value of one field — the contract did not change,
 * the set of nodes that can honour it did.
 *
 * Typed as plain strings rather than the closed unions on NoteData because
 * columns are user-editable: a board with a "Blocked" column writes `blocked`,
 * which no fixed union could have known about.
 */
export type BoardPlanningFields = {
    status?: string;
    priority?: string;
    category?: string;
    assignee?: string;
};

/** Every node type a board can hold. */
export type BoardChild = NoteNode | BlockNode | FusedNoteNode;

/** The data payload of any board child. */
export type BoardChildData = BoardChild['data'];

/* A lane is exactly one expanded card wide, so a card sitting in a lane is the
   size it would be anywhere else on the canvas rather than a squeezed-down
   version of itself, and 8px of air separates one lane from the next. */
export const KANBAN_LANE_WIDTH = MIN_EXPANDED_SIZE;  // 432
export const KANBAN_LANE_GAP = 8;

/** A lane opens at this height and grows with the cards put into it. Tall
 *  enough to read as a column waiting to be filled rather than an empty strip. */
export const KANBAN_LANE_MIN_HEIGHT = 720;

/**
 * The board node's size is the size of its lanes — it has no surface of its own
 * to be bigger than them. These are only the figures the node is *seeded* with,
 * so the canvas has something sane to cull against before the board has been
 * measured; from then on the rendered size is mirrored back onto the node (see
 * KanbanNode's resize observer).
 */
const DEFAULT_LANE_COUNT = 4;
export const KANBAN_DEFAULT_WIDTH =
    DEFAULT_LANE_COUNT * KANBAN_LANE_WIDTH + (DEFAULT_LANE_COUNT - 1) * KANBAN_LANE_GAP; // 1752
export const KANBAN_DEFAULT_HEIGHT = KANBAN_LANE_MIN_HEIGHT;

/**
 * The calendar is exactly four lanes wide — always, whatever the board's lane
 * count happens to be.
 *
 * Not an aesthetic choice. `.board` is `width: max-content` and its rendered
 * size is mirrored onto the canvas node for culling and hit-testing (see
 * KanbanNode's resize observer), so a grid whose width tracked its contents
 * would make that mirror chase itself. Fixing it here also means switching
 * Board → Calendar on a four-lane board does not move the node at all.
 */
export const KANBAN_CALENDAR_WIDTH = KANBAN_DEFAULT_WIDTH; // 1752
export const KANBAN_TRAY_WIDTH = 260;
/** Six week rows always, so paging a month never changes the node's height. */
export const CALENDAR_MONTH_ROWS = 6;

/** Card metadata fields a board can group by. */
export type KanbanGroupField = 'status' | 'priority' | 'category' | 'assignee';

/**
 * Which view of the same cards a board is showing.
 *
 * The cards are identical either way — a calendar is the board's other reading
 * of one set of notes, not a second place to keep them. Lanes are one value of
 * one metadata field; days are one value of one date field.
 */
export type KanbanViewMode = 'board' | 'calendar';

/** The card date field a calendar places cards by. Defined in cardDate so the
 *  pure date helpers can talk about it without importing this feature. */
export type KanbanDateField = CardDateField;

/** How much time one screen of the calendar covers. */
export type KanbanCalendarScale = 'day' | 'week' | 'month' | 'year';

/**
 * What a day is made of.
 *
 * A card is a cluster of tasks, and until now both views only ever placed the
 * cluster: a task carrying its own due date had nowhere to appear. This is the
 * one switch that changes that, and it is deliberately one switch rather than a
 * second calendar — the tasks are read off the same cards the lanes hold, by
 * the same date field the cards are placed by.
 *
 * 'cards' is the default so that every board saved before this existed opens
 * exactly as it always did, with nothing to migrate.
 */
export type KanbanGranularity = 'cards' | 'tasks' | 'both';

export const DATE_FIELDS: KanbanDateField[] = ['dueDate', 'startDate', 'createdAt'];

export const DATE_FIELD_LABEL: Record<KanbanDateField, string> = {
    dueDate: 'Due date',
    startDate: 'Start date',
    createdAt: 'Created',
};

export const CALENDAR_SCALES: KanbanCalendarScale[] = ['day', 'week', 'month', 'year'];

export const CALENDAR_SCALE_LABEL: Record<KanbanCalendarScale, string> = {
    day: 'Day',
    week: 'Week',
    month: 'Month',
    year: 'Year',
};

export const GRANULARITIES: KanbanGranularity[] = ['cards', 'tasks', 'both'];

export const GRANULARITY_LABEL: Record<KanbanGranularity, string> = {
    cards: 'Cards',
    tasks: 'Tasks',
    both: 'Both',
};

/**
 * A column's colour: one of the ten accent hues, or none.
 *
 * Names a hue in the palette rather than a literal colour, so a board reads
 * correctly on both Ink and Paper — see design-system.css §7. It also means the
 * colour is the user's choice about *their* column, not a semantic the app is
 * asserting: the old set borrowed `danger` and `ok` from the feedback tokens,
 * which quietly claimed a column named "Blocked" was an error state.
 */
export type KanbanTone =
    | 'neutral'
    | 'rose' | 'amber' | 'citrine' | 'olive' | 'jade'
    | 'teal' | 'azure' | 'indigo' | 'violet' | 'magenta';

/** The palette, in wheel order — what a colour picker offers. */
export const KANBAN_TONES: KanbanTone[] = [
    'neutral', 'rose', 'amber', 'citrine', 'olive',
    'jade', 'teal', 'azure', 'indigo', 'violet', 'magenta',
];

/**
 * Columns saved before the palette existed carry the old semantic names. They
 * are mapped on read rather than migrated on write, so an old board opens with
 * sensible colours without a migration step that could only ever run once.
 */
const LEGACY_TONES: Record<string, KanbanTone> = {
    accent: 'rose',
    secondary: 'amber',
    ok: 'jade',
    warn: 'amber',
    danger: 'rose',
    blue: 'azure',
    purple: 'violet',
};

/** The tone to render for a column, tolerating anything stored earlier. */
export const toneOf = (column: KanbanColumn): KanbanTone => {
    const raw = column.tone;
    if (!raw) return 'neutral';
    if (KANBAN_TONES.includes(raw)) return raw;
    return LEGACY_TONES[raw as string] ?? 'neutral';
};

export type KanbanColumn = {
    id: string;
    /** Shown in the lane header. Freely editable; renaming never touches `value`. */
    label: string;
    /**
     * Value written to the card's group field when it lands in this lane. Fixed
     * for the life of the column: it is what every card in the lane carries, so
     * changing it would orphan all of them. The label is the part that moves.
     */
    value: string;
    tone?: KanbanTone;
    collapsed?: boolean;
};

export type KanbanNodeData = {
    /** Board name, shown in the header and used by search. */
    label: string;
    /** Card metadata field the lanes represent. */
    groupBy: KanbanGroupField;
    /**
     * Configured lanes. Left empty for discovered fields (category, assignee),
     * where `resolveColumns` reads the lanes off the cards instead.
     */
    columns: KanbanColumn[];
    /**
     * Card ids in board order. A card missing from this list sorts after every
     * card present, so a card arriving from elsewhere on the canvas appends to
     * its lane instead of jumping to the top of it.
     */
    cardOrder?: string[];
    /**
     * Which view this board is showing. Absent means 'board', so every board
     * saved before the calendar existed opens exactly as it always did — there
     * is nothing to migrate.
     */
    viewMode?: KanbanViewMode;
    /** The date field the calendar places cards by. Absent means 'dueDate'. */
    dateField?: KanbanDateField;
    /** How much time one calendar screen covers. Absent means 'month'. */
    calendarScale?: KanbanCalendarScale;
    /** Whether the calendar draws cards, their tasks, or both. Absent means
     *  'cards', so an old board opens unchanged. */
    granularity?: KanbanGranularity;

    /** Hand-set size from the resize handle; see NoteData.userWidth. */
    userWidth?: number;
    userHeight?: number;

    createdAt?: string;
    updatedAt?: string;
};

/**
 * The view settings a board actually renders, tolerating anything stored.
 *
 * Read rather than trusted, for the same reason `toneOf` exists: this data has
 * already survived one rename, it comes back from cloud documents nobody
 * validated, and a board whose `viewMode` is some string from the future should
 * open as a board rather than as a blank rectangle.
 */
export const viewModeOf = (data: KanbanNodeData): KanbanViewMode =>
    data.viewMode === 'calendar' ? 'calendar' : 'board';

export const dateFieldOf = (data: KanbanNodeData): KanbanDateField =>
    data.dateField === 'startDate' || data.dateField === 'createdAt' ? data.dateField : 'dueDate';

export const scaleOf = (data: KanbanNodeData): KanbanCalendarScale =>
    CALENDAR_SCALES.includes(data.calendarScale as KanbanCalendarScale)
        ? (data.calendarScale as KanbanCalendarScale)
        : 'month';

export const granularityOf = (data: KanbanNodeData): KanbanGranularity =>
    data.granularity === 'tasks' || data.granularity === 'both' ? data.granularity : 'cards';

/** The lane that holds cards with no value for the group field. */
export const UNSORTED_VALUE = '';

/** Prefix that keeps a lane's dnd-kit droppable id clear of the card ids. */
export const LANE_PREFIX = 'lane:';

/** dnd-kit id for a lane's own droppable. */
export const laneDroppableId = (value: string) => `${LANE_PREFIX}${value}`;

/** Prefix that keeps a day cell's droppable id clear of card ids and lane ids. */
export const DAY_PREFIX = 'day:';

/** dnd-kit id for one day cell. The suffix is a `DayKey` — see cardDate.ts. */
export const dayDroppableId = (key: string) => `${DAY_PREFIX}${key}`;

/** dnd-kit id for the calendar's unscheduled tray. */
export const TRAY_DROPPABLE_ID = 'unscheduled';

/**
 * Prefix that keeps a task chip's draggable id clear of the card ids.
 *
 * A task is addressed through the card that owns it — `cardTasks` merges body
 * blocks and `data.tasks` entries, so a task id is only unique *within* a card,
 * and a block id is a uuid that could in principle collide with a node id. Both
 * halves travel in the drag id rather than being looked up at drop time, which
 * is what lets the drop handler write the patch without searching every card.
 */
export const TASK_PREFIX = 'task:';

/** dnd-kit id for one task chip. */
export const taskDraggableId = (cardId: string, taskId: string) =>
    `${TASK_PREFIX}${cardId}:${taskId}`;

/** The card and task a draggable id names, or null if it is not a task chip. */
export const parseTaskDragId = (id: string): { cardId: string; taskId: string } | null => {
    if (!id.startsWith(TASK_PREFIX)) return null;
    const rest = id.slice(TASK_PREFIX.length);
    /* First colon, not last: a task id can be a block id, and neither half is
       allowed to contain one — both are uuids. */
    const at = rest.indexOf(':');
    if (at === -1) return null;
    const cardId = rest.slice(0, at);
    const taskId = rest.slice(at + 1);
    return cardId && taskId ? { cardId, taskId } : null;
};

/** Prefix for one half-hour slot of the day/week hour grid. */
export const SLOT_PREFIX = 'slot:';

/** dnd-kit id for one time slot: `slot:YYYY-MM-DD:540` for 9am. */
export const slotDroppableId = (key: string, minutes: number) =>
    `${SLOT_PREFIX}${key}:${minutes}`;

/** The day and time a slot droppable id names, or null if it is not one. */
export const parseSlotId = (id: string): { dayKey: string; minutes: number } | null => {
    if (!id.startsWith(SLOT_PREFIX)) return null;
    const rest = id.slice(SLOT_PREFIX.length);
    const at = rest.lastIndexOf(':');
    if (at === -1) return null;
    const minutes = Number(rest.slice(at + 1));
    if (!Number.isFinite(minutes)) return null;
    return { dayKey: rest.slice(0, at), minutes };
};

const UNSORTED_LABEL: Record<KanbanGroupField, string> = {
    status: 'Backlog',
    priority: 'Unprioritised',
    category: 'Uncategorised',
    assignee: 'Unassigned',
};

export const GROUP_FIELD_LABEL: Record<KanbanGroupField, string> = {
    status: 'Status',
    priority: 'Priority',
    category: 'Category',
    assignee: 'Assignee',
};

export const GROUP_FIELDS: KanbanGroupField[] = ['status', 'priority', 'category', 'assignee'];

const col = (value: string, label: string, tone: KanbanTone): KanbanColumn =>
    ({ id: value || 'unsorted', value, label, tone });

/**
 * Fixed lanes for the closed fields, in the order the work moves through them.
 * The open fields deliberately have none — see `resolveColumns`.
 */
export const DEFAULT_COLUMNS: Partial<Record<KanbanGroupField, KanbanColumn[]>> = {
    status: [
        col('todo', 'To Do', 'neutral'),
        col('in-progress', 'In Progress', 'amber'),
        col('review', 'In Review', 'azure'),
        col('done', 'Done', 'jade'),
    ],
    priority: [
        col('urgent', 'Urgent', 'rose'),
        col('high', 'High', 'amber'),
        col('medium', 'Medium', 'citrine'),
        col('low', 'Low', 'neutral'),
    ],
};

/** Cycled through when a lane is discovered rather than configured. */
const DISCOVERED_TONES: KanbanTone[] = ['azure', 'violet', 'amber', 'jade', 'magenta', 'teal', 'olive', 'rose'];

const titleCase = (value: string): string =>
    value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

/** A child's value for the board's group field; '' when it has none. */
export const cardValue = (data: BoardChildData, field: KanbanGroupField): string => {
    const raw = (data as BoardPlanningFields)[field];
    return typeof raw === 'string' ? raw.trim() : '';
};

/** The default data for a freshly created board. */
export const createKanbanData = (label = 'Board'): KanbanNodeData => ({
    label,
    groupBy: 'status',
    columns: DEFAULT_COLUMNS.status ?? [],
    cardOrder: [],
    createdAt: new Date().toISOString(),
});

/**
 * The lanes a board actually renders.
 *
 * Configured lanes render whether or not they hold cards — an empty "Done"
 * column is information, and a lane you cannot see is a lane you cannot drop
 * into. Values found on cards but not configured are appended, so a card can
 * never go invisible by carrying a value this board has not heard of. The
 * unsorted lane leads, because that is where unplanned work waits, and it is
 * hidden once it is empty and there is somewhere else to drop.
 */
export function resolveColumns(data: KanbanNodeData, cards: BoardChild[]): KanbanColumn[] {
    const field = data.groupBy;
    const configured = data.columns?.length ? data.columns : (DEFAULT_COLUMNS[field] ?? []);
    const out = [...configured];
    const known = new Set(out.map((c) => c.value));

    let hasUnsorted = false;
    for (const card of cards) {
        const value = cardValue(card.data, field);
        if (!value) {
            hasUnsorted = true;
            continue;
        }
        if (known.has(value)) continue;
        known.add(value);
        out.push(col(value, titleCase(value), DISCOVERED_TONES[out.length % DISCOVERED_TONES.length]));
    }

    if (hasUnsorted || out.length === 0) {
        out.unshift(col(UNSORTED_VALUE, UNSORTED_LABEL[field], 'neutral'));
    }
    return out;
}

/** True for the synthetic catch-all lane, which cannot be renamed, reordered or
 *  deleted: it is a consequence of the cards, not a column anyone configured. */
export const isUnsortedColumn = (column: KanbanColumn): boolean => column.value === UNSORTED_VALUE;

/**
 * The columns to persist when the user edits one.
 *
 * Editing has to start from what is on screen, not from what happens to be
 * stored: a board still on its defaults has an empty `columns`, and a lane that
 * was discovered from a card value is not in there either. Resolving first and
 * dropping the synthetic lane materialises exactly what the user can see, so
 * renaming the third column renames the third column.
 */
export function configuredColumns(data: KanbanNodeData, cards: BoardChild[]): KanbanColumn[] {
    return resolveColumns(data, cards).filter((c) => !isUnsortedColumn(c));
}

const slug = (label: string): string =>
    label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * A new column whose `value` is unique among `existing`.
 *
 * The value is derived from the opening label once and then frozen — see the
 * note on `KanbanColumn.value`. A column called "Blocked" writes `blocked` onto
 * its cards for good, even after it is renamed to "On hold".
 */
export function createColumn(label: string, existing: KanbanColumn[]): KanbanColumn {
    const base = slug(label) || 'column';
    const taken = new Set(existing.map((c) => c.value));
    let value = base;
    for (let n = 2; taken.has(value); n++) value = `${base}-${n}`;
    return {
        id: value,
        value,
        label,
        tone: DISCOVERED_TONES[existing.length % DISCOVERED_TONES.length],
    };
}

/** `columns` with the one at `fromValue` moved to where `toValue` sits. */
export function moveColumn(columns: KanbanColumn[], fromValue: string, toValue: string): KanbanColumn[] {
    const from = columns.findIndex((c) => c.value === fromValue);
    const to = columns.findIndex((c) => c.value === toValue);
    if (from === -1 || to === -1 || from === to) return columns;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

/**
 * Cards bucketed by lane value, each lane in board order.
 *
 * A card whose value matches no lane falls into the unsorted bucket rather than
 * being dropped, which is the same guarantee `resolveColumns` makes from the
 * other side: between them, every child card is on screen somewhere.
 */
export function groupCards(
    cards: BoardChild[],
    columns: KanbanColumn[],
    field: KanbanGroupField,
    cardOrder: string[] = [],
): Map<string, BoardChild[]> {
    const lanes = new Map<string, BoardChild[]>(columns.map((c) => [c.value, []]));

    for (const card of cards) {
        const lane = lanes.get(cardValue(card.data, field)) ?? lanes.get(UNSORTED_VALUE);
        lane?.push(card);
    }

    const compare = byBoardOrder(rankOf(cardOrder));
    for (const lane of lanes.values()) lane.sort(compare);
    return lanes;
}

/** `cardOrder` as a lookup, which is all any comparator wants from it. */
export const rankOf = (cardOrder: string[] = []): Map<string, number> =>
    new Map(cardOrder.map((id, i) => [id, i]));

/**
 * The board's idea of card order, as a comparator.
 *
 * Shared by the lanes and the calendar's day cells deliberately. Two views of
 * one set of cards that sorted them differently would be two views disagreeing
 * about which card is first, which is exactly the drift this file's header
 * warns about — so there is one comparator and both call it.
 *
 * Unranked children sort last, then by creation so the fallback is stable
 * rather than dependent on store order. Only notes carry `createdAt`; for a
 * block the id is the tiebreaker, which is arbitrary but at least constant.
 */
export const byBoardOrder = (rank: Map<string, number>) => {
    const UNRANKED = Number.MAX_SAFE_INTEGER;
    const born = (c: BoardChild) => ('createdAt' in c.data ? c.data.createdAt ?? '' : '');
    return (a: BoardChild, b: BoardChild): number => {
        const ra = rank.get(a.id) ?? UNRANKED;
        const rb = rank.get(b.id) ?? UNRANKED;
        if (ra !== rb) return ra - rb;
        return born(a).localeCompare(born(b)) || a.id.localeCompare(b.id);
    };
};

/**
 * `cardOrder` rewritten so `movedId` sits at `index` of the lane it just landed
 * in. Ids the board no longer holds are dropped on the way through, which is
 * what keeps the list from growing forever as cards come and go.
 */
export function reorderCardOrder(
    lanes: Map<string, BoardChild[]>,
    movedId: string,
    targetValue: string,
    index: number,
): string[] {
    const next: string[] = [];
    for (const [value, cards] of lanes) {
        const ids = cards.map((c) => c.id).filter((cardId) => cardId !== movedId);
        if (value === targetValue) {
            ids.splice(Math.max(0, Math.min(index, ids.length)), 0, movedId);
        }
        next.push(...ids);
    }
    return next;
}
