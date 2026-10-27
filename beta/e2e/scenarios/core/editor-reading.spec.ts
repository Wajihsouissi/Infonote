import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { openCanvas, nodeById } from '../../support/canvas';
import { seedCanvasState, waitForCanvasState, type CanvasStateNode } from '../../support/canvasState';

const editor = '[data-chnk-it-block-editor]';
// These content-heavy continuity checks retain raw card screenshots. Full DOM
// tracing can dominate Firefox action time; production timings use their own runner.
test.use({ trace: 'off' });
const block = (id: string, type = 'text', content = `Evidence ${id}`, indent = 0) => ({ id, type, content, indent });
const rows = Array.from({ length: 28 }, (_, r) => Array.from({ length: 10 }, (_, c) => `Evidence ${r}:${c}`));
const content = [
    block('heading', 'heading2', 'Investment research'),
    block('number-1', 'numbered'), block('number-2', 'numbered'),
    block('break'), block('restart', 'numbered'),
    block('toggle', 'toggle', 'Supporting evidence'), block('nested', 'text', 'Nested **formatted** evidence', 1),
    { ...block('table', 'table', ''), metadata: { rows, tableRowsVersion: 1, columnWidths: Array(10).fill(140) } },
    ...Array.from({ length: 64 }, (_, i) => block(`paragraph-${i}`, 'text', `Paragraph ${i}: **research evidence** with enough content to preserve the real wrapping and document layout across editing ownership changes.`)),
    block('last', 'text', 'FINAL DOCUMENT EVIDENCE'),
];
const note = (id: string, x: number, blocks = content): CanvasStateNode => ({
    id, type: 'note', position: { x, y: 100 }, style: { width: 560, height: 500 },
    data: { label: id, viewMode: 'expanded', content: blocks },
});

async function setup(page: Page) {
    await openCanvas(page);
    await seedCanvasState(page, [note('reading-a', 100), note('reading-b', 760, [block('other')])]);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: ['reading-a'] } })));
    await page.waitForTimeout(900);
    const card = nodeById(page, 'reading-a');
    await expect(card).toBeVisible();
    return { card, scroll: card.locator('.infonote-scrollable').first() };
}

async function selectThenEdit(page: Page, card: Locator, target: Locator, position = { x: 30, y: 10 }) {
    const box = await target.boundingBox();
    if (!box) throw new Error('Reading target was not measured');
    const x = box.x + position.x, y = box.y + position.y;
    await page.mouse.click(x, y); // First click selects; it cannot edit content.
    await expect(card.locator(editor)).toBeVisible();
    await page.mouse.click(x, y); // The same content position is now interactive.
}

async function selectHeader(card: Locator) {
    await card.click({ position: { x: 4, y: 4 } });
}

async function scrollReadingTargetIntoView(page: Page, _card: Locator, target: Locator) {
    for (let attempt = 0; attempt < 4; attempt++) {
        const revealed = await target.evaluate(el => {
            const scroll = el.closest<HTMLElement>('.infonote-scrollable')!;
            const viewport = scroll.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            if (box.top >= viewport.top && box.bottom <= viewport.bottom) return true;
            const scale = viewport.width / scroll.offsetWidth;
            scroll.scrollTop += (box.top - viewport.top) / scale - scroll.clientHeight / 3;
            return false;
        });
        if (revealed) return;
        // Fixture positioning is separate from the real wheel-routing check.
        // Native scrollIntoView may complete before skipped text is revealed.
        await page.waitForTimeout(150);
    }
    throw new Error('Card scroll setup did not reveal the requested reading block');
}

async function deselect(page: Page) {
    // Deterministic ownership change for layout comparisons; text interactions
    // below always use real unforced browser pointer/keyboard input.
    await page.evaluate(() => {
        const app = (window as unknown as { __appStore: { getState: () => { setSelectedCanvasNodeIds: (ids: Set<string>) => void } } }).__appStore;
        app.getState().setSelectedCanvasNodeIds(new Set());
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
}

async function geometry(card: Locator) {
    return card.evaluate(root => {
        const scroll = root.querySelector<HTMLElement>('.infonote-scrollable')!;
        const scale = root.getBoundingClientRect().width / (root as HTMLElement).offsetWidth;
        const origin = scroll.getBoundingClientRect();
        return {
            scrollTop: scroll.scrollTop, scrollHeight: scroll.scrollHeight,
            blocks: Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]')).map(el => {
                const box = el.getBoundingClientRect();
                const surface = el.querySelector<HTMLElement>('[data-reader-text], [contenteditable="true"]');
                const text = surface?.getBoundingClientRect();
                return { id: el.dataset.blockId, x: (box.x - origin.x) / scale,
                    y: (box.y - origin.y) / scale + scroll.scrollTop,
                    width: box.width / scale, height: box.height / scale,
                    textX: text ? (text.x - origin.x) / scale : 0,
                    textY: text ? (text.y - origin.y) / scale + scroll.scrollTop : 0,
                    textWidth: text ? text.width / scale : 0, textHeight: text ? text.height / scale : 0 };
            }),
        };
    });
}

