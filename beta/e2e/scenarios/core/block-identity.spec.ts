import { test, expect } from '../../support/fixtures';
import { openCanvas, nodeById, selectNode } from '../../support/canvas';
import { readCanvasState, seedCanvasState } from '../../support/canvasState';

test('saved duplicate block identities recover every occurrence, persist once and remain stable after reload', async ({ page }) => {
    await openCanvas(page);
    await page.evaluate(async () => {
        const path = '/src/services/storage/workspace/LocalWorkspaceStore.ts';
        const local = await import(/* @vite-ignore */ path);
        await local.saveLocalWorkspace({ key: local.LOCAL_WORKSPACE_KEY, updatedAt: 1, edges: [], nodes: [{
            id: 'legacy-identities', type: 'note', position: { x: 0, y: 0 }, style: { width: 432, height: 500 },
            data: { label: 'Legacy identities', viewMode: 'expanded', content: Array.from({ length: 48 }, (_, i) => ({
                id: 'repeated-identity', type: 'text', content: `Preserved occurrence ${i}`,
            })) },
        }] });
    });
    await page.reload();
    const card = nodeById(page, 'legacy-identities');
    await expect(card).toBeVisible();
    const restored = (await readCanvasState(page))!.nodes[0].data!.content as { id: string; content: string }[];
    expect(restored).toHaveLength(48);
    expect(new Set(restored.map(block => block.id)).size).toBe(48);
    expect(restored[0].id).toBe('repeated-identity');
    expect(restored.map(block => block.content)).toEqual(Array.from({ length: 48 }, (_, i) => `Preserved occurrence ${i}`));
    await expect(card.locator('[data-block-id]')).toHaveCount(48);
    await expect.poll(() => page.evaluate(async () => {
        const path = '/src/services/storage/workspace/LocalWorkspaceStore.ts';
        const local = await import(/* @vite-ignore */ path);
        const saved = await local.loadLocalWorkspace(local.LOCAL_WORKSPACE_KEY);
        return saved.nodes[0].data.content.map((block: { id: string }) => block.id);
    })).toEqual(restored.map(block => block.id));
    await page.reload();
    await expect(card).toBeVisible();
    expect((await readCanvasState(page))!.nodes[0].data!.content).toEqual(restored);
});

test('creation, content replacement and card fusion preserve distinct occurrences with unique ids', async ({ page }) => {
    await openCanvas(page);
    const result = await page.evaluate(async () => {
        const path = '/src/store/useStore.ts';
        const { useStore } = await import(/* @vite-ignore */ path);
        const state = () => useStore.getState();
        state().loadGraph([], []);
        state().addNode('block', { x: 0, y: 0 }, { content: [{ id: 'shared', type: 'text', content: 'First occurrence' }] }, undefined, undefined, 'first');
        state().addNode('block', { x: 500, y: 0 }, { content: [{ id: 'shared', type: 'text', content: 'Second occurrence' }] }, undefined, undefined, 'second');
        state().fuseNodes(['first', 'second'], true);
        const fused = state().nodes.find((node: { type: string }) => node.type === 'fused-note');
        const combined = fused.data.content;
        state().updateNodeData(fused.id, { content: [
            { id: 'replacement', type: 'text', content: 'Updated first' },
            { id: 'replacement', type: 'text', content: 'Updated second' },
        ] });
        const replaced = state().nodes.find((node: { id: string }) => node.id === fused.id).data.content;
        state().addNode('note', { x: 1000, y: 0 }, { content: [
            { id: 'creation', type: 'text', content: 'New first' }, { id: 'creation', type: 'text', content: 'New second' },
        ] });
        const created = state().nodes.find((node: { type: string }) => node.type === 'note').data.content;
        return { combined, replaced, created };
    });
    for (const content of Object.values(result)) {
        expect(content).toHaveLength(2);
        expect(new Set(content.map((block: { id: string }) => block.id)).size).toBe(2);
    }
    expect(result.combined.map((block: { content: string }) => block.content)).toEqual(['First occurrence', 'Second occurrence']);
    expect(result.replaced.map((block: { content: string }) => block.content)).toEqual(['Updated first', 'Updated second']);
});

test('parent synchronization repairs overlapping card identities before ordering and converges', async ({ page }) => {
    await openCanvas(page);
    const result = await page.evaluate(async () => {
        const path = '/src/store/useStore.ts';
        const { useStore } = await import(/* @vite-ignore */ path);
        const state = () => useStore.getState();
        const first = { id: 'shared-source', type: 'text', content: 'Original idea' };
        const second = { ...first, content: 'Copied idea with different text' };
        state().loadGraph([
            { id: 'parent', type: 'note', position: { x: 0, y: 0 }, data: { content: [first], hasNestedCanvasSync: true, nestedCanvasSync: 'synced' } },
            { id: 'child-a', type: 'block', parentId: 'parent', position: { x: 0, y: 0 }, data: { content: [first] } },
            { id: 'child-b', type: 'block', parentId: 'parent', position: { x: 500, y: 0 }, data: { content: [second] } },
        ], []);
        state().syncParentContent('parent');
        const snapshot = () => state().nodes.map((node: { id: string; data: { content: unknown } }) => ({ id: node.id, content: node.data.content }));
        const once = snapshot();
        state().syncParentContent('parent');
        return { once, twice: snapshot() };
    });
    expect(result.twice).toEqual(result.once);
    const parent = result.once.find((node: { id: string }) => node.id === 'parent')!.content as { id: string; content: string }[];
    expect(parent.map((block: { content: string }) => block.content)).toEqual(['Original idea', 'Copied idea with different text']);
    expect(new Set(parent.map((block: { id: string }) => block.id)).size).toBe(2);
    const children = result.once.filter((node: { id: string }) => node.id !== 'parent').flatMap((node: { content: unknown }) => node.content as { id: string }[]);
    expect(children.map((block: { id: string }) => block.id)).toEqual(parent.map((block: { id: string }) => block.id));
});

test('keyboard duplication clones nested identities and publishes the rendered document', async ({ page }) => {
    await openCanvas(page);
    await seedCanvasState(page, [{ id: 'duplicate-note', type: 'note', position: { x: 0, y: 0 }, style: { width: 432, height: 500 }, data: {
        label: 'Duplicate test', viewMode: 'expanded', content: [{ id: 'duplicate-root', type: 'text', content: 'Duplicate this paragraph',
            metadata: { blocks: [{ id: 'nested-source', type: 'text', content: 'Nested content retained' }] } }],
    } }]);
    const card = nodeById(page, 'duplicate-note');
    await selectNode(card);
    await expect(card.locator('[data-chnk-it-block-editor]')).toHaveCount(1);
    await card.locator('[data-block-id="duplicate-root"] [contenteditable="true"]').first().click();
    await page.keyboard.press('Control+d');
    await expect.poll(async () => ((await readCanvasState(page))!.nodes[0].data!.content as unknown[]).length).toBe(2);
    const content = (await readCanvasState(page))!.nodes[0].data!.content as { id: string; content: string; metadata: { blocks: { id: string; content: string }[] } }[];
    expect(content.map(block => block.content)).toEqual(['Duplicate this paragraph', 'Duplicate this paragraph']);
    expect(content[0].metadata.blocks[0].content).toBe(content[1].metadata.blocks[0].content);
    expect(content[0].metadata.blocks[0].id).not.toBe(content[1].metadata.blocks[0].id);
    expect(await card.locator('[data-chnk-it-block-editor] [data-block-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-block-id')))).toEqual(content.map(block => block.id));
});
