import { test, expect } from '../../support/fixtures';
import { openCanvas, nodeById, selectNode } from '../../support/canvas';
import { seedCanvasState, readCanvasState } from '../../support/canvasState';

test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await seedCanvasState(page, [{ id: 'gesture-note', type: 'note', position: { x: 0, y: 0 }, style: { width: 432, height: 560 }, data: {
        label: 'Gesture continuity', viewMode: 'expanded', content: Array.from({ length: 256 }, (_, i) => ({ id: `gesture-p-${i}`, type: 'text', content: `Retained paragraph ${i}` })),
    } }]);
    const card = nodeById(page, 'gesture-note');
    await selectNode(card);
    await expect(card.locator('[data-chnk-it-block-editor]')).toHaveCount(1);
    await page.evaluate(() => {
        Object.assign(window, { __gestureEditor: document.querySelector('[data-id="gesture-note"] [data-chnk-it-block-editor]') });
    });
});

test('a selected editor keeps its actual DOM host throughout a pan and settle', async ({ page }) => {
    await expect(page.locator('.react-flow__attribution')).toBeVisible();
    await page.mouse.move(24, 420); await page.mouse.down();
    try {
        await page.mouse.move(140, 450, { steps: 8 });
        await expect(page.locator('html')).toHaveAttribute('data-canvas-streaming', '');
        expect(await page.locator('.special-primary-btn').first().evaluate(button => getComputedStyle(button, '::after').animationPlayState)).toBe('paused');
        expect(await page.evaluate(() => (window as unknown as { __gestureEditor: Element }).__gestureEditor === document.querySelector('[data-id="gesture-note"] [data-chnk-it-block-editor]'))).toBe(true);
    } finally { await page.mouse.up(); }
    await page.waitForTimeout(250);
    await expect(page.locator('html')).not.toHaveAttribute('data-canvas-streaming', '');
    expect(await page.locator('.special-primary-btn').first().evaluate(button => getComputedStyle(button, '::after').animationPlayState)).toBe('running');
    expect(await page.evaluate(() => (window as unknown as { __gestureEditor: Element }).__gestureEditor === document.querySelector('[data-id="gesture-note"] [data-chnk-it-block-editor]'))).toBe(true);
    expect(((await readCanvasState(page))!.nodes[0].data!.content as unknown[]).length).toBe(256);
});

test('dragging keeps the selected editor mounted, moves the card, and preserves undo and content', async ({ page }) => {
    const card = nodeById(page, 'gesture-note');
    const before = (await readCanvasState(page))!.nodes[0];
    const handle = await card.locator('.custom-drag-handle').first().boundingBox();
    if (!handle) throw new Error('Drag handle not measured.');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 4); await page.mouse.down();
    try {
        await page.mouse.move(handle.x + handle.width / 2 + 100, handle.y + 44, { steps: 8 });
        await expect(page.locator('html')).toHaveAttribute('data-canvas-streaming', '');
        expect(await page.evaluate(() => (window as unknown as { __gestureEditor: Element }).__gestureEditor === document.querySelector('[data-id="gesture-note"] [data-chnk-it-block-editor]'))).toBe(true);
        expect((await readCanvasState(page))!.nodes[0].position).not.toEqual(before.position);
    } finally { await page.mouse.up(); }
    await page.waitForTimeout(250);
    await expect(page.locator('html')).not.toHaveAttribute('data-canvas-streaming', '');
    expect(await page.evaluate(() => (window as unknown as { __gestureEditor: Element }).__gestureEditor === document.querySelector('[data-id="gesture-note"] [data-chnk-it-block-editor]'))).toBe(true);
    expect((await readCanvasState(page))!.nodes[0].data!.content).toEqual(before.data!.content);
    await page.evaluate(async () => {
        const path = '/src/store/useStore.ts'; const { useStore } = await import(/* @vite-ignore */ path);
        useStore.temporal.getState().undo();
    });
    await expect.poll(async () => (await readCanvasState(page))!.nodes[0].position).toEqual(before.position);
});

test('losing the window during a pan releases the animation and admission gate', async ({ page }) => {
    await page.mouse.move(24, 420); await page.mouse.down();
    try {
        await page.mouse.move(140, 450, { steps: 8 });
        await expect(page.locator('html')).toHaveAttribute('data-canvas-streaming', '');
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await expect(page.locator('html')).not.toHaveAttribute('data-canvas-streaming', '');
    } finally { await page.mouse.up(); }
    expect(await page.evaluate(() => (window as unknown as { __gestureEditor: Element }).__gestureEditor === document.querySelector('[data-id="gesture-note"] [data-chnk-it-block-editor]'))).toBe(true);
});
