/**
 * A card's tasks — the one list, however it was written.
 *
 * A task can come from two places, and both are legitimate:
 *
 *  - a `todo` block in the card's body, which is what you get by typing a
 *    checklist while writing. The block is the truth for its text and its tick;
 *    indenting it with Tab makes it a subtask of the line above, so the nesting
 *    you can already see in the body is the nesting reported here.
 *  - an entry in `data.tasks`, added from the metadata panel. These are
 *    deliberately NOT written into the body — a task you jotted against a card
 *    is not the same thing as a line in the document — but `syncTaskToBody`
 *    puts one there on request.
 *
 * `data.tasks` doubles as the store for everything a `todo` block has nowhere
 * to keep: a description, a start date, an image. An entry carrying a `blockId`
 * is an *overlay* on that block rather than a task of its own, so a body task
 * with a description is still one task, not two.
 *
 * Reading is therefore a merge, and it is done here rather than in the four
 * places that need it — the metadata panel, the task modal, the board card and
 * the calendar — because a card that disagrees with itself about how many tasks
 * it has is the exact failure this module exists to prevent.
 *
 * Every write returns a `Partial<NoteData>` patch rather than touching the
 * store, so callers stay one `updateNodeData` call and the rules live in one
 * testable place with no React in it.
 */

import { v4 as uuidv4 } from 'uuid';

import type { Block } from '../editor/types';
import type { NoteData } from '../../types';

/** How deep a subtask is allowed to nest before the indent stops growing. */
export const MAX_TASK_DEPTH = 4;

/** What is persisted on `NoteData.tasks`. */
export interface StoredTask {
    id: string;
    /** Set when this entry describes a `todo` block in the body, not a task of
     *  its own. Its text and tick come from the block; the rest from here. */
    blockId?: string;
    /** Set when this task is a subtask of another — of a body task or of a
     *  stored one. Order alone could not express that for a body parent. */
    parentId?: string;
    /** Only for standalone tasks; a body task's text lives in its block. */
    text?: string;
    completed?: boolean;
    description?: string;
    startDate?: string;
    dueDate?: string;
    /** An `asset:<id>` reference, the same shape a cover image uses. */
    image?: string;
}

/** A task as the UI reads it, after body and metadata have been merged. */
export interface CardTask {
    id: string;
    text: string;
    completed: boolean;
    /** 0 is a task; anything above it is a subtask. */
    depth: number;
    /** The body block this mirrors, if it came from the document. */
    blockId?: string;
    description?: string;
    startDate?: string;
    dueDate?: string;
    image?: string;
}

const asBlocks = (content: NoteData['content']): Block[] =>
    Array.isArray(content) ? content : [];

