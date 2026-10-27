import { test, expect } from '../../support/fixtures';
import { fitView, openCanvas } from '../../support/canvas';
import { makeCards, seedCanvasState } from '../../support/canvasState';

test('keyboard navigation works without canvas controls or a MiniMap on desktop and mobile', async ({ page }) => {
    await openCanvas(page);
    await seedCanvasState(page, makeCards(3));
    const cameraZoom = () => page.locator('.react-flow__viewport').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await expect(page.getByTestId('rf__minimap')).toHaveCount(0);
        await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
        await expect(page.locator('.react-flow__controls')).toHaveCount(0);
        await fitView(page);
        const before = await cameraZoom();
        await page.keyboard.down('+');
        try { await expect.poll(cameraZoom).toBeGreaterThan(before); }
        finally { await page.keyboard.up('+'); }
        const closer = await cameraZoom();
        await page.keyboard.down('-');
        try { await expect.poll(cameraZoom).toBeLessThan(closer); }
        finally { await page.keyboard.up('-'); }
        await fitView(page);
    }
});
