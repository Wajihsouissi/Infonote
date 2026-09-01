/**
 * Fast, browser-free check of the card task model.
 *
 * Run: node --experimental-strip-types scripts/check-card-tasks.mts
 *
 * The interesting part is the merge: a task can come from a `todo` block in the
 * body or from `data.tasks`, and an entry carrying a `blockId` is an overlay on
 * a block rather than a task of its own. Getting that wrong shows up as a card
 * that double-counts its own checklist, which is exactly the sort of thing a
 * click-through misses and a table like this does not.
 */
import {
    addTask,
    cardTasks,
    removeTask,
    renameTask,
    setTaskDetails,
    syncTaskToBody,
    taskProgress,
    toggleTask,
    type StoredTask,
} from '../src/features/card/cardTasks.ts';
import type { NoteData } from '../src/types.ts';
import type { Block } from '../src/features/editor/types.ts';

let failures = 0;
let checks = 0;

const check = (label: string, actual: unknown, expected: unknown): void => {
    checks++;
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        failures++;
        console.log(`FAIL ${label}: ${a} (expected ${e})`);
    }
};

const todo = (id: string, content: string, opts: {
    checked?: boolean; indent?: number; dueDate?: string;
} = {}): Block => ({
    id,
    type: 'todo',
    content,
    indent: opts.indent,
    metadata: {
        ...(opts.checked !== undefined ? { checked: opts.checked } : null),
        ...(opts.dueDate ? { dueDate: opts.dueDate } : null),
    },
});

const note = (over: Partial<NoteData> = {}): NoteData => ({ label: 'Card', ...over });

/** Apply a patch the way `updateNodeData` would, so chains are realistic. */
const apply = (data: NoteData, patch: Partial<NoteData>): NoteData => ({ ...data, ...patch });

const texts = (data: NoteData) => cardTasks(data).map((t) => t.text);
const depths = (data: NoteData) => cardTasks(data).map((t) => t.depth);

/* ------------------------------------------------------ 1. reading the body */

const body = note({
    content: [
        { id: 'p', type: 'text', content: 'Some prose' },
        todo('t1', 'Write the thing'),
        todo('t2', 'A detail', { indent: 1 }),
        todo('t3', 'Another detail', { indent: 1, checked: true }),
        todo('t4', 'Ship it'),
    ],
});

check('body todos become tasks', texts(body),
    ['Write the thing', 'A detail', 'Another detail', 'Ship it']);
check('indent becomes depth', depths(body), [0, 1, 1, 0]);
check('prose is not a task', cardTasks(body).length, 4);
check('checked is read from the block', cardTasks(body)[2].completed, true);
check('body tasks carry their block id', cardTasks(body)[0].blockId, 't1');
check('progress counts subtasks too', taskProgress(body), { done: 1, total: 4, percent: 25 });
check('markdown is stripped', texts(note({ content: [todo('a', '**Bold** and `code`')] })), ['Bold and code']);
check('no content, no tasks', taskProgress(note()), { done: 0, total: 0, percent: null });

/* ------------------------------------------- 2. metadata-only tasks and merge */

const mixed = note({
    content: [todo('t1', 'From the body')],
    tasks: [{ id: 's1', text: 'From the panel', completed: false }],
});
check('body and panel tasks merge', texts(mixed), ['From the body', 'From the panel']);
check('body comes first', cardTasks(mixed)[0].blockId, 't1');
check('panel task has no block', cardTasks(mixed)[1].blockId, undefined);

/* An entry with a blockId is an overlay, NOT a second task. This is the
   double-count the whole module exists to prevent. */
const overlaid = note({
    content: [todo('t1', 'One task')],
    tasks: [{ id: 'o1', blockId: 't1', description: 'Why it matters' }],
});
check('overlay does not add a task', cardTasks(overlaid).length, 1);
check('overlay supplies the description', cardTasks(overlaid)[0].description, 'Why it matters');
check('overlay keeps the block text', cardTasks(overlaid)[0].text, 'One task');

/* A subtask added against a body task attaches under it, which array order
   alone could not express. */
const attached = note({
    content: [todo('t1', 'Parent in body'), todo('t2', 'Next body task')],
    tasks: [{ id: 's1', parentId: 't1', text: 'Child in panel', completed: false }],
});
check('panel subtask sits under its body parent', texts(attached),
    ['Parent in body', 'Child in panel', 'Next body task']);
check('panel subtask is one deeper', depths(attached), [0, 1, 0]);

/* Legacy `subtasks` still read. */
const legacy = note({ subtasks: [{ id: 'L1', text: 'Old style', completed: true }] });
check('legacy subtasks are read', texts(legacy), ['Old style']);
check('legacy completion is read', taskProgress(legacy), { done: 1, total: 1, percent: 100 });

/* Cycles cannot hang the render. */
const cyclic = note({ tasks: [
    { id: 'a', parentId: 'b', text: 'A' },
    { id: 'b', parentId: 'a', text: 'B' },
] });
check('a parent cycle terminates', cardTasks(cyclic).length >= 0, true);

/* Depth is capped so a deeply indented body cannot indent forever. */
check('depth is capped', cardTasks(note({ content: [todo('d', 'Deep', { indent: 99 })] }))[0].depth, 4);

/* ------------------------------------------------------------- 3. toggling */

const toggledBody = apply(body, toggleTask(body, 't1'));
check('toggling a body task writes the block', cardTasks(toggledBody)[0].completed, true);
check('toggling a body task leaves tasks alone', toggledBody.tasks ?? [], []);

const toggledPanel = apply(mixed, toggleTask(mixed, 's1'));
check('toggling a panel task writes the entry', cardTasks(toggledPanel)[1].completed, true);
check('toggling a panel task leaves the body alone',
    (toggledPanel.content as Block[])[0].metadata?.checked, undefined);

