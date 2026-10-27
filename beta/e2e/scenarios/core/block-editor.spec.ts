import { test, expect } from '../../support/fixtures';
import {
    addNote, clickEmptyCanvas, deleteNode, focusEditor, openCanvas, selectNode, typeBlock,
} from '../../support/canvas';
import { nodeByLabel, nodeText, waitForCanvasState } from '../../support/canvasState';

/**
 * QA scenarios C13 / C14 / C18 — the Notion-parity tests.
 *
 * The block editor is the part of the product a user spends all day inside, so
 * these check the three things that make it feel trustworthy: every block type
 * survives a round trip, the keyboard alone is enough, and undo reverses one
 * intention at a time.
 */

/** Every block type reachable from a markdown shortcut, with the text to type. */
const BLOCKS: Array<{ type: string; markdown: string; text: string }> = [
    { type: 'text', markdown: '', text: 'Plain paragraph text' },
    { type: 'heading1', markdown: '# ', text: 'Heading One' },
    { type: 'heading2', markdown: '## ', text: 'Heading Two' },
    { type: 'heading3', markdown: '### ', text: 'Heading Three' },
    { type: 'bullet', markdown: '* ', text: 'Bullet item' },
    { type: 'numbered', markdown: '1. ', text: 'Numbered item' },
    { type: 'todo', markdown: '[] ', text: 'Todo item' },
    { type: 'quote', markdown: '> ', text: 'Quoted text' },
];