/** Markdown is the storage format; a task line wants the words only. */
const plainText = (text: string): string =>
    text
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__|~~|`)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const storedTasks = (data: NoteData): StoredTask[] =>
    Array.isArray(data.tasks) ? data.tasks : [];

/**
 * Legacy `subtasks` read as standalone tasks.
 *
 * The old properties panel wrote a flat `{id, text, completed}[]`. Rather than
 * migrate on load — which would rewrite documents nobody edited, and could only
 * ever run once — they are folded in on read, and `migrateLegacy` moves them
 * for real the first time anything writes.
 */
const legacyTasks = (data: NoteData): StoredTask[] =>
    (data.subtasks ?? []).map((t) => ({ id: t.id, text: t.text, completed: t.completed }));

/** Every stored entry, legacy included, in one list. */
const allStored = (data: NoteData): StoredTask[] => [...storedTasks(data), ...legacyTasks(data)];

/**
 * The card's tasks, in reading order, with subtasks under their parents.
 *
 * Body tasks come first and in body order, because that is the order they are
 * written in; metadata-only tasks follow. A stored entry with a `parentId`
 * is placed directly under that parent whatever kind it is, which is what lets
 * a subtask added in the modal attach to a task that lives in the body.
 */
export function cardTasks(data: NoteData): CardTask[] {
    const stored = allStored(data);
    const overlayByBlock = new Map<string, StoredTask>();
    const childrenOf = new Map<string, StoredTask[]>();
    const roots: StoredTask[] = [];

    for (const entry of stored) {
        if (entry.blockId) {
            overlayByBlock.set(entry.blockId, entry);
            continue;
        }
        if (entry.parentId) {
            const bucket = childrenOf.get(entry.parentId);
            if (bucket) bucket.push(entry);
            else childrenOf.set(entry.parentId, [entry]);
            continue;
        }
        roots.push(entry);
    }

    const out: CardTask[] = [];
    const seen = new Set<string>();

    const fromStored = (entry: StoredTask, depth: number): CardTask => ({
        id: entry.id,
        text: entry.text ?? '',
        completed: !!entry.completed,
        depth,
        description: entry.description,
        startDate: entry.startDate,
        dueDate: entry.dueDate,
        image: entry.image,
    });

    /* Guarded against a `parentId` cycle, which no UI can create but a
       hand-edited or merged document could. */
    const pushWithChildren = (task: CardTask, entryId: string) => {
        if (seen.has(entryId)) return;
        seen.add(entryId);
        out.push(task);
        for (const child of childrenOf.get(entryId) ?? []) {
            pushWithChildren(
                fromStored(child, Math.min(task.depth + 1, MAX_TASK_DEPTH)),
                child.id,
            );
        }
    };

    for (const block of asBlocks(data.content)) {
        if (block.type !== 'todo') continue;
        const overlay = overlayByBlock.get(block.id);
        pushWithChildren({
            id: block.id,
            text: plainText(block.content),
            completed: !!block.metadata?.checked,
            depth: Math.min(block.indent ?? 0, MAX_TASK_DEPTH),
            blockId: block.id,
            description: overlay?.description,
            startDate: overlay?.startDate,
            /* A todo block already had somewhere to keep a due date, so that one
               is read from the block and only falls back to the overlay. */
            dueDate: (block.metadata?.dueDate as string | undefined) ?? overlay?.dueDate,
            image: overlay?.image,
        }, block.id);
    }

    for (const entry of roots) pushWithChildren(fromStored(entry, 0), entry.id);

    return out;
}

export interface TaskProgress {
    done: number;
    total: number;
    /** 0-100, or null when there is nothing to report. */
    percent: number | null;
}

/** How far through its tasks a card is. Subtasks count — they are work too. */
export function taskProgress(data: NoteData): TaskProgress {
    const tasks = cardTasks(data);
    const done = tasks.filter((t) => t.completed).length;
    return {
        done,
        total: tasks.length,
        percent: tasks.length === 0 ? null : Math.round((done / tasks.length) * 100),
    };
}

/* -------------------------------------------------------------------- writes */

/**
 * Fold legacy `subtasks` into `tasks`, once, on the first write that touches
 * them. Doing it here rather than on load means untouched documents are left
 * alone, and a write that was going to happen anyway carries the migration.
 */
const migrateLegacy = (data: NoteData): Pick<NoteData, 'tasks' | 'subtasks'> | null => {
    if (!data.subtasks?.length) return null;
    return { tasks: [...storedTasks(data), ...legacyTasks(data)], subtasks: [] };
};

/** The stored entries after `mutate` has been applied, plus the migration. */
const withTasks = (
    data: NoteData,
    mutate: (tasks: StoredTask[]) => StoredTask[],
): Partial<NoteData> => {
    const migration = migrateLegacy(data);
    const base = migration ? migration.tasks! : storedTasks(data);
    const next: Partial<NoteData> = { tasks: mutate([...base]) };
    if (migration) next.subtasks = [];
    return next;
};

/** The body blocks after `mutate`, ready to patch onto `content`. */
const withBlocks = (data: NoteData, mutate: (blocks: Block[]) => Block[]): Partial<NoteData> => ({
    content: mutate([...asBlocks(data.content)]),
});

/**
 * Tick or untick a task.
 *
 * A body task's tick belongs to its block — that is what the reader sees in the
 * document, and writing it anywhere else would leave the two disagreeing.
 */
export function toggleTask(data: NoteData, taskId: string): Partial<NoteData> {
    const task = cardTasks(data).find((t) => t.id === taskId);
    if (!task) return {};

    if (task.blockId) {
        return withBlocks(data, (blocks) => blocks.map((b) => (
            b.id === task.blockId
                ? { ...b, metadata: { ...b.metadata, checked: !task.completed } }
                : b
        )));
    }

    return withTasks(data, (tasks) => tasks.map((t) => (
        t.id === taskId ? { ...t, completed: !task.completed } : t
    )));
}

/** Rename a task. Body tasks write back into their block's text. */
export function renameTask(data: NoteData, taskId: string, text: string): Partial<NoteData> {
    const task = cardTasks(data).find((t) => t.id === taskId);
    if (!task || text === task.text) return {};

    if (task.blockId) {
        return withBlocks(data, (blocks) => blocks.map((b) => (
            b.id === task.blockId ? { ...b, content: text } : b
        )));
    }
    return withTasks(data, (tasks) => tasks.map((t) => (
        t.id === taskId ? { ...t, text } : t
    )));
}

/** The fields a task carries beyond its text and its tick. */
export type TaskDetails = Pick<StoredTask, 'description' | 'startDate' | 'dueDate' | 'image'>;

/**
 * Set a task's details.
 *
 * For a body task this creates or updates the overlay entry keyed by its block
 * id — the block keeps the text and the tick, this keeps everything a block has
 * no room for. A due date is the exception: the block has a field for it
 * already, so it is written there and the overlay never shadows it.
 */
export function setTaskDetails(
    data: NoteData,
    taskId: string,
    details: TaskDetails,
): Partial<NoteData> {
    const task = cardTasks(data).find((t) => t.id === taskId);
    if (!task) return {};

    const { dueDate, ...rest } = details;
    const patch: Partial<NoteData> = {};

    if (task.blockId) {
        if ('dueDate' in details) {
            Object.assign(patch, withBlocks(data, (blocks) => blocks.map((b) => (
                b.id === task.blockId
                    ? { ...b, metadata: { ...b.metadata, dueDate: dueDate || undefined } }
                    : b
            ))));
        }
        if (Object.keys(rest).length > 0) {
            Object.assign(patch, withTasks(data, (tasks) => {
                const at = tasks.findIndex((t) => t.blockId === task.blockId);
                if (at === -1) return [...tasks, { id: uuidv4(), blockId: task.blockId, ...rest }];
                return tasks.map((t, i) => (i === at ? { ...t, ...rest } : t));
            }));
        }
        return patch;
    }

    return withTasks(data, (tasks) => tasks.map((t) => (
        t.id === taskId ? { ...t, ...details } : t
    )));
}

/**
 * A new task, or a subtask of `parentId`.
 *
 * Metadata-only by design: adding a task against a card is not the same act as
 * writing a line into its document, so nothing is inserted into the body until
 * `syncTaskToBody` is asked for it.
 */
export function addTask(
    data: NoteData,
    text: string,
    parentId?: string,
): Partial<NoteData> & { taskId: string } {
    const trimmed = text.trim();
    const id = uuidv4();
    const entry: StoredTask = { id, text: trimmed, completed: false };
    if (parentId) entry.parentId = parentId;
    return { ...withTasks(data, (tasks) => [...tasks, entry]), taskId: id };
}

/**
 * Remove a task, its stored subtasks, and its body block if it had one.
 *
 * Deleting a task in the panel deletes the checklist line it stands for — the
 * alternative is a line in the document that the card claims it does not have.
 */
export function removeTask(data: NoteData, taskId: string): Partial<NoteData> {
    const task = cardTasks(data).find((t) => t.id === taskId);
    if (!task) return {};

    const doomed = new Set<string>([taskId]);
    /* Descendants go too, or they would resurface as roots — `cardTasks` places
       an entry whose parent it cannot find at the top level. */
    for (;;) {
        const before = doomed.size;
        for (const entry of allStored(data)) {
            if (entry.parentId && doomed.has(entry.parentId)) doomed.add(entry.id);
        }
        if (doomed.size === before) break;
    }

    const patch = withTasks(data, (tasks) => tasks.filter(
        (t) => !doomed.has(t.id) && !(t.blockId && doomed.has(t.blockId)),
    ));

    if (task.blockId) {
        Object.assign(patch, withBlocks(data, (blocks) => blocks.filter((b) => b.id !== task.blockId)));
    }
    return patch;
}

/**
 * Write a metadata-only task into the card's body as a `todo` block.
 *
 * The entry stays, re-pointed at the new block by `blockId`, so any description
 * or image it had carries over instead of being dropped on the way in. Its
 * indent mirrors the depth it already had, so a subtask lands as a subtask.
 */
export function syncTaskToBody(data: NoteData, taskId: string): Partial<NoteData> {
    const tasks = cardTasks(data);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.blockId) return {};

    const blockId = uuidv4();
    const block: Block = {
        id: blockId,
        type: 'todo',
        content: task.text,
        indent: task.depth,
        metadata: {
            checked: task.completed,
            ...(task.dueDate ? { dueDate: task.dueDate } : null),
        },
    };

    return {
        ...withBlocks(data, (blocks) => [...blocks, block]),
        ...withTasks(data, (stored) => stored.map((t) => (
            t.id === taskId
                ? { ...t, blockId, parentId: undefined, text: undefined, completed: undefined }
                : t
        ))),
    };
}
