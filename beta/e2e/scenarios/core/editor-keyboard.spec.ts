import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { addNote, clickEmptyCanvas, focusEditor, openCanvas, typeBlock } from '../../support/canvas';
import { nodeByLabel, waitForCanvasState } from '../../support/canvasState';

/**
 * The block editor's keyboard contract, one behaviour per test. These pin the
 * logic in BlockEditor's key handling (split, merge, navigation, shortcuts,
 * toggles) so it can be restructured without a user noticing.
 */

type SavedBlock = { id: string; type: string; content: string; indent?: number };

/** The saved blocks of a card, once `ready` holds for them. */
async function savedBlocks(page: Page, label: string, ready: (blocks: SavedBlock[]) => boolean, what: string) {
    const state = await waitForCanvasState(page, (s) => {
        const content = nodeByLabel(s, label)?.data?.content;
        return Array.isArray(content) && ready(content as SavedBlock[]);
    }, what);
    return nodeByLabel(state, label)!.data!.content as SavedBlock[];
}

const blocksIn = (node: Locator) => node.locator('[data-block-type]');

test.describe('core: editor keyboard (K)', () => {
    test('K1 Enter splits a block at the caret and Backspace at the start merges it back', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Split and merge');
        await focusEditor(page, node);

        await page.keyboard.type('HelloWorld');
        for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        await expect(blocksIn(node)).toHaveCount(2);
        await expect(blocksIn(node).nth(0)).toHaveText('Hello');
        await expect(blocksIn(node).nth(1)).toHaveText('World');

        // The caret landed at the start of "World": Backspace joins the lines.
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(150);
        await expect(blocksIn(node)).toHaveCount(1);
        await expect(blocksIn(node).first()).toHaveText('HelloWorld');

        // Typing continues exactly where the join happened.
        await page.keyboard.type('-');
        await expect(blocksIn(node).first()).toHaveText('Hello-World');
    });

    test('K2 Backspace right after a markdown conversion gives the marker back', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Marker revert');
        await focusEditor(page, node);

        await page.keyboard.type('# ');
        await expect(node.locator('[data-block-type="heading1"]')).toBeVisible();
        await page.keyboard.press('Backspace');
        await expect(node.locator('[data-block-type="heading1"]')).toHaveCount(0);
        await expect(blocksIn(node).first()).toHaveAttribute('data-block-type', 'text');

        // The literal marker is text now; typing on must not re-convert it.
        await page.keyboard.type('literal');
        await expect(blocksIn(node).first()).toHaveText('# literal');
        await expect(node.locator('[data-block-type="heading1"]')).toHaveCount(0);
    });

    test('K3 arrow keys move between blocks and keep the caret column', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Arrow navigation');
        await focusEditor(page, node);

        await typeBlock(page, 'first line');
        await page.keyboard.type('second line');
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(150);
        await page.keyboard.type('X');
        await expect(blocksIn(node).nth(0)).toContainText('X');
        await expect(blocksIn(node).nth(1)).toHaveText('second line');

        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(150);
        await page.keyboard.type('Y');
        await expect(blocksIn(node).nth(1)).toContainText('Y');
    });

    test('K4 the slash menu turns the current block into the chosen type', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Slash menu');
        await focusEditor(page, node);

        await page.keyboard.type('/heading');
        const menu = page.locator('[class*="slashMenu"]').first();
        await expect(menu).toBeVisible();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        const heading = node.locator('[data-block-type^="heading"]');
        await expect(heading).toHaveCount(1);
        await expect(menu).toBeHidden();
        // The command text is consumed, not left in the heading.
        await page.keyboard.type('Chapter');
        await expect(heading).toHaveText('Chapter');
    });

    test('K5 formatting shortcuts are saved as markdown', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Formatting');
        await focusEditor(page, node);

        await page.keyboard.type('make this bold');
        for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
        await page.keyboard.press('Control+b');
        await page.waitForTimeout(100);
        await expect(node.locator('strong, b').first()).toHaveText('bold');

        await clickEmptyCanvas(page);
        const blocks = await savedBlocks(page, 'Formatting', (b) => b.some((x) => x.content.includes('**')), 'bold to be saved');
        expect(blocks[0].content).toBe('make this **bold**');
    });

    test('K6 Enter on a toggle header starts its body, Shift+Enter adds a line to it', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Toggle body');
        await focusEditor(page, node);

        await page.keyboard.type('>> Details');
        await expect(node.locator('[data-block-type="toggle"]')).toBeVisible();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        await page.keyboard.type('inside one');
        await page.keyboard.press('Shift+Enter');
        await page.waitForTimeout(150);
        await page.keyboard.type('inside two');

        await clickEmptyCanvas(page);
        const blocks = await savedBlocks(page, 'Toggle body', (b) => b.some((x) => x.content === 'inside two'), 'the toggle body');
        expect(blocks.map((b) => [b.type, b.content, b.indent ?? 0])).toEqual([
            ['toggle', 'Details', 0],
            ['text', 'inside one', 1],
            ['text', 'inside two', 1],
        ]);
    });

    test('K7 Ctrl+A twice selects every block, and Delete removes them', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Select all');
        await focusEditor(page, node);
        await typeBlock(page, 'one');
        await typeBlock(page, 'two');
        await page.keyboard.type('three');

        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+a');
        await expect(node.locator('[data-block-type][class*="selected"]')).toHaveCount(3);
        await page.keyboard.press('Delete');

        await clickEmptyCanvas(page);
        await savedBlocks(page, 'Select all', (b) => !b.some((x) => ['one', 'two', 'three'].includes(x.content)), 'the blocks to be deleted');
    });

    test('K8 Enter in a canvas block creates the next block below it', async ({ page }) => {
        await openCanvas(page);
        const before = (await waitForCanvasState(page, () => true, 'the canvas')).nodes.length;
        await page.evaluate(() => {
            const store = (window as unknown as { __appStore: { getState: () => {
                addNode: (type: string, pos: { x: number; y: number }, data: Record<string, unknown>, style?: unknown, parentId?: string, id?: string) => void;
            } } }).__appStore;
            store.getState().addNode('block', { x: 200, y: 200 }, {
                content: [{ id: 'k8-block', type: 'text', content: 'first' }],
                isStandaloneBlock: true,
            }, undefined, undefined, 'k8-node');
        });
        const node = page.locator('.react-flow__node[data-id="k8-node"]');
        await expect(node).toBeVisible();
        await node.locator('.interaction-overlay').click({ force: true });
        const editable = node.locator('[contenteditable="true"]').first();
        await expect(editable).toBeVisible({ timeout: 15_000 });
        await editable.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        await page.keyboard.type('second');

        const state = await waitForCanvasState(page, (s) => s.nodes.length === before + 2
            && s.nodes.some((n) => JSON.stringify(n.data?.content ?? '').includes('second')), 'a second canvas block');
        const second = state.nodes.find((n) => n.id !== 'k8-node' && JSON.stringify(n.data?.content ?? '').includes('second'))!;
        const first = state.nodes.find((n) => n.id === 'k8-node')!;
        expect(second.type).toBe('block');
        expect(second.position!.y, 'the new block is placed below').toBeGreaterThan(first.position!.y);
    });
});