test.describe('core: block editor (C)', () => {
    test('C13 every block type is created, ordered and retained in the document', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Block type tour');
        await focusEditor(page, node);

        for (const block of BLOCKS) {
            await typeBlock(page, block.markdown + block.text);
        }
        // A divider has no editable content of its own: converting one
        // auto-creates and focuses the block after it, so type the marker with
        // no trailing Enter and keep going straight into that next block.
        await page.keyboard.type('---');
        await page.waitForTimeout(250);
        await page.keyboard.type('``` console.log("hello")');
        await page.keyboard.press('Escape');

        // Types land correctly while still in the live editor.
        for (const block of BLOCKS) {
            await expect(
                node.locator(`[data-block-type="${block.type}"]`, { hasText: block.text }),
                `block type "${block.type}" was not created from its markdown shortcut`,
            ).toBeVisible();
        }
        await expect(node.locator('[data-block-type="divider"]')).toBeVisible();
        await expect(node.locator('[data-block-type="code"]', { hasText: 'console.log("hello")' })).toBeVisible();

        // Order must match what was typed, top to bottom.
        const types = await node.locator('[data-block-type]')
            .evaluateAll((els) => els.map((el) => el.getAttribute('data-block-type')));
        expect(types).toEqual([...BLOCKS.map((b) => b.type), 'divider', 'code']);

        // A fresh todo must not arrive pre-checked.
        const todo = node.locator('[data-block-type="todo"] input[type="checkbox"]');
        await expect(todo).toBeVisible();
        await expect(todo).not.toBeChecked();

        await clickEmptyCanvas(page);

        // The real assertion: every block's text is still in the document.
        const snap = await waitForCanvasState(
            page,
            (s) => !!nodeByLabel(s, 'Block type tour'),
            'the saved card',
        );
        // Walk the block tree for raw strings: asserting against JSON.stringify
        // output silently fails on any text containing a quote character.
        const saved = nodeText(nodeByLabel(snap, 'Block type tour')!);
        for (const block of BLOCKS) {
            expect(saved, `"${block.text}" was not retained in the document`).toContain(block.text);
        }
        expect(saved, 'the code block was not retained in the document').toContain('console.log("hello")');
    });

    test('C13b a todo can be checked and stays checked after leaving the editor', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Todo persistence');
        await focusEditor(page, node);
        await page.keyboard.type('[] Buy milk');
        await page.waitForTimeout(300);

        // Check it while the live editor is still mounted: the read-only card
        // body renders the same checkbox `disabled`, so blurring first would
        // leave nothing clickable.
        const todo = node.locator('input[type="checkbox"]').first();
        await expect(todo).toBeVisible();
        await todo.check();
        await expect(todo).toBeChecked();

        await clickEmptyCanvas(page);
        await selectNode(node);
        const currentTodo = node.locator('input[type="checkbox"]').first();
        await expect(currentTodo).toBeVisible({ timeout: 15_000 });
        await expect(currentTodo, 'a checked todo came back unchecked').toBeChecked();
    });

    test('C14 a structured document can be written without touching the mouse', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Keyboard only');
        await focusEditor(page, node);

        await typeBlock(page, '# Weekly plan');
        await page.keyboard.type('* First bullet');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(90);
        await page.keyboard.type('Second bullet');
        // Tab indents the current bullet under the previous one.
        await page.keyboard.press('Tab');
        await page.waitForTimeout(150);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(90);
        await page.keyboard.type('Third bullet');
        // Shift+Tab brings it back out to the top level.
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(150);
        await page.keyboard.press('Escape');

        await expect(node.locator('[data-block-type="heading1"]', { hasText: 'Weekly plan' })).toBeVisible();
        const bullets = node.locator('[data-block-type="bullet"]');
        await expect(bullets).toHaveCount(3);

        await clickEmptyCanvas(page);
        const snap = await waitForCanvasState(
            page,
            (s) => JSON.stringify(nodeByLabel(s, 'Keyboard only')?.data ?? {}).includes('Third bullet'),
            'the keyboard-written document',
        );
        const saved = JSON.stringify(nodeByLabel(snap, 'Keyboard only')!.data);
        for (const text of ['Weekly plan', 'First bullet', 'Second bullet', 'Third bullet']) {
            expect(saved, `"${text}" was lost`).toContain(text);
        }
    });

    test('C18 undo reverses one edit at a time and redo restores it', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Undo granularity');
        await focusEditor(page, node);

        await typeBlock(page, 'First sentence.');
        // A pause lets the undo history close the first entry, so the two
        // sentences are separate intentions rather than one coalesced blob.
        await page.waitForTimeout(1200);
        await page.keyboard.type('Second sentence.');
        await page.keyboard.press('Escape');
        await clickEmptyCanvas(page);

        await waitForCanvasState(
            page,
            (s) => JSON.stringify(nodeByLabel(s, 'Undo granularity')?.data ?? {}).includes('Second sentence.'),
            'both sentences to be saved',
        );

        await page.getByTitle(/^Undo/).first().click();
        const afterUndo = await waitForCanvasState(
            page,
            (s) => !JSON.stringify(nodeByLabel(s, 'Undo granularity')?.data ?? {}).includes('Second sentence.'),
            'the second sentence to be undone',
        );
        expect(
            JSON.stringify(nodeByLabel(afterUndo, 'Undo granularity')?.data ?? {}),
            'undo swallowed the first sentence too instead of one step',
        ).toContain('First sentence.');

        await page.getByTitle(/^Redo/).first().click();
        const afterRedo = await waitForCanvasState(
            page,
            (s) => JSON.stringify(nodeByLabel(s, 'Undo granularity')?.data ?? {}).includes('Second sentence.'),
            'redo to bring the second sentence back',
        );
        expect(JSON.stringify(nodeByLabel(afterRedo, 'Undo granularity')!.data)).toContain('First sentence.');
    });

    test('C18b undo restores a deleted card in one step', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Undo delete');
        await focusEditor(page, node);
        await page.keyboard.type('Content that must come back');
        await clickEmptyCanvas(page);

        const before = await waitForCanvasState(
            page,
            (s) => !!nodeByLabel(s, 'Undo delete'),
            'the card to be saved',
        );
        const id = nodeByLabel(before, 'Undo delete')!.id;

        await deleteNode(page, node);
        await waitForCanvasState(page, (s) => !s.nodes.some((n) => n.id === id), 'the card to be deleted');

        await page.getByTitle(/^Undo/).first().click();
        const after = await waitForCanvasState(
            page,
            (s) => s.nodes.some((n) => n.id === id),
            'undo to restore the deleted card',
        );
        expect(
            JSON.stringify(after.nodes.find((n) => n.id === id)!.data),
            'the card came back empty — undo restored the node but not its content',
        ).toContain('Content that must come back');
    });
});
