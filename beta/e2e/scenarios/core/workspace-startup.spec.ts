import { test, expect } from '../../support/fixtures';
import { readFile } from 'node:fs/promises';

const STORE = '/src/services/storage/workspace/LocalWorkspaceStore.ts';

async function saveCorruptWorkspace(page: import('@playwright/test').Page) {
    await page.goto('/recovery');
    await expect(page.getByRole('heading', { name: 'Workspace recovery', exact: true })).toBeVisible();
    await page.evaluate(async path => {
        const local = await import(/* @vite-ignore */ path);
        const blank = { id: 'blank', type: 'text', content: '' };
        const content = [{ id: 'same', type: 'text', content: 'Original saved paragraph' }, ...Array(20000).fill(blank),
            { id: 'same', type: 'text', content: 'Distinct paragraph with colliding ID', metadata: { arbitrary: 'preserved' } }];
        await local.saveLocalWorkspace({ key: 'anonymous', updatedAt: 123456, edges: [], nodes: [{
            id: 'recovered-card', type: 'note', position: { x: 100, y: 100 }, style: { width: 432, height: 432 },
            data: { label: 'Recovered saved work', content, viewMode: 'expanded', customField: 'kept' },
        }] });
    }, STORE);
}

test('saved repeated references open, retain all distinct work, save and survive two reloads', async ({ page }, testInfo) => {
    await saveCorruptWorkspace(page);
    await page.goto('/canvas');
    await expect(page.getByRole('button', { name: 'Add new note card', exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.react-flow__node input').filter({ visible: true }).first()).toHaveValue('Recovered saved work');
    await expect(page.getByText('Opening your workspace', { exact: true })).toHaveCount(0);
    const read = () => page.evaluate(async path => {
        const local = await import(/* @vite-ignore */ path);
        const graph = await local.loadLocalWorkspace('anonymous');
        const { content, _contentRecovery: recovery, customField } = graph.nodes[0].data;
        return { count: graph.nodes.length, ids: content.map((b: {id:string}) => b.id),
            text: content.map((b: {content:string}) => b.content), customField,
            recovery: { originalLength: recovery.originalLength, counts: recovery.runs.map((r: {count:number}) => r.count) } };
    }, STORE);
    await expect.poll(async () => (await read()).ids.length).toBe(3);
    const before = await read();
    expect(new Set(before.ids).size).toBe(3);
    expect(before.text).toEqual(['Original saved paragraph', '', 'Distinct paragraph with colliding ID']);
    expect(before.customField).toBe('kept');
    expect(before.recovery).toEqual({ originalLength: 20002, counts: [1, 20000, 1] });
    for (let i = 0; i < 2; i++) {
        await page.reload();
        await expect(page.getByRole('button', { name: 'Add new note card', exact: true })).toBeVisible({ timeout: 30000 });
        await expect(page.locator('.react-flow__node input').filter({ visible: true }).first()).toHaveValue('Recovered saved work');
        expect(await read()).toEqual(before);
    }
    await page.screenshot({ path: testInfo.outputPath('recovered-canvas.png') });
    await testInfo.attach('recovered-structure', { body: JSON.stringify(before, null, 2), contentType: 'application/json' });
});

test('recovery exports raw corrupt storage as lossless runs without starting canvas or autosave', async ({ page }, testInfo) => {
    await saveCorruptWorkspace(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Download saved backup' })).toBeEnabled();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download saved backup' }).click();
    const file = await download;
    const backup = JSON.parse(await readFile((await file.path())!, 'utf8'));
    expect(backup.nodes).toHaveLength(1);
    expect(backup.nodes[0].data.content).toHaveLength(3);
    expect(backup.nodes[0].data._contentRecovery.originalLength).toBe(20002);
    expect(backup.nodes[0].data._contentRecovery.runs.map((run: {count:number}) => run.count)).toEqual([1, 20000, 1]);
    const savedLength = await page.evaluate(async path => {
        const local = await import(/* @vite-ignore */ path);
        return (await local.loadLocalWorkspace('anonymous')).nodes[0].data.content.length;
    }, STORE);
    expect(savedLength, 'export must not overwrite saved browser data').toBe(20002);
    await page.screenshot({ path: testInfo.outputPath('recovery-export.png') });
});
