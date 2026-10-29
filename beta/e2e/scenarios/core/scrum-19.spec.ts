import { test, expect } from '../../support/fixtures';
import {
    addNote, blurEditor, clickEmptyCanvas, confirmNodeDeletion, fitView, focusEditor, nodeById, openCanvas,
    reload, selectNode, setTitle, waitForLocalSave,
} from '../../support/canvas';
import { makeCards, nodeByLabel, readCanvasState, seedCanvasState, waitForCanvasState } from '../../support/canvasState';

test.describe('SCRUM-19 card lifecycle', () => {
    test('SCRUM-69 keyboard, toolbar and canvas slash creation yield distinct editable cards', async ({ page }, testInfo) => {
        await openCanvas(page);
        await page.keyboard.press('Control+n');
        let state = await waitForCanvasState(page, s => s.nodes.filter(n => n.type === 'note').length === 1, 'keyboard card');
        const first = state.nodes.find(n => n.type === 'note')!;
        await selectNode(nodeById(page, first.id));
        await setTitle(nodeById(page, first.id), 'Keyboard card');
        await waitForCanvasState(page, s => Boolean(nodeByLabel(s, 'Keyboard card')), 'editable first title');
        await nodeById(page, first.id).getByPlaceholder('Untitled').hover();
        await expect(nodeById(page, first.id).getByPlaceholder('Untitled')).toHaveCSS('padding-left', '2px');
        await page.screenshot({ path: testInfo.outputPath('title-spacing.png') });

        await clickEmptyCanvas(page);
        await page.getByRole('button', { name: 'Add new note card' }).click();
        state = await waitForCanvasState(page, s => s.nodes.filter(n => n.type === 'note').length === 2, 'toolbar card');
        const second = state.nodes.filter(n => n.type === 'note').find(n => n.id !== first.id)!;
        expect(second.id).not.toBe(first.id);
        expect(second.position).not.toEqual(first.position);
        await selectNode(nodeById(page, second.id));
        await setTitle(nodeById(page, second.id), 'Toolbar card');

        await clickEmptyCanvas(page);
        await page.mouse.move(850, 450);
        await page.keyboard.press('/');
        await expect(page.getByPlaceholder('Type to filter...')).toBeVisible();
        await page.getByPlaceholder('Type to filter...').fill('note');
        await page.getByRole('button', { name: /Note A rich-content note card/ }).click();
        state = await waitForCanvasState(page, s => s.nodes.filter(n => n.type === 'note').length === 3, 'canvas slash card');
        const ids = state.nodes.filter(n => n.type === 'note').map(n => n.id);
        expect(new Set(ids).size).toBe(3);
        const notes = state.nodes.filter(n => n.type === 'note');
        for (let i = 0; i < notes.length; i++) for (const other of notes.slice(i + 1)) {
            const node = notes[i];
            const overlap = node.position!.x < other.position!.x + (other.style?.width ?? 432)
                && node.position!.x + (node.style?.width ?? 432) > other.position!.x
                && node.position!.y < other.position!.y + (other.style?.height ?? 432)
                && node.position!.y + (node.style?.height ?? 432) > other.position!.y;
            expect(overlap, `new cards ${node.id} and ${other.id} overlap`).toBe(false);
        }
        await page.screenshot({ path: testInfo.outputPath('three-creation-paths.png') });
    });

    test('SCRUM-69 creation inside an opened card belongs to that active canvas', async ({ page }, testInfo) => {
        await openCanvas(page);
        const parent = makeCards(1, 'Container')[0];
        parent.data = { ...parent.data, content: [] };
        await seedCanvasState(page, [parent]);
        const node = nodeById(page, parent.id);
        await fitView(page);
        await node.hover();
        await node.getByRole('button', { name: 'Open card', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Container 0', exact: true })).toBeVisible();
        await addNote(page, 'Nested new card');
        const state = await waitForCanvasState(page, s => Boolean(nodeByLabel(s, 'Nested new card')), 'nested creation');
        expect(nodeByLabel(state, 'Nested new card')?.parentId).toBe(parent.id);
        await page.screenshot({ path: testInfo.outputPath('nested-creation.png') });
        await page.keyboard.press('Alt+ArrowUp');
        await expect(node).toBeVisible();
    });

    test('SCRUM-70 two renames and description survive deselection and reload with body and metadata', async ({ page }, testInfo) => {
        await openCanvas(page);
        const card = makeCards(1, 'Draft')[0];
        card.style = { width: 208, height: 208 };
        card.data = { ...card.data, viewMode: 'medium', description: '', metadata: { source: 'qa-fixture' } };
        await seedCanvasState(page, [card]);
        // A medium fixture changes the initial entry bounds. Let React Flow's
        // fit finish before clicking the passive card's selection shield.
        await fitView(page);
        const node = nodeById(page, card.id);
        await selectNode(node);
        await expect(node).toHaveClass(/\bselected\b/);
        await setTitle(node, 'Second title');
        await setTitle(node, 'Final title');
        const description = node.locator('textarea[placeholder="Add description..."]');
        await description.fill('A local description that must persist.');
        await clickEmptyCanvas(page);
        const before = await waitForCanvasState(page, s => nodeByLabel(s, 'Final title')?.data?.description === 'A local description that must persist.', 'committed description');
        expect(JSON.stringify(before.nodes[0].data?.content)).toContain('Body of card 0');
        expect(before.nodes[0].data?.metadata).toEqual({ source: 'qa-fixture' });
        await page.screenshot({ path: testInfo.outputPath('renamed-description.png') });

        await reload(page);
        const after = await waitForCanvasState(page, s => Boolean(nodeByLabel(s, 'Final title')), 'saved title');
        expect(after.nodes[0].data?.description).toBe('A local description that must persist.');
        expect(after.nodes[0].data?.content).toEqual(before.nodes[0].data?.content);
        expect(after.nodes[0].data?.metadata).toEqual(before.nodes[0].data?.metadata);
    });

    test('SCRUM-71 duplicate has independent title, body and identity; deletion keeps original', async ({ page }, testInfo) => {
        await openCanvas(page);
        const original = makeCards(1, 'Original')[0];
        await seedCanvasState(page, [original]);
        await selectNode(nodeById(page, original.id));
        await blurEditor(page);
        await page.keyboard.press('Control+d');
        const doubled = await waitForCanvasState(page, s => s.nodes.length === 2, 'duplicate');
        const copy = doubled.nodes.find(n => n.id !== original.id)!;
        expect(copy.data?.label).toBe(original.data?.label);
        expect((copy.data?.content as Array<{ id: string }>)[0].id).not.toBe((original.data?.content as Array<{ id: string }>)[0].id);
        await selectNode(nodeById(page, copy.id));
        await setTitle(nodeById(page, copy.id), 'Edited copy');
        const copyEditor = await focusEditor(page, nodeById(page, copy.id));
        await copyEditor.press('End');
        await page.keyboard.type(' only in duplicate');
        await clickEmptyCanvas(page);
        const edited = await waitForCanvasState(page, s => Boolean(nodeByLabel(s, 'Edited copy')), 'edited copy');
        expect(JSON.stringify(edited.nodes.find(n => n.id === copy.id)?.data?.content)).toContain('only in duplicate');
        expect(JSON.stringify(edited.nodes.find(n => n.id === original.id)?.data?.content)).not.toContain('only in duplicate');
        await page.screenshot({ path: testInfo.outputPath('independent-duplicate.png') });

        await selectNode(nodeById(page, copy.id));
        await blurEditor(page);
        await page.keyboard.press('Delete');
        await confirmNodeDeletion(page);
        const remaining = await waitForCanvasState(page, s => s.nodes.length === 1, 'copy deleted');
        expect(remaining.nodes[0].id).toBe(original.id);
        expect(remaining.nodes[0].data?.content).toEqual(original.data?.content);
    });

    test('SCRUM-71 toolbar duplicate remaps an entire nested branch and its links', async ({ page }, testInfo) => {
        await openCanvas(page);
        const [root, child, grandchild] = makeCards(3, 'Copy branch');
        child.parentId = root.id;
        grandchild.parentId = child.id;
        root.data = { ...root.data, content: [{ id: 'page-link', type: 'page', content: 'Child', metadata: { nodeId: child.id } }] };
        await seedCanvasState(page, [root, child, grandchild], [
            { id: 'branch-edge', source: child.id, target: grandchild.id, data: { parentId: root.id } },
        ]);
        await selectNode(nodeById(page, root.id));
        await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
        const state = await waitForCanvasState(page, s => s.nodes.length === 6, 'duplicated branch');
        const copyRoot = state.nodes.find(n => n.id !== root.id && !n.parentId)!;
        const copyChild = state.nodes.find(n => n.parentId === copyRoot.id)!;
        const copyGrandchild = state.nodes.find(n => n.parentId === copyChild.id)!;
        expect(copyGrandchild.id).not.toBe(grandchild.id);
        expect(JSON.stringify(copyRoot.data?.content)).toContain(copyChild.id);
        expect(JSON.stringify(copyRoot.data?.content)).not.toContain(`"nodeId":"${child.id}"`);
        expect(state.edges).toHaveLength(2);
        expect(state.edges.some(e => e.source === copyChild.id && e.target === copyGrandchild.id)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('duplicated-branch.png') });
        await selectNode(nodeById(page, copyRoot.id));
        await blurEditor(page);
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await confirmNodeDeletion(page);
        const remaining = await waitForCanvasState(page, s => s.nodes.length === 3, 'copy branch deletion');
        expect(remaining.nodes.map(n => n.id).sort()).toEqual([root.id, child.id, grandchild.id].sort());
        expect(remaining.edges[0].id).toBe('branch-edge');
    });

    test('SCRUM-72 nested deletion shows impact, cancellation preserves data, Undo restores edges', async ({ page }, testInfo) => {
        await openCanvas(page);
        const [root, child, grandchild, sibling] = makeCards(4, 'Branch');
        child.parentId = root.id;
        grandchild.parentId = child.id;
        const edges = [
            { id: 'root-sibling', source: root.id, target: sibling.id },
            { id: 'child-grandchild', source: child.id, target: grandchild.id },
        ];
        await seedCanvasState(page, [root, child, grandchild, sibling], edges);
        const rootNode = nodeById(page, root.id);
        await selectNode(rootNode);
        await blurEditor(page);
        await page.keyboard.press('Delete');
        const dialog = page.getByRole('alertdialog', { name: 'Delete this knowledge branch?' });
        await expect(dialog).toContainText('1 selected card and 2 nested cards');
        await expect(dialog.getByRole('button', { name: 'Delete 3 cards' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Keep cards' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        expect((await readCanvasState(page))?.nodes).toHaveLength(4);
        await selectNode(rootNode);
        await blurEditor(page);
        await page.keyboard.press('Delete');
        await dialog.getByRole('button', { name: 'Keep cards' }).click();
        expect((await readCanvasState(page))?.nodes).toHaveLength(4);

        await selectNode(rootNode);
        await blurEditor(page);
        await page.keyboard.press('Delete');
        await expect(dialog).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('nested-delete-confirmation.png') });
        await dialog.getByRole('button', { name: 'Delete 3 cards' }).click();
        const deleted = await waitForCanvasState(page, s => s.nodes.length === 1, 'branch deletion');
        expect(deleted.nodes[0].id).toBe(sibling.id);
        expect(deleted.edges).toHaveLength(0);
        await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
        const restored = await waitForCanvasState(page, s => s.nodes.length === 4 && s.edges.length === 2, 'branch undo');
        expect(restored.nodes.find(n => n.id === grandchild.id)?.parentId).toBe(child.id);
        await waitForLocalSave(page);
        await reload(page);
        const persisted = await readCanvasState(page);
        expect(persisted?.nodes).toHaveLength(4);
        expect(persisted?.edges).toHaveLength(2);
    });

    test('SCRUM-73 hover resize works without selection and persists body and nested parent', async ({ page }, testInfo) => {
        await openCanvas(page);
        const [root, child] = makeCards(2, 'Resize');
        child.parentId = root.id;
        await seedCanvasState(page, [root, child]);
        await fitView(page);
        const node = nodeById(page, root.id);
        await node.hover();
        const handle = node.getByTitle('Drag to resize · double-click to fit content');
        await expect(handle).toBeVisible();
        await expect(handle).toHaveCSS('opacity', '1');
        await expect(node).not.toHaveClass(/selected/);
        await page.screenshot({ path: testInfo.outputPath('hover-resize.png') });
        const box = (await handle.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 100, y + 70, { steps: 8 });
        await page.mouse.up();
        const resized = await waitForCanvasState(page, s => (s.nodes.find(n => n.id === root.id)?.style?.width ?? 0) > 432, 'larger card');
        const size = resized.nodes.find(n => n.id === root.id)!.style!;
        expect(size.width).toBeGreaterThanOrEqual(432);
        expect(size.height).toBeGreaterThanOrEqual(432);
        expect(size.width).toBeLessThanOrEqual(656);
        expect(size.height).toBeLessThanOrEqual(1104);
        expect(resized.nodes.find(n => n.id === root.id)?.data?.content).toEqual(root.data?.content);
        expect(resized.nodes.find(n => n.id === child.id)?.parentId).toBe(root.id);
        await page.screenshot({ path: testInfo.outputPath('resized-card.png') });
        await reload(page);
        const saved = await readCanvasState(page);
        expect(saved?.nodes.find(n => n.id === root.id)?.style).toEqual(size);
        expect(saved?.nodes.find(n => n.id === child.id)?.parentId).toBe(root.id);

        await fitView(page);
        await node.hover();
        const smallStart = (await handle.boundingBox())!;
        const cardBox = (await node.boundingBox())!;
        await page.mouse.move(smallStart.x + smallStart.width / 2, smallStart.y + smallStart.height / 2);
        await page.mouse.down();
        await page.mouse.move(smallStart.x + smallStart.width / 2 - cardBox.width * .9,
            smallStart.y + smallStart.height / 2 - cardBox.height * .9, { steps: 8 });
        await page.mouse.up();
        const minimum = await waitForCanvasState(page, s => s.nodes.find(n => n.id === root.id)?.data?.viewMode === 'icon', 'minimum card size');
        expect(minimum.nodes.find(n => n.id === root.id)?.style).toEqual({ width: 96, height: 96 });
        expect(minimum.nodes.find(n => n.id === root.id)?.data?.content).toEqual(root.data?.content);
        await node.hover();
        await handle.dblclick();
        const fitted = await waitForCanvasState(page, s => s.nodes.find(n => n.id === root.id)?.data?.viewMode === 'expanded', 'fit to body');
        expect(fitted.nodes.find(n => n.id === root.id)?.style?.width).toBeGreaterThanOrEqual(432);
        expect(fitted.nodes.find(n => n.id === root.id)?.data?.content).toEqual(root.data?.content);
    });

    test('SCRUM-19 UI standalone text block keeps a readable horizontal line', async ({ page }, testInfo) => {
        await openCanvas(page);
        await page.mouse.move(420, 320);
        await page.keyboard.press('Enter');
        const state = await waitForCanvasState(page, s => s.nodes.some(n => n.type === 'block'), 'new text block');
        const block = state.nodes.find(n => n.type === 'block')!;
        const node = nodeById(page, block.id);
        const editor = node.locator('[contenteditable="true"]').first();
        await expect(editor).toBeVisible();
        await editor.fill('Readable text stays on a line');
        await waitForCanvasState(page, s => JSON.stringify(s.nodes.find(n => n.id === block.id)?.data?.content).includes('Readable text stays on a line'), 'typed block text');
        const content = node.locator('[class*="blockContent"]').first();
        await expect.poll(async () => content.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBeGreaterThan(120);
        expect(await editor.evaluate(el => Math.round(el.getBoundingClientRect().height))).toBeLessThan(90);
        await page.screenshot({ path: testInfo.outputPath('readable-text-block.png') });
    });
});
