import type { Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { fitView, openCanvas, selectNode, nodeById, LIVE_EDITOR } from '../../support/canvas';
import { seedCanvasState, waitForCanvasState } from '../../support/canvasState';

/**
 * The gallery block — the moodboard. Tiles are images held by reference, the
 * board arranges them, and every destructive action is undoable.
 */

/** A valid 1x1 PNG (generated, CRCs checked): Firefox rejects a malformed one
 *  that Chrome quietly renders, and logs it as an error. */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPo6ur6DwAF3gKeP85CZQAAAABJRU5ErkJggg==';

const galleryItems = (count: number) => Array.from({ length: count }, (_, i) => ({
    id: `tile-${i}`,
    type: 'image',
    content: PIXEL,
    metadata: { name: `Picture ${i}` },
}));

async function seedGallery(page: Page, count = 4) {
    await seedCanvasState(page, [{
        id: 'board-card',
        type: 'note',
        position: { x: 0, y: 0 },
        style: { width: 640, height: 640 },
        data: {
            label: 'Moodboard',
            viewMode: 'expanded',
            content: [{
                id: 'gallery-block',
                type: 'gallery',
                content: '',
                metadata: { items: galleryItems(count), galleryLayout: 'bento', galleryFit: 'cover' },
            }],
        },
    }]);

    const node = nodeById(page, 'board-card');
    await expect(node).toBeVisible();
    await fitView(page);
    await selectNode(node);
    await expect(node.locator(LIVE_EDITOR)).toBeVisible({ timeout: 20_000 });
    return node;
}

/** The items the gallery block currently holds, from saved state. */
const savedItems = async (page: Page) => {
    const state = await waitForCanvasState(page, () => true, 'the canvas');
    const blocks = state.nodes.find((n) => n.id === 'board-card')?.data?.content as
        Array<{ metadata?: { items?: Array<{ id: string }> } }> | undefined;
    return blocks?.[0]?.metadata?.items ?? [];
};

test.describe('core: gallery (G)', () => {
    test('G1 every tile in a seeded board renders', async ({ page }) => {
        await openCanvas(page);
        const node = await seedGallery(page);
        await expect(node.locator('[data-tile-id]')).toHaveCount(4);
        await expect(node.locator('[data-gallery-grid]')).toBeVisible();
    });

    test('G2 removing a tile is undoable from the board itself', async ({ page }) => {
        await openCanvas(page);
        const node = await seedGallery(page);
        const firstTile = node.locator('[data-tile-id="tile-0"]');
        await firstTile.hover();
        await node.getByTitle('Remove from board').first().click();

        await expect(node.locator('[data-tile-id]')).toHaveCount(3);
        await expect.poll(async () => (await savedItems(page)).map((i) => i.id), {
            message: 'the removed tile to leave the saved board',
        }).not.toContain('tile-0');

        // The board offers its own undo rather than relying on the canvas's.
        await node.getByRole('button', { name: /^Undo/ }).first().click();
        await expect(node.locator('[data-tile-id]')).toHaveCount(4);
        await expect.poll(async () => (await savedItems(page)).map((i) => i.id), {
            message: 'undo to put the tile back in the saved board',
        }).toContain('tile-0');
    });

    test('G3 the board layout can be changed and is saved', async ({ page }) => {
        await openCanvas(page);
        const node = await seedGallery(page);
        const layouts = node.getByRole('tablist', { name: 'Board layout' })
            .or(node.getByRole('radiogroup', { name: 'Board layout' }));
        await expect(layouts).toBeVisible();

        const options = layouts.getByRole('tab').or(layouts.getByRole('radio'));
        const count = await options.count();
        expect(count).toBeGreaterThan(1);
        await options.nth(1).click();

        await expect.poll(async () => {
            const state = await waitForCanvasState(page, () => true, 'the canvas');
            const blocks = state.nodes.find((n) => n.id === 'board-card')?.data?.content as
                Array<{ metadata?: { galleryLayout?: string } }> | undefined;
            return blocks?.[0]?.metadata?.galleryLayout;
        }, { message: 'the chosen layout to be saved' }).not.toBe('bento');

        await expect(node.locator('[data-tile-id]')).toHaveCount(4);
    });

    test('G4 a tile can be moved with the keyboard, and the new order is saved', async ({ page }) => {
        await openCanvas(page);
        const node = await seedGallery(page);
        const before = (await savedItems(page)).map((i) => i.id);

        const tile = node.locator('[data-tile-id="tile-0"][role="button"]');
        await tile.focus();
        await page.keyboard.press('Control+ArrowRight');

        await expect.poll(async () => (await savedItems(page)).map((i) => i.id).join(','), {
            message: 'the tile order to change',
        }).not.toBe(before.join(','));
        const after = (await savedItems(page)).map((i) => i.id);
        expect(after, 'a move must not lose a tile').toHaveLength(4);
        expect(after.indexOf('tile-0'), 'the moved tile went one place later').toBe(1);
    });

    test('G5 a selection is removed in one go, and one undo brings it all back in place', async ({ page }) => {
        await openCanvas(page);
        const node = await seedGallery(page);
        await node.locator('[data-tile-id="tile-0"][role="button"]').click({ modifiers: ['Control'] });
        await node.locator('[data-tile-id="tile-2"][role="button"]').click({ modifiers: ['Control'] });
        await expect(node.getByText('2 selected')).toBeVisible();

        await node.getByRole('button', { name: /Remove/ }).filter({ hasText: 'Remove' }).click();
        await expect(node.locator('[data-tile-id]')).toHaveCount(2);
        await expect.poll(async () => (await savedItems(page)).map((i) => i.id).join(','))
            .toBe('tile-1,tile-3');
        await expect(node.getByText('Removed 2 pictures')).toBeVisible();

        await node.getByRole('button', { name: /^Undo/ }).click();
        await expect.poll(async () => (await savedItems(page)).map((i) => i.id).join(','), {
            message: 'undo to restore both pictures where they were',
        }).toBe('tile-0,tile-1,tile-2,tile-3');
    });

    test('G6 dragging a tile onto another rearranges the board and saves the order', async ({ page }) => {
        await openCanvas(page);
        const node = await seedGallery(page);
        const source = node.locator('[data-tile-id="tile-3"][role="button"]');
        const target = node.locator('[data-tile-id="tile-0"][role="button"]');
        const box = (await target.boundingBox())!;
        // The left edge of the first tile: "before tile-0".
        await source.dragTo(target, { targetPosition: { x: 3, y: box.height / 2 } });

        await expect.poll(async () => (await savedItems(page)).map((i) => i.id).join(','), {
            message: 'the dragged tile to lead the saved board',
        }).toBe('tile-3,tile-0,tile-1,tile-2');
        await expect(node.locator('[data-tile-id]')).toHaveCount(4);
    });

    test('G7 a drag quick enough to send one dragover still moves the tile', async ({ page }) => {
        // The board normally shows the arrangement a drop would produce and then
        // commits that. A drag fast enough to report a single position leaves no
        // time for it to render, and the drop used to commit nothing at all —
        // the tile sprang back. Safari's test build does exactly this on every
        // drag; here it is forced, so any engine's version of it stays covered.
        await openCanvas(page);
        const node = await seedGallery(page);
        await expect(node.locator('[data-tile-id="tile-3"]')).toBeVisible();

        await page.evaluate(() => {
            const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"][role="button"]`)!;
            const source = tile('tile-3');
            const target = tile('tile-0');
            const box = target.getBoundingClientRect();
            // The left edge of the first tile: "before tile-0".
            const at = { clientX: Math.round(box.left + 3), clientY: Math.round(box.top + box.height / 2) };
            const data = new DataTransfer();
            const fire = (el: Element, type: string, extra: object = {}) => el.dispatchEvent(
                new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data, ...extra }),
            );
            fire(source, 'dragstart');
            fire(target, 'dragenter', at);
            fire(target, 'dragover', at);
            fire(target, 'drop', at);
            fire(source, 'dragend');
        });

        await expect.poll(async () => (await savedItems(page)).map((i) => i.id).join(','), {
            message: 'the tile to move even without a rendered preview',
        }).toBe('tile-3,tile-0,tile-1,tile-2');
    });
});
