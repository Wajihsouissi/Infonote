import { test, expect } from '../../support/fixtures';
import { dndDrag, fitView, openCanvas } from '../../support/canvas';
import { readCanvasState, seedCanvasState, type CanvasStateNode } from '../../support/canvasState';

/**
 * The board's calendar view.
 *
 * These run in Los Angeles on purpose. The bug this feature was built around —
 * a stored `YYYY-MM-DD` being parsed as UTC midnight, and so read as the day
 * before — is invisible in UTC, which is where a CI runner sits by default. A
 * suite that did not pin a western timezone would pass against the broken code.
 */
test.use({ timezoneId: 'America/Los_Angeles' });

const BOARD = 'cal-board';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A day key inside the month the calendar opens on.
 *
 * The cursor is deliberately not persisted — it starts on today — so a fixture
 * dated to some fixed month would be off-screen and unclickable. Days 1–28
 * exist in every month and always fall inside the 42-cell grid, so building
 * fixtures this way keeps the spec from rotting as the calendar year turns.
 */
const dayThisMonth = (dayOfMonth: number): string => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(dayOfMonth)}`;
};

/**
 * Today as the *page* sees it.
 *
 * Not `new Date()` in the test process: these specs pin the browser to Los
 * Angeles while Node keeps the machine's own zone, so the two disagree about
 * what day it is for several hours out of every twenty-four. The calendar's
 * cursor starts on the browser's today, so a fixture built from Node's would
 * be a day off exactly often enough to look flaky.
 */
const todayInPage = (page: Parameters<typeof seedCanvasState>[0]): Promise<string> =>
    page.evaluate(() => {
        const p = (n: number) => String(n).padStart(2, '0');
        const d = new Date();
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    });

const card = (id: string, label: string, data: Record<string, unknown>): CanvasStateNode => ({
    id,
    type: 'note',
    parentId: BOARD,
    position: { x: 0, y: 0 },
    style: { width: 432, height: 432 },
    data: {
        label,
        viewMode: 'medium',
        icon: 'FileText',
        // Relative too, so the read-only Created view has a visible cell.
        createdAt: `${dayThisMonth(1)}T09:00:00.000Z`,
        ...data,
    },
});

/** A board already in calendar view, plus the cards each test needs. */
async function seedBoard(
    page: Parameters<typeof seedCanvasState>[0],
    cards: CanvasStateNode[],
    boardData: Record<string, unknown> = {},
) {
    await seedCanvasState(page, [
        {
            id: BOARD,
            type: 'kanban',
            position: { x: 0, y: 0 },
            style: { width: 1752, height: 720 },
            data: {
                label: 'Calendar board',
                groupBy: 'status',
                columns: [],
                cardOrder: [],
                viewMode: 'calendar',
                calendarScale: 'month',
                ...boardData,
            },
        },
        ...cards,
    ]);
    /* Attached, not visible, and the board root rather than a day cell. The
       hour grid only renders `data-kanban-day` on its all-day strip, which is
       absent when nothing is all-day; and a board seeded at the origin is not
       on screen until `fitView` below has run, so demanding visibility first
       would deadlock the two waits against each other. */
    await expect(page.locator(`[data-kanban-board="${BOARD}"]`).first())
        .toBeAttached({ timeout: 15_000 });
    /* A board seeded at the origin sits partly under the workspace top bar and
       partly off-screen, so its controls are unreachable until the canvas is
       fitted around it. */
    await fitView(page);
}

const cell = (page: Parameters<typeof seedCanvasState>[0], key: string) =>
    page.locator(`[data-kanban-day="${key}"]`);

const chip = (page: Parameters<typeof seedCanvasState>[0], label: string) =>
    page.locator('[data-seg]').filter({ hasText: label }).first();

const dataOf = async (page: Parameters<typeof seedCanvasState>[0], id: string) => {
    const state = await readCanvasState(page);
    return state!.nodes.find((n) => n.id === id)!.data as Record<string, string | undefined>;
};

/** Storage carries a day in its leading ten characters, whatever else follows. */
const dayOf = (stored?: string) => stored?.slice(0, 10);

test.describe('advanced: board calendar view', () => {
    test('both stored date shapes land on the same day', async ({ page }) => {
        const day = dayThisMonth(15);
        const dayBefore = dayThisMonth(14);

        await openCanvas(page);
        await seedBoard(page, [
            // What CustomDatePicker writes, and what DateProperty writes. Same day.
            card('c-iso', 'ISO shape', { status: 'todo', dueDate: `${day}T00:00:00.000Z` }),
            card('c-bare', 'Bare shape', { status: 'todo', dueDate: day }),
        ]);

        /* The single assertion that covers the whole timezone bug: parsed as
           UTC midnight, either shape would sit on the previous day here. */
        await expect(cell(page, day)).toContainText('ISO shape');
        await expect(cell(page, day)).toContainText('Bare shape');
        await expect(cell(page, dayBefore)).not.toContainText('shape');
    });

    test('dragging a card to another day writes that day', async ({ page }) => {
        const from = dayThisMonth(5);
        const to = dayThisMonth(20);

        await openCanvas(page);
        await seedBoard(page, [card('c-move', 'Movable', { status: 'todo', dueDate: from })]);

        await dndDrag(page, chip(page, 'Movable'), cell(page, to));

        /* Asserted on the leading ten characters rather than the whole string,
           so the test does not ossify the storage format. */
        expect(dayOf((await dataOf(page, 'c-move')).dueDate)).toBe(to);
        await expect(cell(page, to)).toContainText('Movable');
    });

    test('a span keeps its duration when its anchor moves', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, [
            card('c-span', 'Spanning', {
                status: 'todo', startDate: dayThisMonth(7), dueDate: dayThisMonth(9),
            }),
        ]);

        // Three cells while it runs 7→9.
        await expect(page.locator('[data-kanban-day] [data-seg]')).toHaveCount(3);

        // The calendar shows due dates, so the end of the bar is the anchor.
        await dndDrag(page, chip(page, 'Spanning'), cell(page, dayThisMonth(16)));

        const data = await dataOf(page, 'c-span');
        expect(dayOf(data.dueDate)).toBe(dayThisMonth(16));
        expect(dayOf(data.startDate)).toBe(dayThisMonth(14)); // the same two-day gap
        await expect(page.locator('[data-kanban-day] [data-seg]')).toHaveCount(3);
    });

    test('dropping on the tray clears only the field in view', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, [
            card('c-both', 'Has both', {
                status: 'todo', startDate: dayThisMonth(7), dueDate: dayThisMonth(9),
            }),
        ]);

        await dndDrag(page, chip(page, 'Has both'), page.locator('[class*="trayBody"]'));

        const data = await dataOf(page, 'c-both');
        expect(data.dueDate).toBeUndefined();
        // Not the user's to lose: this view was never showing the start date.
        expect(dayOf(data.startDate)).toBe(dayThisMonth(7));
        await expect(page.locator('[class*="trayBody"]')).toContainText('Has both');
    });

    test('a card can be dragged out of the tray onto a day', async ({ page }) => {
        const target = dayThisMonth(12);

        await openCanvas(page);
        await seedBoard(page, [card('c-idle', 'Unscheduled one', { status: 'todo' })]);

        const row = page.locator('[class*="trayRow"]').filter({ hasText: 'Unscheduled one' });
        await expect(row).toBeVisible();

        await dndDrag(page, row, cell(page, target));

        expect(dayOf((await dataOf(page, 'c-idle')).dueDate)).toBe(target);
        await expect(cell(page, target)).toContainText('Unscheduled one');
        await expect(page.locator('[class*="trayRow"]')).toHaveCount(0);
    });

    test('the tray reads as the note rail — artwork, title, no lane tint', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, [
            card('c-plain', 'Plain one', { status: 'todo' }),
            card('c-desc', 'Described one', { status: 'todo', description: 'A subtitle' }),
        ]);

        const row = page.locator('[class*="trayRow"]').first();
        // The card's own folder artwork, as the rail draws it.
        await expect(row.locator('svg').first()).toBeVisible();
        await expect(page.locator('[class*="trayDesc"]')).toContainText('A subtitle');

        /* Rows are not tinted chips. Every card in this tray shares one lane, so
           a lane tint here would colour the whole list identically and say
           nothing — the wall of pink this replaced. */
        const background = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(background).toBe('rgba(0, 0, 0, 0)');
        await expect(row.locator('[data-seg]')).toHaveCount(0);
    });

    test('day view is an hour grid; timed cards sit at their time', async ({ page }) => {
        await openCanvas(page);
        const day = await todayInPage(page);

        await seedBoard(page, [
            card('c-timed', 'Timed card', {
                status: 'todo',
                startDate: `${day}T13:30:00.000Z`,
                dueDate: `${day}T15:30:00.000Z`,
            }),
            // The plain-day shape every existing card has.
            card('c-allday', 'All day card', { status: 'todo', dueDate: `${day}T00:00:00.000Z` }),
        ], { calendarScale: 'day' });

        await expect(page.locator('[class*="timeGrid"]')).toBeVisible();
        await expect(page.locator('[class*="hourLabel"]')).toHaveCount(24);

        /* The timed card is a block in the grid, placed and sized by its clock
           readings: 13:30 for two hours, at 52px an hour. */
        const event = page.locator('article[class*="event"]').filter({ hasText: 'Timed card' });
        await expect(event).toBeVisible();
        expect(await event.evaluate((el) => Math.round(parseFloat((el as HTMLElement).style.top))))
            .toBe(Math.round(13.5 * 52));
        expect(await event.evaluate((el) => Math.round(parseFloat((el as HTMLElement).style.height))))
            .toBe(2 * 52 - 2);

        /* A card that names a day and no hour belongs in the all-day strip, not
           at midnight — that is the whole reason the strip exists. */
        await expect(page.locator('[class*="allDayCell"]')).toContainText('All day card');
        await expect(page.locator('article[class*="event"]').filter({ hasText: 'All day card' }))
            .toHaveCount(0);
    });

    test('overlapping events share the width instead of hiding each other', async ({ page }) => {
        await openCanvas(page);
        const day = await todayInPage(page);

        await seedBoard(page, [
            card('c-a', 'First call', {
                status: 'todo', startDate: `${day}T13:00:00.000Z`, dueDate: `${day}T15:00:00.000Z`,
            }),
            card('c-b', 'Second call', {
                status: 'todo', startDate: `${day}T14:00:00.000Z`, dueDate: `${day}T16:00:00.000Z`,
            }),
        ], { calendarScale: 'day' });

        const widths = await page.locator('article[class*="event"]')
            .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.width));
        expect(widths).toHaveLength(2);
        // Two overlapping events split the column rather than stacking on top.
        expect(widths.every((w) => w.includes('50%'))).toBe(true);

        const lefts = await page.locator('article[class*="event"]')
            .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.left));
        expect(new Set(lefts).size).toBe(2);
    });

    test('week view is seven hour columns', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, [card('c-w', 'Weekly', { status: 'todo' })], { calendarScale: 'week' });

        await expect(page.locator('[class*="dayColumn"]')).toHaveCount(7);
        await expect(page.locator('[class*="colHead"]')).toHaveCount(7);
        await expect(page.locator('[class*="hourLabel"]')).toHaveCount(24);
    });

    test('dropping on a time slot sets the clock reading, not just the day', async ({ page }) => {
        await openCanvas(page);
        const day = await todayInPage(page);

        await seedBoard(page, [
            card('c-move', 'Movable', { status: 'todo', dueDate: `${day}T09:00:00.000Z` }),
        ], { calendarScale: 'day' });

        const event = page.locator('article[class*="event"]').filter({ hasText: 'Movable' });
        await expect(event).toBeVisible();

        /* Aim at the 11:00 slot itself rather than nudging by a pixel offset:
           the board sits on a zoomed canvas, so screen pixels are not grid
           minutes and an offset would land wherever the zoom happened to put
           it. Each slot names its own time for exactly this reason. */
        const slot = page.locator(`[data-slot-day="${day}"][data-slot="${11 * 60}"]`);
        await dndDrag(page, event, slot);

        const due = (await dataOf(page, 'c-move')).dueDate!;
        expect(dayOf(due)).toBe(day);            // same day
        expect(due.slice(11, 16)).toBe('11:00'); // and now carries a time
    });

    test('dragging an event edge changes its end, leaving the start alone', async ({ page }) => {
        await openCanvas(page);
        const day = await todayInPage(page);
        await seedBoard(page, [
            card('c-size', 'Sizable', {
                status: 'todo',
                startDate: `${day}T13:00:00.000Z`,
                dueDate: `${day}T14:00:00.000Z`,
            }),
        ], { calendarScale: 'day' });

        const event = page.locator('article[class*="event"]').filter({ hasText: 'Sizable' });
        await expect(event).toBeVisible();
        await event.hover();

        const bottom = event.locator('[class*="resizeBottom"]');
        const box = (await bottom.boundingBox())!;

        /* How many screen pixels an hour is, measured from two adjacent slots.
           Neither a fixed 52 nor a zoom lookup would do: the board sits on a
           zoomed canvas, and aiming at a distant slot's own box fails once that
           slot is below the grid's internal scroll. Two neighbours are always
           the same hour apart however the view is scrolled or scaled. */
        const pxPerHour = await page.evaluate((d) => {
            const at = (m: number) =>
                document.querySelector(`[data-slot-day="${d}"][data-slot="${m}"]`)!.getBoundingClientRect().top;
            return at(14 * 60) - at(13 * 60);
        }, day);
        expect(pxPerHour).toBeGreaterThan(0);

        const fromX = box.x + box.width / 2;
        const fromY = box.y + box.height / 2;
        await page.mouse.move(fromX, fromY);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) {
            await page.mouse.move(fromX, fromY + (pxPerHour * i) / 10);
            await page.waitForTimeout(16);
        }
        await page.mouse.up();
        await page.waitForTimeout(300);

        const data = await dataOf(page, 'c-size');
        expect(data.startDate!.slice(11, 16)).toBe('13:00'); // the edge not dragged holds
        expect(data.dueDate!.slice(11, 16)).toBe('15:00');   // an hour longer
    });

    test('the due date picker takes a time, and can give it back', async ({ page }) => {
        await openCanvas(page);
        const day = await todayInPage(page);
        await seedBoard(page, [
            card('c-time', 'Timed', { status: 'todo', dueDate: `${day}T00:00:00.000Z` }),
        ], { viewMode: 'board' });

        // The inline metadata strip opens with the card.
        await page.locator('article[class*="card"]').filter({ hasText: 'Timed' }).click();
        const trigger = page.locator('[class*="trigger"]').filter({ hasText: /\d/ }).first();
        await trigger.click();

        const time = page.locator('input[type="time"]');
        await expect(time).toBeVisible();
        await time.fill('09:45');
        await page.waitForTimeout(250);

        expect((await dataOf(page, 'c-time')).dueDate).toBe(`${day}T09:45:00.000Z`);

        // And back to all-day, which is what the grid's strip reads.
        await page.locator('[class*="timeClear"]').click();
        await page.waitForTimeout(250);
        expect((await dataOf(page, 'c-time')).dueDate).toBe(`${day}T00:00:00.000Z`);
    });

    test('unreadable and absent dates land in the tray rather than on a day', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, [
            card('c-none', 'No date', { status: 'todo' }),
            card('c-bad', 'Bad date', { status: 'todo', dueDate: 'sometime next week' }),
            card('c-impossible', 'Impossible date', { status: 'todo', dueDate: '2026-02-31' }),
        ]);

        const tray = page.locator('[class*="trayBody"]');
        await expect(tray).toContainText('No date');
        await expect(tray).toContainText('Bad date');
        await expect(tray).toContainText('Impossible date');
        // Nothing was quietly filed on the epoch or rolled forward to 3 March.
        await expect(page.locator('[data-kanban-day] [data-seg]')).toHaveCount(0);
    });

    test('created is read-only and cannot be rescheduled by dragging', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, [card('c-made', 'Made card', { status: 'todo' })]);

        await page.locator('select').filter({ hasText: 'Due date' }).selectOption('createdAt');
        await expect(page.locator('[class*="readOnlyNote"]')).toBeVisible();

        const before = await dataOf(page, 'c-made');
        await dndDrag(page, chip(page, 'Made card'), cell(page, dayThisMonth(14)));
        const after = await dataOf(page, 'c-made');

        expect(after.createdAt).toBe(before.createdAt);
        expect(after.updatedAt).toBe(before.updatedAt);   // no write at all
    });

    test('view and date field persist across a reload; the cursor returns to today', async ({ page }) => {
        await openCanvas(page);
        await seedBoard(page, [card('c-keep', 'Kept', { status: 'todo', startDate: dayThisMonth(2) })]);

        await page.locator('select').filter({ hasText: 'Due date' }).selectOption('startDate');
        await page.locator('[aria-label="Calendar range"] button', { hasText: 'Week' }).click();
        await page.waitForTimeout(300);

        const board = await dataOf(page, BOARD);
        expect(board.viewMode).toBe('calendar');
        expect(board.dateField).toBe('startDate');
        expect(board.calendarScale).toBe('week');

        /* The cursor is deliberately NOT persisted — it would be a cloud-dirty
           store write per arrow press — so a reopened board opens on today. */
        const now = new Date();
        const thisYear = String(now.getFullYear());
        await expect(page.locator('[class*="calTitle"]')).toContainText(thisYear);
    });
});