check('toggling an unknown id writes nothing', toggleTask(body, 'nope'), {});

/* Legacy entries migrate on the first write that touches them. */
const migrated = apply(legacy, toggleTask(legacy, 'L1'));
check('legacy migrates into tasks', migrated.tasks?.length, 1);
check('legacy list is emptied', migrated.subtasks, []);
check('legacy survives the move', cardTasks(migrated)[0].completed, false);
check('migration does not duplicate', cardTasks(migrated).length, 1);

/* --------------------------------------------------------------- 4. details */

const described = apply(overlaid, setTaskDetails(overlaid, 't1', { description: 'Updated' }));
check('overlay is updated, not appended', described.tasks?.length, 1);
check('description lands', cardTasks(described)[0].description, 'Updated');

const freshOverlay = apply(body, setTaskDetails(body, 't1', { description: 'New note' }));
check('an overlay is created on demand', freshOverlay.tasks?.length, 1);
check('created overlay points at the block', freshOverlay.tasks?.[0].blockId, 't1');
check('created overlay adds no task', cardTasks(freshOverlay).length, 4);

/* A due date has a home on the block already, so it is written there. */
const dated = apply(body, setTaskDetails(body, 't1', { dueDate: '2026-09-01T00:00:00.000Z' }));
check('due date goes to the block',
    (dated.content as Block[]).find((b) => b.id === 't1')?.metadata?.dueDate,
    '2026-09-01T00:00:00.000Z');
check('due date is read back', cardTasks(dated)[0].dueDate, '2026-09-01T00:00:00.000Z');

const panelDated = apply(mixed, setTaskDetails(mixed, 's1', { startDate: '2026-09-02' }));
check('panel task keeps its own dates', cardTasks(panelDated)[1].startDate, '2026-09-02');

check('details on an unknown id write nothing', setTaskDetails(body, 'nope', { description: 'x' }), {});

/* ------------------------------------------------------ 5. adding / removing */

const added = apply(body, addTask(body, 'A new one'));
check('added task appears last', texts(added).at(-1), 'A new one');
check('added task is not in the body', (added.content as Block[]).length, 5);

const addedChild = apply(body, addTask(body, 'Under t4', 't4'));
check('subtask attaches to its parent', texts(addedChild),
    ['Write the thing', 'A detail', 'Another detail', 'Ship it', 'Under t4']);
check('subtask is one deeper', depths(addedChild), [0, 1, 1, 0, 1]);

const removedPanel = apply(mixed, removeTask(mixed, 's1'));
check('removing a panel task drops the entry', texts(removedPanel), ['From the body']);

const removedBody = apply(body, removeTask(body, 't1'));
check('removing a body task drops its block', texts(removedBody),
    ['A detail', 'Another detail', 'Ship it']);

/* Descendants go with their parent, or they would resurface as roots. */
const withKids = note({ tasks: [
    { id: 'p1', text: 'Parent' },
    { id: 'c1', parentId: 'p1', text: 'Child' },
    { id: 'c2', parentId: 'c1', text: 'Grandchild' },
    { id: 'other', text: 'Untouched' },
] });
const prunedKids = apply(withKids, removeTask(withKids, 'p1'));
check('descendants are removed too', texts(prunedKids), ['Untouched']);

/* ------------------------------------------------------- 6. sync to the body */

const synced = apply(mixed, syncTaskToBody(mixed, 's1'));
const syncedBlocks = synced.content as Block[];
check('sync adds a todo block', syncedBlocks.length, 2);
check('sync writes the text', syncedBlocks[1].content, 'From the panel');
check('sync still counts once', cardTasks(synced).length, 2);
check('synced task is now a body task', cardTasks(synced)[1].blockId, syncedBlocks[1].id);

/* Details survive the trip rather than being dropped on the way in. */
const rich = note({ tasks: [
    { id: 's1', text: 'Has detail', completed: true, description: 'Keep me', image: 'asset:abc' },
] });
const syncedRich = apply(rich, syncTaskToBody(rich, 's1'));
check('sync keeps the description', cardTasks(syncedRich)[0].description, 'Keep me');
check('sync keeps the image', cardTasks(syncedRich)[0].image, 'asset:abc');
check('sync carries the tick', cardTasks(syncedRich)[0].completed, true);
check('sync still counts once', cardTasks(syncedRich).length, 1);

check('syncing a body task does nothing', syncTaskToBody(body, 't1'), {});

/* A synced subtask lands at its own indent. */
const nested = note({ tasks: [
    { id: 'p1', text: 'Parent' },
    { id: 'c1', parentId: 'p1', text: 'Child' },
] });
const syncedChild = apply(nested, syncTaskToBody(nested, 'c1'));
check('synced subtask keeps its depth',
    (syncedChild.content as Block[])[0].indent, 1);

/* ------------------------------------------------------------- 7. renaming */

const renamedBody = apply(body, renameTask(body, 't1', 'Renamed'));
check('renaming a body task writes the block',
    (renamedBody.content as Block[]).find((b) => b.id === 't1')?.content, 'Renamed');
const renamedPanel = apply(mixed, renameTask(mixed, 's1', 'Renamed too'));
check('renaming a panel task writes the entry', texts(renamedPanel)[1], 'Renamed too');
check('renaming to the same text writes nothing', renameTask(body, 't1', 'Write the thing'), {});

/* ------------------------------------------------------------------- done */

const stored: StoredTask = { id: 'shape-check' };
check('StoredTask needs only an id', stored.id, 'shape-check');

if (failures > 0) {
    console.log(`${failures} of ${checks} checks FAILED`);
    process.exit(1);
}
console.log(`all ${checks} checks passed`);
