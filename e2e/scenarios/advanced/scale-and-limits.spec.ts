import { test, expect } from '../../support/fixtures';
import { fitView, openCanvas, PANE } from '../../support/canvas';
import { makeCards, nodesOnCanvas, seedCanvasState, waitForCanvasState } from '../../support/canvasState';

/**
 * QA scenarios F30 and the beta node cap.
 *
 * BETA_SCOPE is explicit that the 50-node ceiling applies to *creation* only:
 * "a canvas loaded with more nodes renders untouched (never trim on load)".
 * Silently dropping cards on load would be the worst bug this product could
 * ship, so it gets its own test at a size above the cap.
 */

test.describe('advanced: scale and limits (F30)', () => {
    test('F30 a canvas above the node cap loads without losing a single card', async ({ page }) => {
        const COUNT = 60; // deliberately above MAX_NODES_PER_CANVAS (50)

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

    test('Limit-50 creation is blocked once a canvas is full, and explains why', async ({ page }) => {
        // Seed exactly at the cap so one more creation must be refused.
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
        await page.waitForTimeout(2000);

        await expect(
            page.getByText(/full|limit|reached/i).first(),
            'creating past the 50-node cap gave the user no explanation',
        ).toBeVisible({ timeout: 10_000 });

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(page.locator(':focus'), 'the limit notice did not move focus to its action').toHaveText(/got it/i);
        await page.keyboard.press('Tab');
        await expect(page.locator(':focus'), 'Tab escaped the modal instead of cycling inside it').toHaveText(/got it/i);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();

        const after = await waitForCanvasState(page, () => true, 'the board after the blocked creation');
        expect(
            nodesOnCanvas(after, null).length,
            'a card was created beyond the 50-node canvas cap',
        ).toBe(before);
    });

    test('Limit-badge the anonymous card counter matches the real card count', async ({ page }) => {
        await openCanvas(page);
        const badge = page.getByText(/\d+\/\d+ cards/);
        await expect(badge).toBeVisible();

        const snap = await waitForCanvasState(page, (s) => s.nodes.length > 0, 'the seeded board');
        const actual = snap.nodes.filter((n) => n.type === 'note').length;
        const shown = Number((await badge.innerText()).match(/(\d+)\//)![1]);

        expect(shown, 'the card counter disagrees with the document it is counting').toBe(actual);
    });
});
