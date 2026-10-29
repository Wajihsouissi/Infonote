import { test, expect } from '../../support/fixtures';
import { openCanvas, nodeById, selectNode, clickEmptyCanvas } from '../../support/canvas';
import { seedCanvasState, readCanvasState, type CanvasStateNode } from '../../support/canvasState';

const cases: Array<{ name: string; type: string; data: Record<string, unknown> }> = [
    { name: 'expanded card', type: 'note', data: { viewMode: 'expanded' } },
    { name: 'compact card', type: 'note', data: { viewMode: 'medium' } },
    { name: 'fused note', type: 'fused-note', data: {} },
    { name: 'text block', type: 'block', data: { isStandaloneBlock: true } },
    { name: 'color block', type: 'block', data: { content: [{ id: 'swatch', type: 'color', content: '#745ade' }] } },
    { name: 'empty media', type: 'block', data: { content: [{ id: 'media', type: 'media', content: '' }] } },
    { name: 'table block', type: 'block', data: { content: [{ id: 'table', type: 'table', content: '', metadata: { rows: [['Name', 'Value'], ['Retained', '42']], tableRowsVersion: 1 } }] } },
    { name: 'Intelligent UI', type: 'block', data: { content: [{ id: 'ui', type: 'intelligent-ui', content: '' }] } },
];

for (const item of cases) {
    test(`${item.name}: body drag moves without editing; first click only selects`, async ({ page }) => {
        await openCanvas(page);
        const source: CanvasStateNode = { id: 'subject', type: item.type, position: { x: 80, y: 80 }, style: { width: 432 }, data: {
            label: 'Interaction contract', content: [{ id: 'text', type: 'text', content: 'Content survives the gesture.' }], ...item.data,
        } };
        await seedCanvasState(page, [source]);
        const node = nodeById(page, 'subject');
        const surface = node.locator('.interaction-overlay');
        await expect(surface).toBeVisible();
        await surface.hover();
        const toolbar = node.getByRole('toolbar', { name: 'Node view options' });
        await expect(toolbar).toHaveCSS('opacity', '1');
        for (const title of ['Side Panel (Left)', 'Full Screen', 'Center Peek', 'Side Panel (Right)']) {
            await expect(toolbar.getByTitle(title, { exact: true })).toHaveCount(1);
        }
        const box = await surface.boundingBox();
        if (!box) throw new Error('Node surface was not measured');
        let pickers = 0;
        page.on('filechooser', () => pickers++);
        const x = box.x + box.width * .65, y = box.y + box.height * .55;
        await expect.poll(() => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('interaction-overlay'), { x, y })).toBe(true);
        await page.mouse.move(x, y); await page.mouse.down();
        try { await page.mouse.move(x + 70, y + 35, { steps: 8 }); } finally { await page.mouse.up(); }
        await expect.poll(async () => (await readCanvasState(page))!.nodes[0].position).not.toEqual(source.position);
        await expect(node).not.toHaveClass(/selected/);
        await expect(surface).toBeVisible();
        expect((await readCanvasState(page))!.nodes[0].data!.content).toEqual(source.data!.content);
        await surface.click();
        await expect(surface).toHaveCount(0);
        await expect(node).toHaveClass(/selected/);
        await node.hover();
        await expect(toolbar).toHaveCSS('opacity', '1');
        await expect(node.locator('[data-canvas-node-interaction]')).toHaveAttribute('data-canvas-node-interaction', 'interact');
        await expect(page.locator(':focus')).not.toHaveAttribute('contenteditable', 'true');
        expect(pickers).toBe(0);
        await expect(page.getByPlaceholder('Color name')).toHaveCount(0);
        if (item.name === 'color block') {
            await node.getByTitle('Edit color').click();
            await expect(page.getByPlaceholder('Color name')).toBeVisible();
        } else if (['expanded card', 'fused note', 'text block'].includes(item.name)) {
            const editor = node.locator('[contenteditable="true"]').first();
            await expect(editor).toBeVisible();
            await editor.click(); await page.keyboard.press('End'); await page.keyboard.type(' Added.');
            await expect.poll(async () => JSON.stringify((await readCanvasState(page))!.nodes[0].data!.content)).toContain('Added.');
        }
    });
}

test('multi-selection drags from the body; a later single selection restores editing', async ({ page }) => {
    await openCanvas(page);
    await seedCanvasState(page, ['one', 'two'].map((id, i) => ({ id, type: 'note', position: { x: 50 + i * 500, y: 80 }, style: { width: 400, height: 360 }, data: {
        label: id, viewMode: 'expanded', content: [{ id: `${id}-text`, type: 'text', content: id }],
    } })));
    await selectNode(nodeById(page, 'one'));
    await selectNode(nodeById(page, 'two'), ['Shift']);
    const before = (await readCanvasState(page))!.nodes;
    const shield = nodeById(page, 'one').locator('.interaction-overlay');
    await expect(shield).toBeVisible();
    const box = await shield.boundingBox();
    if (!box) throw new Error('Group drag surface missing');
    await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down();
    try { await page.mouse.move(box.x + 160, box.y + 150, { steps: 8 }); } finally { await page.mouse.up(); }
    const after = (await readCanvasState(page))!.nodes;
    for (let i = 0; i < 2; i++) expect(after[i].position).not.toEqual(before[i].position);
    await clickEmptyCanvas(page);
    await selectNode(nodeById(page, 'one'));
    await expect(nodeById(page, 'one').locator('[contenteditable="true"]').first()).toBeVisible();
});

