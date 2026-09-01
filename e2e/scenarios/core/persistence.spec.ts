import { test, expect } from '../../support/fixtures';
import { addNote, deleteNode, focusEditor, openCanvas, reload, typeBlock, clickEmptyCanvas, nodeById } from '../../support/canvas';
import { cards, nodeByLabel, nodeText, waitForCanvasState } from '../../support/canvasState';

/**
 * QA scenarios A1 / A3 — "can I trust this app?".
 *
 * Saving is explicit: anonymous work remains available for the active session,
 * while a folder or signed-in workspace provides persistence across reloads.
 */

test.describe('core: persistence (A)', () => {
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
        const before = await waitForCanvasState(page, (s) => s.nodes.length > 0, 'seed cards');
        const victim = before.nodes[0];

        await deleteNode(page, nodeById(page, victim.id));

        await waitForCanvasState(page, (s) => !s.nodes.some((n) => n.id === victim.id), 'the card to be removed');
        const after = await waitForCanvasState(page, (s) => !s.nodes.some((n) => n.id === victim.id), 'the current canvas after deletion');
        expect(after.nodes.some((n) => n.id === victim.id)).toBe(false);
    });

    test('A3 unsaved anonymous work is not restored by a hidden local snapshot', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Crash test');
        await focusEditor(page, node);

        await typeBlock(page, 'First line survives');
        await page.keyboard.type('Second line typed right before the tab dies');

        await clickEmptyCanvas(page);
        await waitForCanvasState(page, (state) => !!nodeByLabel(state, 'Crash test'), 'the unsaved card');
        await reload(page);
        const reloaded = await waitForCanvasState(page, (state) => state.nodes.length > 0, 'the reloaded canvas');
        expect(nodeByLabel(reloaded, 'Crash test')).toBeUndefined();
    });

    test('A-limit anonymous card quota blocks creation and explains itself', async ({ page }) => {
        await openCanvas(page);
        const badge = page.getByText(/\d+\/\d+ cards/);
        await expect(badge).toBeVisible();

        // The badge is the product's own count; read the cap from it rather
        // than hardcoding a number the code may move.
        const [, usedRaw, capRaw] = (await badge.innerText()).match(/(\d+)\/(\d+) cards/)!;
        const cap = Number(capRaw);
        let used = Number(usedRaw);

        // Drive right up to the cap through the real creation path.
        while (used < cap) {
            await page.keyboard.press('Control+n');
            await page.waitForTimeout(250);
            used = Number((await badge.innerText()).match(/(\d+)\//)![1]);
            if (used >= cap) break;
        }

        const snapAtCap = await waitForCanvasState(page, (s) => cards(s).length >= cap, 'the card quota to fill');
        const countAtCap = cards(snapAtCap).length;

        // One more must be refused with an explanation, not silently dropped.
        await page.keyboard.press('Control+n');
        await page.waitForTimeout(1200);

        const notice = page.getByText(/limit|sign in/i).first();
        await expect(notice, 'no limit notice shown when the card quota was exceeded').toBeVisible();

        const after = await waitForCanvasState(page, () => true, 'post-limit state');
        expect(cards(after).length, 'a card was created past the anonymous quota').toBe(countAtCap);
    });
});
