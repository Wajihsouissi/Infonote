import { test, expect } from '../../support/fixtures';
import { fitView, nodeById, openCanvas, selectNode } from '../../support/canvas';
import { readCanvasState, seedCanvasState, type CanvasStateNode } from '../../support/canvasState';

/**
 * Card tasks on the board and the calendar.
 *
 * The rule under test is the merge: a checklist typed into a card's body and a
 * task added against the card in the metadata are one list, and an overlay
 * entry that decorates a body task is not a second task. A card that
 * double-counts its own checklist is the failure these guard.
 */

const BOARD = 'task-board';

const pad = (n: number) => String(n).padStart(2, '0');

/** A day in the month the calendar opens on — the cursor starts at today. */
const dayThisMonth = (dayOfMonth: number): string => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(dayOfMonth)}`;
};

const todo = (id: string, text: string, opts: { checked?: boolean; indent?: number } = {}) => ({
    id,
    type: 'todo',
    content: text,
    indent: opts.indent,
    metadata: opts.checked === undefined ? {} : { checked: opts.checked },
});

async function seedBoard(
    page: Parameters<typeof seedCanvasState>[0],
    cardData: Record<string, unknown>,
    boardData: Record<string, unknown> = {},
) {
    await seedCanvasState(page, [
        {
            id: BOARD,
            type: 'kanban',
            position: { x: 0, y: 0 },
            style: { width: 1752, height: 720 },
            data: {
                label: 'Task board', groupBy: 'status', columns: [], cardOrder: [],
                viewMode: 'board', ...boardData,
            },
        },
        {
            id: 'card',
            type: 'note',
            parentId: BOARD,
            position: { x: 0, y: 0 },
            style: { width: 432, height: 432 },
            data: {
                label: 'Ship it', status: 'todo', viewMode: 'medium', icon: 'FileText',
                createdAt: `${dayThisMonth(1)}T09:00:00.000Z`, ...cardData,
            },
        },
    ] as CanvasStateNode[]);
    await fitView(page);
}

const meter = (page: Parameters<typeof seedCanvasState>[0]) =>
    page.locator('button[class*="meter"]');

test.describe('advanced: card tasks', () => {
    test('a checklist in the body shows as tasks on the board card', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, {
            content: [
                { id: 'p', type: 'text', content: 'Notes' },
                todo('t1', 'Cut the branch', { checked: true }),
                todo('t2', 'Run the suite', { indent: 1 }),
                todo('t3', 'Announce'),
            ],
        });

        // Nothing was written into `tasks`; the list is read from the body.
        await expect(meter(page)).toHaveText('1/3');
        await expect(page.locator('article')).toContainText('Cut the branch');
        await expect(page.locator('article')).toContainText('Run the suite');
    });

    test('body tasks and metadata tasks merge into one count', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, {
            content: [todo('t1', 'In the body', { checked: true })],
            tasks: [{ id: 'm1', text: 'In the metadata', completed: false }],
        });

        await expect(meter(page)).toHaveText('1/2');
    });

    test('an overlay entry decorates a body task without counting twice', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, {
            content: [todo('t1', 'One task')],
            // `blockId` makes this an overlay on t1, not a task of its own.
            tasks: [{ id: 'o1', blockId: 't1', description: 'Why it matters' }],
        });

        await expect(meter(page)).toHaveText('0/1');
    });

    test('the meter opens the task list, and a task opens its details', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, {
            content: [todo('t1', 'Cut the branch'), todo('t2', 'A detail', { indent: 1 })],
        });

        await meter(page).click();

        const dialog = page.locator('[role="dialog"][aria-modal="true"]');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('Cut the branch');
        await expect(dialog).toContainText('A detail');

        await dialog.locator('[class*="taskText"]').filter({ hasText: 'Cut the branch' }).first().click();

        // The detail view: dates, a description, an image and subtasks.
        await expect(dialog).toContainText('Start');
        await expect(dialog).toContainText('Due');
        await expect(dialog).toContainText('Description');
        await expect(dialog).toContainText('Subtasks');
        await expect(dialog.locator('[class*="detailOrigin"]')).toContainText('In the note');
    });

    test('ticking a body task from the board writes the block, not a copy', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, { content: [todo('t1', 'Cut the branch')] });

        await page.locator('article [role="checkbox"]').first().click();
        await expect(meter(page)).toHaveText('1/1');

        const state = await readCanvasState(page);
        const card = state!.nodes.find((n) => n.id === 'card')!;
        const blocks = card.data!.content as { id: string; metadata?: { checked?: boolean } }[];
        expect(blocks.find((b) => b.id === 't1')?.metadata?.checked).toBe(true);
        // The tick belongs to the block; no shadow copy appears alongside it.
        expect(card.data!.tasks ?? []).toEqual([]);
    });

    test('the calendar chip carries the task count and opens the list', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, {
            dueDate: dayThisMonth(15),
            content: [todo('t1', 'Cut the branch', { checked: true }), todo('t2', 'Announce')],
        }, { viewMode: 'calendar', calendarScale: 'month', dateField: 'dueDate' });

        const badge = page.locator('[data-seg] button[class*="badge"]');
        await expect(badge).toHaveText('1/2');

        await badge.click();
        await expect(page.locator('[role="dialog"][aria-modal="true"]')).toContainText('Cut the branch');
    });

    test('the properties panel edits both dates with the app\'s own picker', async ({ page }) => {
        await openCanvas(page);
        const day = await page.evaluate(() => {
            const p = (n: number) => String(n).padStart(2, '0');
            const d = new Date();
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        });

        await seedCanvasState(page, [{
            id: 'solo',
            type: 'note',
            position: { x: 0, y: 0 },
            style: { width: 680, height: 760 },
            data: {
                label: 'Ghost Mode', viewMode: 'expanded', icon: 'FileText', showMetadata: true,
                createdAt: `${day}T09:00:00.000Z`,
                startDate: `${day}T13:00:00.000Z`,
                dueDate: `${day}T15:30:00.000Z`,
            },
        }] as CanvasStateNode[]);
        await fitView(page);

        /* A card on the canvas wears an interaction shield until it is selected —
           the click that reaches its interior is the second one. */
        await selectNode(nodeById(page, 'solo'));

        /* Start and end on one day are a single chip, because two would print
           the same date twice. Its editor holds both ends. */
        const chip = page.locator('[class*="_chip_"]').filter({ hasText: '→' });
        await expect(chip).toBeVisible();
        /* Asserted on the arrow, not the clock text: the chip formats times in
           the reader's locale, so a runner on en-US renders "1:00 PM" where a
           developer on en-GB sees "13:00". The stored values are checked
           below, where the format is ours rather than the locale's. */
        await expect(chip).toContainText('→');

        /* The browser's own calendar popover is gone from this surface. A hidden
           `input[type=date]` driven by showPicker() opened Chrome's dark widget
           in the middle of an otherwise Paper & Ink card, and could not express
           a time at all. */
        await expect(page.locator('input[type="date"]')).toHaveCount(0);

        await chip.click();
        const dialog = page.locator('[role="dialog"][aria-label="Start and end"]');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('Starts');
        await expect(dialog).toContainText('Ends');

        // Editing one end leaves the other alone.
        await dialog.locator('[class*="_trigger_"]').first().click();
        const time = page.locator('input[type="time"]').first();
        await expect(time).toBeVisible();
        await expect(time).toHaveValue('13:00');
        await time.fill('08:15');
        await page.waitForTimeout(300);

        const state = await readCanvasState(page);
        const data = state!.nodes.find((n) => n.id === 'solo')!.data as Record<string, string>;
        expect(data.startDate).toBe(`${day}T08:15:00.000Z`);
        expect(data.dueDate).toBe(`${day}T15:30:00.000Z`);
    });

    test('the metadata bar is two labelled runs, not a stack of property rows', async ({ page }) => {
        await openCanvas(page);
        const day = await page.evaluate(() => {
            const p = (n: number) => String(n).padStart(2, '0');
            const d = new Date();
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        });

        await seedCanvasState(page, [{
            id: 'solo',
            type: 'note',
            position: { x: 0, y: 0 },
            style: { width: 720, height: 820 },
            data: {
                label: 'Ghost Mode', viewMode: 'expanded', icon: 'FileText', showMetadata: true,
                description: 'Prevent AI hallucinations by introducing a review step.',
                createdAt: `${day}T09:00:00.000Z`,
                status: 'in-progress', priority: 'high', assignee: 'Wajih', progress: 40,
                url: 'https://example.com/docs', tags: ['ai', 'safety'],
                startDate: `${day}T13:00:00.000Z`, dueDate: `${day}T15:30:00.000Z`,
                content: [
                    { id: 'h', type: 'heading2', content: 'Objective' },
                    { id: 't1', type: 'todo', content: 'Create a Ghost Mode toggle', metadata: {} },
                    { id: 't2', type: 'todo', content: 'Add an Accept / Reject bar', metadata: {} },
                ],
            },
        }] as CanvasStateNode[]);
        await fitView(page);
        await selectNode(nodeById(page, 'solo'));

        // Every property is present as a chip; none of them as a stacked row.
        await expect(page.locator('[class*="propertyRow"]')).toHaveCount(0);
        const chips = page.locator('[class*="_bar_"] [class*="_chip_"]:not([class*="_add_"])');
        /* Seven, not nine: progress and tasks are one completion chip (they were
           the same question asked twice), and the tags share one. */
        await expect(chips).toHaveCount(7);

        /* The hierarchy is positional, so the runs are the assertion: PLAN
           answers where it stands and when it is due, WORK answers who has it
           and how far along it is, and neither moves. */
        const runs = page.locator('[class*="_bar_"] [class*="_run_"]');
        await expect(runs).toHaveCount(2);
        await expect(runs.nth(0).locator('[class*="_runLabel_"]')).toHaveText('Plan');
        await expect(runs.nth(1).locator('[class*="_runLabel_"]')).toHaveText('Work');
        await expect(runs.nth(0).locator('[class*="_chip_"]:not([class*="_add_"])')).toHaveCount(3);
        await expect(runs.nth(1).locator('[class*="_chip_"]:not([class*="_add_"])')).toHaveCount(4);

        /* Status and In Review must not be the same colour — the palette's
           --a-amber/--a-azure/--a-rose all collapse to one hue, which is why
           this bar maps its own. */
        const statusColour = await runs.nth(0).locator('[class*="_chip_"]:not([class*="_add_"])').first()
            .evaluate((el) => getComputedStyle(el).color);
        expect(statusColour).not.toBe('rgb(255, 80, 64)');

        /* The completion chip is the way into the checklist, not a menu that
           offers to open it — one click, straight to the tasks. */
        await runs.nth(1).locator('[class*="_chip_"]:not([class*="_add_"])').first().click();
        const taskList = page.locator('[role="dialog"][aria-modal="true"]');
        await expect(taskList).toBeVisible();
        await expect(taskList).toContainText('Create a Ghost Mode toggle');
        await page.keyboard.press('Escape');
        await expect(taskList).toHaveCount(0);

        /* The hand-set percentage this card also carries has no chip of its own
           — the checklist won the label — so "+" is what keeps it reachable. */
        await page.locator('[class*="_add_"]').click();
        await expect(page.locator('[class*="_popover_"]')).toContainText('Progress');
        await page.keyboard.press('Escape');

        /* The header collapsed with the bar: one 40px icon row plus a
           single-line description, in place of the 65px tile, the Shown/Hidden
           pill, and the padded description block. */
        const headerBox = await page.locator('[class*="compactHeader"]').boundingBox();
        expect(headerBox!.height).toBeLessThan(48);
        const descBox = await page.locator('[class*="compactDescEdit"]').boundingBox();
        expect(descBox!.height).toBeLessThan(26);
        await expect(page.locator('text=Shown')).toHaveCount(0);

        // The cover strip is deliberately left as it was.
        await expect(page.getByText('Add Cover')).toBeVisible();

        /* The point of the whole exercise: the body is the majority of the card
           rather than a scrolling sliver. The old panel left it at 14%. */
        const share = await page.evaluate(() => {
            const h = (s: string) => {
                const el = document.querySelector(s);
                return el ? el.getBoundingClientRect().height : 0;
            };
            return h('[class*="noteArea"]') / h('[class*="expandedView"]');
        });
        expect(share).toBeGreaterThan(0.45);

        // And it no longer hides its own content behind a scroll.
        const hidden = await page.evaluate(() => {
            const el = document.querySelector('[class*="noteArea"]');
            return el ? el.scrollHeight - el.clientHeight : -1;
        });
        expect(hidden).toBeLessThanOrEqual(0);
    });

    test('legacy subtasks still show, and migrate on the first write', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, {
            subtasks: [
                { id: 'L1', text: 'Old one', completed: true },
                { id: 'L2', text: 'Old two', completed: false },
            ],
        });

        await expect(meter(page)).toHaveText('1/2');

        await meter(page).click();
        const dialog = page.locator('[role="dialog"][aria-modal="true"]');
        await dialog.locator('[role="checkbox"]').filter({ hasText: '' }).nth(1).click();

        const state = await readCanvasState(page);
        const card = state!.nodes.find((n) => n.id === 'card')!;
        expect(card.data!.subtasks).toEqual([]);
        expect((card.data!.tasks as unknown[]).length).toBe(2);
    });
});
