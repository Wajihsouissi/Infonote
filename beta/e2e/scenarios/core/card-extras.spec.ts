import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { addNote, clickEmptyCanvas, fitView, openCanvas, reload, selectNode, nodeByTitle, nodeById } from '../../support/canvas';
import { makeCards, nodeByLabel, seedCanvasState, waitForCanvasState } from '../../support/canvasState';

/**
 * A card's icon, cover and short description — edited on the card itself,
 * with no properties panel (plan-Beta.md §6, option A).
 */

/** A picture that needs no network: a plain coloured rectangle. */
const PICTURE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="140"><rect width="400" height="140" fill="%23c94f3d"/></svg>';

/** The stored card, once `ready` holds. */
async function card(page: Page, label: string, ready: (data: Record<string, unknown>) => boolean, what: string) {
    const state = await waitForCanvasState(page, (s) => {
        const data = nodeByLabel(s, label)?.data;
        return !!data && ready(data as Record<string, unknown>);
    }, what);
    return nodeByLabel(state, label)!.data as Record<string, unknown>;
}

/** Puts a cover on `node` through the Link tab of the cover picker. */
async function setCoverByLink(page: Page, node: Locator, url: string) {
    await node.getByRole('button', { name: /Add cover|Change cover/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Card cover' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Link' }).or(dialog.getByRole('radio', { name: 'Link' })).click();
    await dialog.getByLabel('Image address').fill(url);
    await dialog.getByRole('button', { name: 'Use it' }).click();
    await expect(dialog).toBeHidden();
}

test.describe('core: card extras (X)', () => {
    test('X1 a cover can be added from a link and survives a reload', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Cover card');
        await selectNode(node);

        await setCoverByLink(page, node, PICTURE);
        await expect(node.locator('img')).toBeVisible();
        await card(page, 'Cover card', (data) => typeof data.coverImage === 'string' && data.coverImage.length > 0, 'the cover to be saved');

        await reload(page);
        const restored = await nodeByTitle(page, 'Cover card');
        await expect(restored.locator('img'), 'the cover did not come back after a reload').toBeVisible();
    });

    test('X2 a cover can be taken off again', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Cover removal');
        await selectNode(node);
        await setCoverByLink(page, node, PICTURE);
        await expect(node.locator('img')).toBeVisible();

        await node.locator('img').hover();
        await node.getByRole('button', { name: 'Remove cover' }).click();
        await expect(node.locator('img')).toHaveCount(0);
        await card(page, 'Cover removal', (data) => !data.coverImage, 'the cover to be cleared');
    });

    test('X3 a description typed under the title is saved', async ({ page }) => {
        await openCanvas(page);
        // Descriptions belong to the medium view. Newly created cards now
        // open expanded, where the body is a block document instead.
        const fixture = makeCards(1, 'Described card')[0];
        fixture.data = { ...fixture.data, label: 'Described card', viewMode: 'medium' };
        await seedCanvasState(page, [fixture]);
        await fitView(page);
        const node = nodeById(page, fixture.id);
        await selectNode(node);

        const description = node.getByLabel('Card description');
        await expect(description).toBeVisible();
        await description.click();
        await page.keyboard.type('Two nights, old town');
        await page.keyboard.press('Tab'); // Commit the multiline field on blur.

        const data = await card(page, 'Described card', (d) => d.description === 'Two nights, old town', 'the description to be saved');
        expect(data.description).toBe('Two nights, old town');
        // Writing a description must not disturb the card's other fields.
        expect(data.label).toBe('Described card');

        await clickEmptyCanvas(page);
        await reload(page);
        const restored = await nodeByTitle(page, 'Described card');
        await selectNode(restored);
        await expect(restored.getByLabel('Card description')).toHaveValue('Two nights, old town');
    });

    test('X4 the icon can be changed from the card', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Icon card');
        await selectNode(node);

        const before = (await card(page, 'Icon card', () => true, 'the card')).icon;
        await node.getByTitle('Change icon').first().click();

        // The picker is portalled to the body, so it is found on the page.
        const picker = page.locator('[class*="overlay"]').filter({ has: page.getByPlaceholder('Search icons...') }).first();
        await expect(picker).toBeVisible();

        // Search first: the catalogue arrives in a lazy chunk, and a search
        // narrows ~1200 icons down to a handful that are certainly not the
        // card's default "FileText".
        await picker.getByPlaceholder('Search icons...').fill('rocket');
        const choice = picker.locator('[class*="iconGrid"] button').first();
        await expect(choice).toBeVisible();
        await choice.click();

        // Picking highlights; closing the picker is what commits the choice.
        await picker.getByRole('button', { name: 'Close icon picker' }).click();
        await expect(picker).toBeHidden();

        const after = await card(page, 'Icon card', (data) => data.icon !== before, 'a different icon to be saved');
        expect(after.icon).toBeTruthy();
        expect(after.icon).not.toBe(before);
    });
});
