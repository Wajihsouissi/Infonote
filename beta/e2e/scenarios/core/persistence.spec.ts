import { test, expect } from '../../support/fixtures';
import { addNote, deleteNode, focusEditor, openCanvas, reload, clickEmptyCanvas, nodeById } from '../../support/canvas';
import { cards, nodeByLabel, nodeText, seedCanvasState, waitForCanvasState } from '../../support/canvasState';

async function readAnonymousLocalNodeIds(page: import('@playwright/test').Page): Promise<string[]> {
    return page.evaluate(async () => {
        const path = '/src/services/storage/LocalWorkspaceStore.ts';
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
