import { test, expect } from '../../support/fixtures';
import { fitView, PANE } from '../../support/canvas';
import { makeCards, nodesOnCanvas, seedCanvasState, waitForCanvasState } from '../../support/canvasState';

/**
 * QA scenarios for large canvases.
 *
 * Card and node quotas are temporarily disabled, so large canvases must load
 * and continue accepting new cards without requiring an account.
 */

test.describe('advanced: scale and limits (F30)', () => {
    test('F30 a canvas above the node cap loads without losing a single card', async ({ page }) => {
        const COUNT = 60;

        await page.goto('/canvas');
        await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
        await seedCanvasState(page, makeCards(COUNT));

        await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(2500);

        const loaded = await waitForCanvasState(page, (s) => s.nodes.length > 0, 'the seeded board to load');
        expect(
            nodesOnCanvas(loaded, null).length,
            `a canvas seeded with ${COUNT} cards came back with a different count — cards were trimmed on load`,
        ).toBe(COUNT);
    });

    test('F30b a large canvas still renders, pans and saves', async ({ page }) => {
        await page.goto('/canvas');
        await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
        await seedCanvasState(page, makeCards(60));
        await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(2500);

        await fitView(page);
        // Something must actually be on screen; a board that loads but renders
        // nothing is not "loaded".
        await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

        // Pan the viewport and make sure the board is still alive afterwards.
        await page.mouse.move(640, 400);
        await page.mouse.down();
        await page.mouse.move(300, 250, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(800);
        await expect(page.locator(PANE)).toBeVisible();

        const after = await waitForCanvasState(page, (s) => s.nodes.length > 0, 'the board after panning');
        expect(after.nodes.length, 'panning changed the number of cards').toBe(60);
    });

    test('an anonymous user can create beyond 50 nodes on a canvas', async ({ page }) => {
        await page.goto('/canvas');
        await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
        await seedCanvasState(page, makeCards(50));
        await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(2500);

        const before = nodesOnCanvas(
            await waitForCanvasState(page, (s) => s.nodes.length > 0, 'the full board'),
            null,
        ).length;
        expect(before).toBe(50);

        await page.keyboard.press('Control+n');
        const after = await waitForCanvasState(
            page,
            (state) => nodesOnCanvas(state, null).length === before + 1,
            'the card created past the former 50-node cap',
        );

        expect(
            nodesOnCanvas(after, null).length,
            'the card was not created past the former 50-node cap',
        ).toBe(before + 1);
    });
});
