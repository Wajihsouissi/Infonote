import { test, expect } from '../../support/fixtures';
import { addNote, deleteNode, focusEditor, openCanvas, reload, clickEmptyCanvas, nodeById } from '../../support/canvas';
import { cards, nodeByLabel, nodeText, seedCanvasState, waitForCanvasState } from '../../support/canvasState';

async function readAnonymousLocalNodeIds(page: import('@playwright/test').Page): Promise<string[]> {
    return page.evaluate(async () => {
        const path = '/src/services/storage/workspace/LocalWorkspaceStore.ts';
        const record = await (await import(path)).loadLocalWorkspace('anonymous');
        return record?.nodes.map((node: { id: string }) => node.id) ?? [];
    });
}

/**
 * QA scenarios A1 / A3 — "can I trust this app?".
 *
 * Every workspace is local-first: anonymous work persists on this device,
 * while an optional signed-in cloud mirror makes it portable.
 */

test.describe('core: persistence (A)', () => {
    test('the first edit after reload writes one changed node and preserves the others', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, Array.from({ length: 3 }, (_, i) => ({
            id: `incremental-${i}`, type: 'note', position: { x: i * 500, y: 100 },
            style: { width: 432, height: 432 }, data: {
                label: `Incremental ${i}`, viewMode: 'expanded',
                content: [{ id: `incremental-body-${i}`, type: 'text', content: `Unchanged body ${i}` }],
            },
        })));
        const dirty = () => page.evaluate(() => {
            const store = (window as unknown as { __appStore: { getState(): { storage: { isLocalDirty: boolean } } } }).__appStore;
            return store.getState().storage.isLocalDirty;
        });
        await expect.poll(dirty).toBe(false);
        await reload(page);
        await waitForCanvasState(page, s => s.nodes.some(n => n.id === 'incremental-0'), 'the restored graph');
        await page.evaluate(() => {
            const target = window as unknown as { __nodeWrites: string[]; __appStore: { getState(): { updateNodeData(id: string, data: Record<string, unknown>): void } } };
            target.__nodeWrites = [];
            const put = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
                if (this.transaction.db.name === 'infonote-local-workspaces' && this.name === 'workspace-nodes') {
                    target.__nodeWrites.push((args[0] as { id: string }).id);
                }
                return put.apply(this, args);
            };
            target.__appStore.getState().updateNodeData('incremental-0', { label: 'Changed after reload' });
        });
        await expect.poll(() => page.evaluate(() => (window as unknown as { __nodeWrites: string[] }).__nodeWrites.length)).toBeGreaterThan(0);
        await expect.poll(dirty).toBe(false);
        expect(await page.evaluate(() => (window as unknown as { __nodeWrites: string[] }).__nodeWrites)).toEqual(['incremental-0']);
        await reload(page);
        const saved = await waitForCanvasState(page, s => s.nodes.some(n => n.data?.label === 'Changed after reload'), 'the edited label on disk');
        expect(saved.nodes).toHaveLength(3);
        for (let i = 0; i < 3; i++) {
            const data = saved.nodes.find(n => n.id === `incremental-${i}`)!.data;
            expect(data?.content).toEqual([{ id: `incremental-body-${i}`, type: 'text', content: `Unchanged body ${i}` }]);
            expect(data?.label).toBe(i === 0 ? 'Changed after reload' : `Incremental ${i}`);
        }
    });

    test('A0 opening a clean canvas does not mark the workspace unsaved', async ({ page }) => {
        await openCanvas(page);
        // React Flow's measurement and selection writes are not edits.
        await page.waitForTimeout(1500);
        const dirty = await page.evaluate(() => {
            const store = (window as unknown as { __appStore?: { getState: () => { storage: { isLocalDirty: boolean } } } }).__appStore;
            return store?.getState().storage.isLocalDirty ?? null;
        });
        expect(dirty).toBe(false);
    });

    test('A1 anonymous work remains intact during an active session', async ({ page }) => {
        await openCanvas(page);

        const titles = ['Trip planning', 'Reading list', 'Bug triage'];
        const bodies = [
            'Book the flights before the end of the month',
            'Finish the chapter on distributed systems',
            'Reproduce the drag-and-drop regression',
        ];

        for (let i = 0; i < titles.length; i++) {
            const node = await addNote(page, titles[i]);
            await focusEditor(page, node);
            await page.keyboard.type(bodies[i]);
            await clickEmptyCanvas(page);
        }

        await waitForCanvasState(
            page,
            (s) => titles.every((t) => !!nodeByLabel(s, t)),
            'all three new cards in the session',
        );

        const current = await waitForCanvasState(page, (s) => titles.every((title) => !!nodeByLabel(s, title)), 'the current canvas');
        for (let i = 0; i < titles.length; i++) {
            const node = nodeByLabel(current, titles[i]);
            expect(node, `card "${titles[i]}" disappeared during the session`).toBeDefined();
            expect(nodeText(node!), `body text of "${titles[i]}" was lost`).toContain(bodies[i]);
        }
    });

    test('A1b a deleted card stays deleted during the session', async ({ page }) => {
        await openCanvas(page);
        await addNote(page, 'Short-lived');
        const before = await waitForCanvasState(page, (s) => !!nodeByLabel(s, 'Short-lived'), 'the new card');
        const victim = nodeByLabel(before, 'Short-lived')!;

        await deleteNode(page, nodeById(page, victim.id));

        await waitForCanvasState(page, (s) => !s.nodes.some((n) => n.id === victim.id), 'the card to be removed');
        const after = await waitForCanvasState(page, (s) => !s.nodes.some((n) => n.id === victim.id), 'the current canvas after deletion');
        expect(after.nodes.some((n) => n.id === victim.id)).toBe(false);
    });

    test('A3 anonymous work is restored from the local-first workspace', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, [{
            id: 'local-persistence-probe',
            type: 'note',
            position: { x: 120, y: 120 },
            style: { width: 432, height: 432 },
            data: {
                label: 'Crash test',
                content: [{ id: 'probe-block', type: 'text', content: 'First line survives' }],
                viewMode: 'expanded',
            },
        }]);
        await waitForCanvasState(page, (state) => !!nodeByLabel(state, 'Crash test'), 'the unsaved card');
        await expect.poll(async () => (
            await readAnonymousLocalNodeIds(page)
        ).includes('local-persistence-probe'), {
            message: 'the local IndexedDB commit',
            timeout: 10_000,
        }).toBe(true);
        await reload(page);
        expect(await readAnonymousLocalNodeIds(page)).toContain('local-persistence-probe');
        const reloaded = await waitForCanvasState(page, (state) => !!nodeByLabel(state, 'Crash test'), 'the restored local canvas');
        expect(nodeByLabel(reloaded, 'Crash test')).toBeDefined();
        expect(nodeText(nodeByLabel(reloaded, 'Crash test')!)).toContain('First line survives');
    });

    test('an anonymous user can create more than 25 cards', async ({ page }) => {
        await openCanvas(page);
        const before = cards(await waitForCanvasState(page, () => true, 'the initial canvas')).length;

        for (let created = 0; created < 26; created++) {
            await page.keyboard.press('Control+n');
        }

        const after = await waitForCanvasState(
            page,
            (state) => cards(state).length >= before + 26,
            'the 26 cards created without signing in',
        );
        expect(cards(after).length).toBeGreaterThanOrEqual(before + 26);
    });
});
