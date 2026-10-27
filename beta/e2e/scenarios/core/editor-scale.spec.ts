import type { Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { openCanvas, selectNode, focusNode, clickEmptyCanvas, nodeById, waitForLocalSave } from '../../support/canvas';
import { seedCanvasState, waitForCanvasState, type CanvasStateNode } from '../../support/canvasState';

const editor = '[data-chnk-it-block-editor]';
const text = (id: string) => ({ id, type: 'text', content: `Research evidence ${id}` });
const note = (id: string, x = 100, y = 100): CanvasStateNode => ({
    id, type: 'note', position: { x, y }, style: { width: 432, height: 260 },
    data: { label: id, viewMode: 'expanded', content: [text(`${id}-text`)] },
});
const zoom = (page: Page) => page.locator('.react-flow__viewport').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
async function zoomNear(page: Page, target: number) {
    const current = await zoom(page);
    if (Math.abs(current - target) < .025) return;
    const increasing = current < target;
    const key = increasing ? '+' : '-';
    await page.keyboard.down(key);
    try {
        // Observe the camera; headed frame rate is not guaranteed to be 60Hz.
        await page.waitForFunction(({ target, increasing }) => {
            const viewport = document.querySelector('.react-flow__viewport');
            if (!viewport) return false;
            const value = new DOMMatrix(getComputedStyle(viewport).transform).a;
            return increasing ? value >= target * .99 : value <= target * 1.01;
        }, { target, increasing }, { polling: 'raf', timeout: 15000 });
    } finally { await page.keyboard.up(key); }
    await page.waitForTimeout(220);
    expect(Math.abs(await zoom(page) - target)).toBeLessThan(Math.max(.04, target * .06));
}

test.describe('core: heavy editor rendering contracts', () => {
    test('the final typed space inside a table cell persists exactly after reload', async ({ page }) => {
        await openCanvas(page);
        const seeded = note('spacing');
        seeded.data = { ...seeded.data, content: [{ id: 'spacing-table', type: 'table', content: '', metadata: {
            rows: [['Heading'], ['Accelerators / scenario 1']], tableRowsVersion: 1, columnWidths: [280],
        } }] };
        await seedCanvasState(page, [seeded]);
        const card = nodeById(page, 'spacing');
        await focusNode(page, card);
        await selectNode(card);
        const cell = card.locator('[data-table-row="1"][data-table-column="0"][contenteditable="true"]');
        await cell.click();
        await cell.evaluate(el => {
            const text = el.firstChild!;
            const range = document.createRange(); range.setStart(text, text.textContent!.indexOf('scenario')); range.collapse(true);
            const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        });
        const marker = ' Verified production: reconcile evidence, risks and assumptions before the next research review. ';
        await page.keyboard.type(marker, { delay: 8 });
        const expected = await cell.textContent();
        expect(expected).toContain(marker);
        const matches = (state: { nodes: CanvasStateNode[] }) => {
            const blocks = state.nodes.find(n => n.id === 'spacing')?.data?.content as Array<{ metadata?: { rows?: string[][] } }> | undefined;
            return blocks?.[0]?.metadata?.rows?.[1]?.[0] === expected;
        };
        await waitForCanvasState(page, matches);
        await waitForLocalSave(page);
        await page.reload();
        await waitForCanvasState(page, matches);
        await expect(nodeById(page, 'spacing').locator('[data-table-row="1"][data-table-column="0"]')).toHaveText(expected!);
    });

    test('inactive block and fused nodes stay passive; selected edits persist after demotion', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, Array.from({ length: 24 }, (_, i) => ({
            id: `map-${i}`, type: i % 2 ? 'fused-note' : 'block',
            position: { x: 100 + i % 6 * 300, y: 100 + Math.floor(i / 6) * 300 },
            style: { width: 260, height: 208 }, data: { content: [text(`source-${i}`)] },
        })));
        await page.keyboard.press('5');
        await expect(page.locator(editor)).toHaveCount(0);
        const card = nodeById(page, 'map-1');
        await focusNode(page, card);
        await selectNode(card);
        await expect(page.locator(editor)).toHaveCount(1);
        await card.locator('[contenteditable="true"]').first().click();
        await page.keyboard.type(' Verified map owner');
        await page.keyboard.press('Escape');
        await clickEmptyCanvas(page);
        await expect(page.locator(editor)).toHaveCount(0);
        await waitForCanvasState(page, s => (JSON.stringify(s.nodes.find(n => n.id === 'map-1')?.data?.content) || '').includes('Verified map owner'));
        await page.reload();
        await waitForCanvasState(page, s => (JSON.stringify(s.nodes.find(n => n.id === 'map-1')?.data?.content) || '').includes('Verified map owner'));
    });

    test('foreground fullscreen editing has one document owner and returns to the canvas', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, [note('foreground'), note('other', 650)]);
        const card = nodeById(page, 'foreground');
        await focusNode(page, card);
        await selectNode(card);
        await expect(card.locator(editor)).toHaveCount(1);
        await card.hover();
        await card.getByTitle('Full Screen', { exact: true }).click();
        await expect(card.locator(editor)).toHaveCount(0);
        await expect(page.locator(editor)).toHaveCount(1);
        await page.locator(editor).locator('[contenteditable="true"]').first().click();
        await page.keyboard.type(' Foreground saved');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(card).toBeVisible();
        await waitForCanvasState(page, s => (JSON.stringify(s.nodes.find(n => n.id === 'foreground')?.data?.content) || '').includes('Foreground saved'));
    });

    test('cover header remains clickable across zoom levels without a forced click', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, [note('cover-target')]);
        const card = nodeById(page, 'cover-target');
        await focusNode(page, card);
        await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
        for (const target of [.3, .5, 1, 2]) {
            const rect = await card.boundingBox();
            await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
            await zoomNear(page, target);
            await card.hover();
            await card.getByRole('button', { name: 'Add cover', exact: true }).click();
            await expect(page.getByRole('dialog', { name: 'Card cover' })).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(page.getByRole('dialog', { name: 'Card cover' })).toBeHidden();
        }
    });

    test('fit includes a long canvas and overview retains no live editors', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, [note('first'), note('last', 4000, 13000)]);
        // Population after empty hydration must frame authoritative bounds
        // without relying on React Flow's independent on-load fit.
        await expect.poll(() => zoom(page)).toBeLessThan(.1);
        await page.keyboard.press('5');
        await expect.poll(() => zoom(page)).toBeLessThan(.1);
        await expect(page.locator(editor)).toHaveCount(0);
        await page.waitForTimeout(500); // fit camera animation
        const pane = await page.locator('.react-flow__pane').boundingBox();
        for (const id of ['first', 'last']) {
            const box = await nodeById(page, id).boundingBox();
            expect(box!.y).toBeGreaterThanOrEqual(pane!.y - 2);
            expect(box!.y + box!.height).toBeLessThanOrEqual(pane!.y + pane!.height + 2);
        }
    });

    test('focus restores a culled expanded card and persists its edits', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, [note('near'), note('distant', 40000, 30000)]);
        // The same command is used by search and outline navigation. It must
        // move the camera even when React Flow has no rendered target node.
        const focus = (id: string) => page.evaluate(id => window.dispatchEvent(new CustomEvent('focusCanvasNodes', {
            detail: { ids: [id], duration: 0 },
        })), id);
        await focus('near');
        await expect(nodeById(page, 'near').locator(editor)).toHaveCount(1);
        await expect(nodeById(page, 'distant')).toHaveCount(0);
        await focus('distant');
        const distant = nodeById(page, 'distant');
        await expect(distant).toBeVisible();
        await expect(distant.locator(editor)).toHaveCount(1);
        await expect(page.locator(editor)).toHaveCount(1);
        const box = await distant.boundingBox();
        const pane = await page.locator('.react-flow__pane').boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(pane!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(pane!.x + pane!.width);
        await distant.locator('[contenteditable="true"]').first().fill('Saved after focusing a culled card');
        await page.keyboard.press('Escape');
        await focus('near');
        await waitForCanvasState(page, s => (JSON.stringify(s.nodes.find(n => n.id === 'distant')?.data?.content) ?? '').includes('Saved after focusing a culled card'));
        await page.reload();
        await waitForCanvasState(page, s => (JSON.stringify(s.nodes.find(n => n.id === 'distant')?.data?.content) ?? '').includes('Saved after focusing a culled card'));
    });

    test('generated-map resize observation does not override focused expanded cards', async ({ page }) => {
        await openCanvas(page);
        const parent = note('parent');
        await seedCanvasState(page, [{ ...parent, data: { ...parent.data, hasNestedCanvasSync: true } },
            { ...note('chapter', 0, 0), type: 'fused-note', parentId: 'parent', data: {
                label: 'Chapter', mapRole: 'chapter', content: [text('chapter-text')],
            } },
            { ...note('far-leaf', 40000, 30000), type: 'block', parentId: 'parent' },
        ]);
        const focus = (id: string) => page.evaluate(id => window.dispatchEvent(new CustomEvent('focusCanvasNodes', {
            detail: { ids: [id], duration: 0 },
        })), id);
        await focus('parent');
        await nodeById(page, 'parent').hover();
        await nodeById(page, 'parent').getByTitle('Open Card', { exact: true }).click();
        await expect(nodeById(page, 'chapter')).toBeAttached();
        await expect.poll(() => zoom(page)).toBeLessThan(.1);
        await page.waitForTimeout(600); // complete the automatic entry fit
        for (const id of ['far-leaf', 'chapter', 'far-leaf']) {
            await focus(id);
            const card = nodeById(page, id);
            await expect(card.locator(editor)).toHaveCount(1);
            // Re-observing a revealed chapter must not schedule another fit.
            await page.waitForTimeout(400);
            await expect.poll(() => zoom(page)).toBeGreaterThan(.5);
            await expect(page.locator(editor)).toHaveCount(1);
        }
        await focus('chapter');
        await expect(nodeById(page, 'chapter').locator(editor)).toHaveCount(1);
        await page.waitForTimeout(400);
        await page.setViewportSize({ width: 1100, height: 720 });
        await expect.poll(() => zoom(page)).toBeLessThan(.1);
        await expect(page.locator(editor)).toHaveCount(0);
    });

    test('new focus supersedes queued home navigation and ordinary return still frames its card', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, [note('return-parent'), note('next-target', 40000, 30000),
            { ...note('inside', 0, 0), parentId: 'return-parent' },
        ]);
        const focus = (id: string) => page.evaluate(id => window.dispatchEvent(new CustomEvent('focusCanvasNodes', {
            detail: { ids: [id], duration: 0 },
        })), id);
        const enter = async () => {
            await focus('return-parent');
            const parent = nodeById(page, 'return-parent');
            await parent.hover();
            await parent.getByTitle('Open Card', { exact: true }).click();
            await expect(nodeById(page, 'inside')).toBeVisible();
        };
        await enter();
        await page.getByRole('button', { name: 'Canvas home', exact: true }).click();
        await expect(nodeById(page, 'return-parent')).toBeAttached();
        await focus('next-target');
        const target = nodeById(page, 'next-target');
        await expect(target.locator(editor)).toHaveCount(1);
        await page.waitForTimeout(800); // outlast the former 500ms return animation
        await expect(target.locator(editor)).toHaveCount(1);
        const box = await target.boundingBox();
        const pane = await page.locator('.react-flow__pane').boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(pane!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(pane!.x + pane!.width);
        await enter();
        const inside = nodeById(page, 'inside');
        await inside.hover();
        await inside.getByTitle('Open Card', { exact: true }).click();
        await expect(page.getByRole('button', { name: 'inside', exact: true })).toBeDisabled();
        await expect(page.locator('.react-flow__node')).toHaveCount(1);
        await page.getByRole('button', { name: 'Canvas home', exact: true }).click();
        await expect(nodeById(page, 'return-parent')).toBeVisible();
        await page.waitForTimeout(800);
        await expect.poll(() => zoom(page)).toBeGreaterThan(.5);
        const returned = await nodeById(page, 'return-parent').boundingBox();
        expect(Math.abs(returned!.x + returned!.width / 2 - (pane!.x + pane!.width / 2))).toBeLessThan(30);
    });

    test('overview preserves geometry and edges, promotes a focused node, and makes new cards editable', async ({ page }) => {
        await openCanvas(page);
        const nodes = Array.from({ length: 160 }, (_, i) => note(`overview-${i}`, i % 10 * 700, Math.floor(i / 10) * 700));
        const edges = nodes.slice(1).map((node, i) => ({ id: `overview-edge-${i}`, source: nodes[i].id, target: node.id, sourceHandle: 'out' }));
        await seedCanvasState(page, nodes, edges);
        await page.keyboard.press('5');
        await expect.poll(() => zoom(page)).toBeLessThan(.16);
        await expect(page.locator('[data-canvas-overview]')).toHaveCount(0);
        await expect(page.locator('[data-complete-reader="true"]')).toHaveCount(160);
        await expect(page.locator(editor)).toHaveCount(0);
        await expect(page.locator('.react-flow__edge')).toHaveCount(159);
        const dimensions = await nodeById(page, 'overview-0').evaluate(el => ({ width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight }));
        expect(dimensions).toEqual({ width: 432, height: 260 });
        // Focus via the same real keyboard path used on large maps.
        await focusNode(page, nodeById(page, 'overview-0'));
        await selectNode(nodeById(page, 'overview-0'));
        await expect(nodeById(page, 'overview-0').locator(editor)).toHaveCount(1);
        await page.keyboard.press('Escape');
        await clickEmptyCanvas(page);
        await page.keyboard.press('5');
        await expect.poll(() => zoom(page)).toBeLessThan(.16);
        await page.keyboard.press('Control+n');
        const title = page.locator('input[value="New Note"]:visible').last();
        await expect(title).toBeVisible();
        const createdId = await title.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," react-flow__node ")]').getAttribute('data-id');
        await title.fill('Created from overview');
        const created = nodeById(page, createdId!);
        await created.locator('input[type="text"]').first().press('Enter');
        await expect.poll(() => zoom(page)).toBeGreaterThan(.5);
        await selectNode(created);
        await expect(created.locator(editor)).toHaveCount(1);
        await created.locator('[contenteditable="true"]').first().fill('Saved after overview creation');
        await page.keyboard.press('Escape');
        await waitForCanvasState(page, s => s.nodes.some(n => JSON.stringify(n.data?.content).includes('Saved after overview creation')));
        await page.waitForTimeout(900);
        await page.reload();
        const saved = await waitForCanvasState(page, s => s.nodes.some(n => JSON.stringify(n.data?.content).includes('Saved after overview creation')));
        expect(saved.edges).toHaveLength(159);
        expect(saved.nodes.filter(n => n.id.startsWith('overview-')).map(n => n.style)).toEqual(nodes.map(n => n.style));
    });

    test('literal delimiter-looking table cells survive an editor remount and reload', async ({ page }) => {
        await openCanvas(page);
        const cardData = note('literal-table');
        cardData.data!.content = [{ id: 'literal', type: 'table', content: '', metadata: { rows: [['Name', 'Value'], ['first', 'second']] } }];
        await seedCanvasState(page, [cardData]);
        const card = nodeById(page, 'literal-table');
        await focusNode(page, card);
        await card.hover();
        await card.getByTitle('Full Screen', { exact: true }).click();
        const cells = page.locator(editor).last().locator('table [contenteditable="true"]');
        await cells.nth(2).fill('---');
        await cells.nth(3).fill('---');
        await page.keyboard.press('Escape');
        await waitForCanvasState(page, s => JSON.stringify(s.nodes[0].data?.content).includes('"---","---"'));
        await page.waitForTimeout(900); // acknowledge normal editor + disk debounce
        await page.reload();
        await expect.poll(async () => JSON.stringify((await waitForCanvasState(page, s => s.nodes.length === 1)).nodes[0].data?.content)).toContain('"---","---"');
        await nodeById(page, 'literal-table').getByTitle('Full Screen', { exact: true }).evaluate(button => { if (button instanceof HTMLElement) button.click(); });
        await expect(page.locator(editor).last().locator('table [contenteditable="true"]').nth(2)).toHaveText('---');
    });

    test('automatic table columns stay stable while editing and resume sizing on blur', async ({ page }) => {
        await openCanvas(page);
        const data = note('auto-table');
        data.data!.content = [{ id: 'auto', type: 'table', content: '', metadata: {
            rows: [['Evidence', 'Value'], ['A', 'A longer reference value']],
        } }];
        await seedCanvasState(page, [data]);
        const card = nodeById(page, 'auto-table');
        await focusNode(page, card);
        await card.hover();
        await card.getByTitle('Center Peek', { exact: true }).click();
        const table = page.locator(editor).last().locator('table');
        const cells = table.locator('[contenteditable="true"]');
        await expect(cells).toHaveCount(4);
        await cells.nth(2).hover(); // settle the opening camera/pane animation
        const widths = () => table.locator('th').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
        const before = await widths();
        await cells.nth(2).click();
        await expect(table).toHaveCSS('table-layout', 'fixed');
        await cells.nth(2).fill('A much longer piece of investment evidence with wrapping text');
        const during = await widths();
        before.forEach((width, index) => expect(Math.abs(width - during[index])).toBeLessThan(2));
        await page.keyboard.press('Tab');
        await expect(cells.nth(3)).toBeFocused();
        await expect(table).toHaveCSS('table-layout', 'fixed');
        await page.keyboard.press('Tab'); // last cell grows the table
        await expect(cells).toHaveCount(6);
        await expect(cells.nth(4)).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(table).toHaveCSS('table-layout', 'auto');
        await expect(table.locator('col').first()).not.toHaveAttribute('style', /width:\s*\d/);
        await cells.nth(2).click();
        await page.locator(editor).last().getByRole('button', { name: 'Add row', exact: true }).click();
        await expect(cells).toHaveCount(8);
        await cells.nth(6).fill('Pointer row saved');
        await page.keyboard.press('Escape');
        await expect(table).toHaveCSS('table-layout', 'auto');
        const state = await waitForCanvasState(page, s => JSON.stringify(s.nodes[0].data?.content).includes('investment evidence'));
        expect(JSON.stringify(state.nodes[0].data?.content)).not.toContain('columnWidths');
    });
});