test.describe('core: expanded reading and editing continuity', () => {
    test('empty cards and cells preserve placeholders and accept their first input', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, [note('empty-reading', 100, [])]);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: ['empty-reading'] } })));
        const card = nodeById(page, 'empty-reading');
        await expect(card.locator(editor)).toBeVisible();
        const active = await geometry(card);
        await deselect(page);
        const reading = card.locator('[data-reader-text]').first();
        await expect(reading).toHaveAttribute('data-placeholder', "Type '/' for commands");
        const passive = await geometry(card);
        for (const key of ['textX', 'textY', 'textWidth', 'textHeight'] as const) {
            expect(Math.abs(active.blocks[0][key] - passive.blocks[0][key]), key).toBeLessThan(1.1);
        }
        await selectThenEdit(page, card, reading);
        await page.keyboard.type('First blank-card input', { delay: 8 });
        await expect(card.locator('[contenteditable="true"]').first()).toContainText('First blank-card input');
        await deselect(page);
        await expect(card).toContainText('First blank-card input');

        await seedCanvasState(page, [note('empty-table', 100, [{ ...block('blank-table', 'table', ''), metadata: { rows: [['', 'Header'], ['', '']], tableRowsVersion: 1, columnWidths: [140, 140] } }])]);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: ['empty-table'] } })));
        const table = nodeById(page, 'empty-table');
        await expect(table.locator(editor)).toBeVisible();
        await deselect(page);
        await expect(table.locator('[data-table-row="0"][data-table-column="0"]')).toHaveAttribute('data-placeholder', 'Header');
        const cell = table.locator('[data-table-row="1"][data-table-column="0"]');
        await expect(cell).not.toHaveAttribute('data-placeholder', /.+/);
        await selectThenEdit(page, table, cell);
        await page.keyboard.type('First cell input', { delay: 8 });
        await expect(table.locator('[data-table-row="1"][data-table-column="0"][contenteditable="true"]')).toContainText('First cell input');
    });

    test('inactive content is complete and shares active text, list, and table geometry', async ({ page }, testInfo) => {
        const { card, scroll } = await setup(page);
        await deselect(page);
        await expect(card.locator(editor)).toHaveCount(0);
        await expect(card.getByText('FINAL DOCUMENT EVIDENCE', { exact: true })).toHaveCount(1);
        await expect(card.locator('table tr')).toHaveCount(28);
        await expect(card.locator('thead th')).toHaveCount(10);
        await expect(card.locator('[data-block-id="restart"]')).toContainText('1.');
        const passive = await geometry(card);
        await selectHeader(card);
        await expect(card.locator(editor)).toHaveCount(1);
        const active = await geometry(card);
        expect(active.blocks.map(b => b.id)).toEqual(passive.blocks.map(b => b.id));
        for (const [i, b] of active.blocks.entries()) {
            for (const key of ['x', 'y', 'width', 'height', 'textX', 'textY', 'textWidth', 'textHeight'] as const) {
                expect(Math.abs(b[key] - passive.blocks[i][key]), `${b.id} ${key}`).toBeLessThan(1.1);
            }
        }
        expect(Math.abs(active.scrollHeight - passive.scrollHeight)).toBeLessThan(2);
        for (const [name, position] of [['top', 0], ['middle', 1600], ['bottom', 1e6]] as const) {
            await scroll.evaluate((el, top) => { el.scrollTop = top; }, position);
            const before = await geometry(card);
            await testInfo.attach(`${name}-active`, { body: await card.screenshot({ path: testInfo.outputPath(`${name}-active.png`) }), contentType: 'image/png' });
            await deselect(page);
            await expect(card.locator(editor)).toHaveCount(0);
            const after = await geometry(card);
            expect(after.scrollTop).toBe(before.scrollTop);
            await testInfo.attach(`${name}-reading`, { body: await card.screenshot({ path: testInfo.outputPath(`${name}-reading.png`) }), contentType: 'image/png' });
            await selectHeader(card);
            await expect(card.locator(editor)).toHaveCount(1);
        }
    });

    test('selection then editing preserves the scrolled paragraph, first input and anchor', async ({ page }) => {
        const { card, scroll } = await setup(page);
        await deselect(page);
        const target = card.locator('[data-block-id="paragraph-40"] [data-reader-text]');
        await scrollReadingTargetIntoView(page, card, target);
        const before = await scroll.evaluate(el => el.scrollTop);
        const box = await target.boundingBox();
        await selectThenEdit(page, card, target);
        await expect(card.locator('[data-block-id="paragraph-40"] [contenteditable="true"]')).toBeFocused();
        await page.keyboard.type('VERIFIED-FIRST-INPUT ', { delay: 8 });
        await expect(card.locator('[data-block-id="paragraph-40"]')).toContainText('VERIFIED-FIRST-INPUT');
        expect(await scroll.evaluate(el => el.scrollTop)).toBe(before);
        const after = await card.locator('[data-block-id="paragraph-40"] [contenteditable="true"]').boundingBox();
        expect(Math.abs(after!.y - box!.y)).toBeLessThan(1.1);
        await deselect(page);
        await expect(card.locator(editor)).toHaveCount(0);
        await expect(card.locator('[data-block-id="paragraph-40"]')).toContainText('VERIFIED-FIRST-INPUT');
        expect(await scroll.evaluate(el => el.scrollTop)).toBe(before);
        await waitForCanvasState(page, state => (JSON.stringify(state.nodes.find(n => n.id === 'reading-a')?.data?.content) ?? '').includes('VERIFIED-FIRST-INPUT'));
        await page.waitForTimeout(1800);
        await page.reload();
        await waitForCanvasState(page, state => (JSON.stringify(state.nodes.find(n => n.id === 'reading-a')?.data?.content) ?? '').includes('VERIFIED-FIRST-INPUT'));
    });

    test('horizontal table position and cell editing survive selection changes', async ({ page }) => {
        const { card } = await setup(page);
        await deselect(page);
        const tableScroll = card.locator('[data-table-scroll]');
        await tableScroll.scrollIntoViewIfNeeded();
        await tableScroll.evaluate(el => { el.scrollLeft = 1000; });
        const left = await tableScroll.evaluate(el => el.scrollLeft);
        const cell = card.locator('[data-table-row="5"][data-table-column="9"]');
        await cell.scrollIntoViewIfNeeded();
        const beforeLeft = await tableScroll.evaluate(el => el.scrollLeft);
        expect(left).toBeGreaterThan(0);
        await selectThenEdit(page, card, cell, { x: 20, y: 12 });
        await expect(card.locator('[data-table-row="5"][data-table-column="9"]')).toBeFocused();
        await page.keyboard.type('CELL-FIRST ', { delay: 8 });
        await expect(card.locator('[data-table-row="5"][data-table-column="9"]')).toContainText('CELL-FIRST');
        expect(await tableScroll.evaluate(el => el.scrollLeft)).toBe(beforeLeft);
        await deselect(page);
        await expect(card.locator(editor)).toHaveCount(0);
        await expect(card.locator('[data-table-row="5"][data-table-column="9"]')).toContainText('CELL-FIRST');
        expect(await tableScroll.evaluate(el => el.scrollLeft)).toBe(beforeLeft);
    });

    test('passive wheel reading stays available; selection enables controls and text selection', async ({ page }) => {
        const { card, scroll } = await setup(page);
        await deselect(page);
        const beforeWheel = await scroll.evaluate(el => el.scrollTop);
        await card.locator('.interaction-overlay').hover();
        await page.mouse.wheel(0, 700);
        await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(beforeWheel);
        await expect(card.locator(editor)).toHaveCount(0);
        await scroll.evaluate(el => { el.scrollTop = 0; });
        await selectHeader(card);
        await expect(card.locator(editor)).toBeVisible();
        await card.getByRole('button', { name: 'Collapse toggle' }).click();
        await expect(card.locator('[data-block-id="nested"]')).toHaveCount(0);
        await card.getByRole('button', { name: 'Expand toggle' }).click();
        await expect(card.locator('[data-block-id="nested"]')).toBeVisible();
        const text = card.locator('[data-block-id="paragraph-20"] [contenteditable="true"]');
        await text.scrollIntoViewIfNeeded();
        const box = await text.boundingBox();
        const camera = await page.locator('.react-flow__viewport').getAttribute('style');
        await page.mouse.move(box!.x + 10, box!.y + 10); await page.mouse.down();
        try { await page.mouse.move(box!.x + 150, box!.y + 10, { steps: 8 }); } finally { await page.mouse.up(); }
        await expect.poll(() => page.evaluate(() => getSelection()?.toString())).not.toBe('');
        expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(camera);
    });

    test('real A to B to A clicks preserve both drafts and the first card scroll', async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        const { card, scroll } = await setup(page);
        await deselect(page);
        const target = card.locator('[data-block-id="paragraph-40"] [data-reader-text]');
        await scrollReadingTargetIntoView(page, card, target);
        const before = await target.boundingBox();
        const top = await scroll.evaluate(el => el.scrollTop);
        await selectThenEdit(page, card, target, { x: 20, y: 10 });
        await page.keyboard.type('CARD-A-DRAFT ', { delay: 8 });
        const other = nodeById(page, 'reading-b');
        await selectThenEdit(page, other, other.locator('[data-reader-text]'), { x: 20, y: 10 });
        await page.keyboard.type('CARD-B-DRAFT ', { delay: 8 });
        await expect(card.locator(editor)).toHaveCount(0);
        await expect(other.locator(editor)).toHaveCount(1);
        await selectThenEdit(page, card, card.locator('[data-block-id="paragraph-40"] [data-reader-text]'), { x: 20, y: 10 });
        await expect(card.locator(editor)).toHaveCount(1);
        await expect(other.locator(editor)).toHaveCount(0);
        await expect(card.locator('[data-block-id="paragraph-40"]')).toContainText('CARD-A-DRAFT');
        await expect(other.locator('[data-block-id="other"]')).toContainText('CARD-B-DRAFT');
        expect(await scroll.evaluate(el => el.scrollTop)).toBe(top);
        const after = await card.locator('[data-block-id="paragraph-40"] [contenteditable="true"]').boundingBox();
        expect(Math.abs(after!.y - before!.y)).toBeLessThan(1.1);
    });

    test('a long contained document retains its visible anchor through repeated handoffs', async ({ page }) => {
        await openCanvas(page);
        const long = Array.from({ length: 500 }, (_, i) => block(`long-${i}`, 'text', `Evidence ${i}: **متابعة البحث** — detailed multilingual research content. `.repeat(2 + i % 4)));
        await seedCanvasState(page, [note('long-reader', 100, long)]);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: ['long-reader'] } })));
        await page.waitForTimeout(900);
        const card = nodeById(page, 'long-reader');
        await deselect(page);
        const target = card.locator('[data-block-id="long-340"] [data-reader-text]');
        await scrollReadingTargetIntoView(page, card, target);
        await page.waitForTimeout(100);
        const before = await target.boundingBox();
        const position = () => card.evaluate(root => {
            const scroll = root.querySelector<HTMLElement>('.infonote-scrollable')!;
            const anchor = root.querySelector<HTMLElement>('[data-block-id="long-340"]')!;
            return { top: scroll.scrollTop, height: scroll.scrollHeight, y: anchor.getBoundingClientRect().y };
        });
        const initial = await position();
        await selectThenEdit(page, card, target, { x: 25, y: 12 });
        await page.keyboard.type('LONG-FIRST ', { delay: 8 });
        await expect(card.locator('[data-block-id="long-340"]')).toContainText('LONG-FIRST');
        const typed = await position();
        expect(Math.abs(typed.y - initial.y)).toBeLessThan(1.1);
        for (let i = 0; i < 3; i++) {
            await deselect(page);
            await expect(card.locator(editor)).toHaveCount(0);
            const reading = await card.locator('[data-block-id="long-340"] [data-reader-text]').boundingBox();
            if (Math.abs(reading!.y - before!.y) >= 1.1) console.log(JSON.stringify({ initial, typed, reading: await position() }));
            expect(Math.abs(reading!.y - before!.y)).toBeLessThan(1.1);
            await selectHeader(card);
            await expect(card.locator(editor)).toHaveCount(1);
            const editing = await card.locator('[data-block-id="long-340"] [contenteditable="true"]').boundingBox();
            expect(Math.abs(editing!.y - before!.y)).toBeLessThan(1.1);
        }
    });

    for (const kind of ['heading', 'table'] as const) test(`${kind} composition retains its editing host through demotion and publishes confirmation`, async ({ page }) => {
        const { card } = await setup(page);
        await deselect(page);
        const destination = kind === 'heading' ? '[data-block-id="heading"]' : '[data-table-row="0"][data-table-column="0"]';
        const reading = kind === 'heading' ? card.locator(`${destination} [data-reader-text]`) : card.locator(`${destination}[data-reader-text]`);
        await scrollReadingTargetIntoView(page, card, reading);
        await selectThenEdit(page, card, reading);
        const host = kind === 'heading' ? card.locator(`${destination} [contenteditable="true"]`) : card.locator(`${destination}[contenteditable="true"]`);
        await host.dispatchEvent('compositionstart', { data: '' });
        await host.evaluate(el => { el.textContent += ' COMPOSITION-CONFIRMED'; });
        await deselect(page);
        await expect(card.locator(editor)).toHaveCount(1);
        await host.dispatchEvent('compositionend', { data: ' COMPOSITION-CONFIRMED' });
        await expect(card.locator(editor)).toHaveCount(0);
        await expect(card.locator(destination)).toContainText('COMPOSITION-CONFIRMED');
        await waitForCanvasState(page, state => (JSON.stringify(state.nodes.find(n => n.id === 'reading-a')?.data?.content) ?? '').includes('COMPOSITION-CONFIRMED'));
    });
});