test('hover toolbar actions open every view before selection without moving the node', async ({ page }, testInfo) => {
    await openCanvas(page);
    for (const [index, [title, field]] of [
        ['Side Panel (Left)', 'leftSidePanelId'], ['Center Peek', 'centerPanelId'],
        ['Side Panel (Right)', 'rightSidePanelId'], ['Full Screen', 'fullscreenId'],
    ].entries()) {
        await seedCanvasState(page, [{ id: 'hover-card', type: index % 2 ? 'fused-note' : 'note', position: { x: 90, y: 90 }, style: { width: 432, height: 300 }, data: {
            label: 'Hover views', viewMode: 'expanded', content: [{ id: 'hover-text', type: 'text', content: 'Available before selection' }],
        } }]);
        const node = nodeById(page, 'hover-card');
        const toolbar = node.getByRole('toolbar', { name: 'Node view options' });
        await page.mouse.move(20, 500);
        await expect(toolbar).toHaveCSS('opacity', '0');
        await node.locator('.interaction-overlay').hover();
        await expect(toolbar).toHaveCSS('opacity', '1');
        if (!index) await page.screenshot({ path: testInfo.outputPath('hover-toolbar-desktop.png') });
        // Move across the gap with native events: the invisible bridge keeps it open.
        const button = toolbar.getByTitle(title, { exact: true });
        const box = await button.boundingBox();
        if (!box) throw new Error('Hover action is not measured');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
        await button.click();
        await expect.poll(() => page.evaluate(async fieldName => {
            const path = '/src/store/useStore.ts'; const { useStore } = await import(/* @vite-ignore */ path);
            return useStore.getState()[fieldName];
        }, field)).toBe('hover-card');
        expect((await readCanvasState(page))!.nodes[0].position).toEqual({ x: 90, y: 90 });
        await page.evaluate(async () => {
            const path = '/src/store/useStore.ts'; const { useStore } = await import(/* @vite-ignore */ path);
            const state = useStore.getState();
            state.setLeftSidePanelId(null); state.setCenterPanelId(null); state.setRightSidePanelId(null); state.setFullscreenId(null);
            if (document.fullscreenElement) await document.exitFullscreen();
        });
        await expect(node.locator('.interaction-overlay')).toBeVisible();
    }
});

test('saved interactive iframe can be dragged passively and used after selection', async ({ page }, testInfo) => {
    await openCanvas(page);
    await seedCanvasState(page, [{ id: 'interactive', type: 'block', position: { x: 60, y: 60 }, style: { width: 500 }, data: {
        isStandaloneBlock: true, content: [{ id: 'ui', type: 'intelligent-ui', content: 'Counter', metadata: { intelligentUI: {
            nativeTextPlaced: true, artifact: { version: 1, id: 'counter', title: 'Counter', summary: 'Selection test', prompt: 'Counter', createdAt: '2026-10-20T12:00:00Z',
                initialHeight: 180, css: 'button{padding:16px}output{display:block}', html: '<button id="increment">Increment</button><output id="result">0</output>',
                jsFunctions: "function setup(){document.getElementById('increment').addEventListener('click',()=>{document.getElementById('result').textContent='1';});}", jsExpressions: ['setup();'],
            },
        } } }],
    } }]);
    const node = nodeById(page, 'interactive');
    const surface = node.locator('.interaction-overlay');
    await expect(surface).toBeVisible();
    await surface.hover();
    const box = await surface.boundingBox();
    if (!box) throw new Error('Interactive node is not measured');
    await page.mouse.move(box.x + 100, box.y + 60); await page.mouse.down();
    try { await page.mouse.move(box.x + 170, box.y + 90, { steps: 8 }); } finally { await page.mouse.up(); }
    await expect.poll(async () => (await readCanvasState(page))!.nodes[0].position).not.toEqual({ x: 60, y: 60 });
    await expect(surface).toBeVisible();
    await surface.click();
    const frame = page.frameLocator('iframe[title="Counter"]');
    await expect(node.locator('iframe[data-ui-ready="true"]')).toBeVisible();
    await frame.getByRole('button', { name: 'Increment' }).click();
    await expect(frame.locator('#result')).toHaveText('1');
    await page.screenshot({ path: testInfo.outputPath('desktop-interactive.png') });
    await clickEmptyCanvas(page);
    await expect(surface).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 640 });
    await expect(surface).toBeVisible();
    await surface.hover();
    await expect(node.getByRole('toolbar', { name: 'Node view options' })).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath('small-interactive.png') });
});

test('link mode and native connection drags can still target a passive node', async ({ page }) => {
    await openCanvas(page);
    await seedCanvasState(page, ['source', 'target'].map((id, index) => ({ id, type: 'note', position: { x: 40 + index * 530, y: 90 }, style: { width: 400, height: 220 }, data: {
        label: id, viewMode: 'medium', content: [{ id: `${id}-text`, type: 'text', content: id }],
    } })));
    const source = nodeById(page, 'source'), target = nodeById(page, 'target');
    await selectNode(source);
    await source.hover();
    const handle = source.locator('.react-flow__handle.source');
    await expect(handle).toBeVisible();
    const start = await handle.boundingBox(), end = await target.boundingBox();
    if (!start || !end) throw new Error('Connection endpoints not measured');
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
    try { await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 }); } finally { await page.mouse.up(); }
    await expect.poll(async () => (await readCanvasState(page))!.edges.length).toBe(1);
    // The explicit link mode has its own surface and must not be made inert.
    await page.evaluate(async () => {
        const path = '/src/store/useStore.ts'; const { useStore } = await import(/* @vite-ignore */ path);
        useStore.getState().setIsLinkingMode(true);
    });
    await expect(target.getByRole('button', { name: 'Link the selected cards to this one' })).toBeVisible();
    await target.getByRole('button', { name: 'Link the selected cards to this one' }).click();
    await expect(target.getByRole('button', { name: 'Link the selected cards to this one' })).toHaveCount(0);
    expect((await readCanvasState(page))!.edges.length).toBe(1);
});
