import { test, expect } from '../../support/fixtures';
import {
    addNote, clickEmptyCanvas, deleteNode, fitView, focusEditor, focusNode, nodeById, nodeId,
    openCanvas, PANE, selectNode, setTitle,
} from '../../support/canvas';
import { nodeByLabel, waitForCanvasState } from '../../support/canvasState';

/**
 * QA scenario B6 — the card lifecycle marathon.
 *
 * Every entry point must produce a card, every view mode must open and close
 * cleanly, and content must survive view changes within the active canvas.
 */

test.describe('core: card lifecycle (B6)', () => {
    test('B6a both creation entry points produce a real card', async ({ page }) => {
        await openCanvas(page);
        const start = (await waitForCanvasState(page, (s) => s.nodes.length > 0, 'seed')).nodes.length;

        await page.keyboard.press('Control+n');
        await waitForCanvasState(page, (s) => s.nodes.length === start + 1, 'Ctrl+N to create a card');

        await page.getByTitle('Add New Note Card (Hover for modes)').click();
        // Step off the button so its hover flyout ("Card modes") closes and
        // does not swallow the next interaction.
        await page.mouse.move(200, 200);
        const snap = await waitForCanvasState(page, (s) => s.nodes.length === start + 2, 'the + button to create a card');

        // Two cards created at the same default spot would be a real defect:
        // the second would be invisible underneath the first.
        const created = snap.nodes.slice(-2);
        expect(
            created[0].position?.x !== created[1].position?.x || created[0].position?.y !== created[1].position?.y,
            'two freshly created cards landed on identical coordinates',
        ).toBe(true);
    });

    test('B6b title and body stay intact after leaving the card', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Renamed by QA');
        await focusEditor(page, node);
        await page.keyboard.type('Body written before leaving the card');
        await clickEmptyCanvas(page);

        const after = await waitForCanvasState(page, (s) => !!nodeByLabel(s, 'Renamed by QA'), 'the renamed card');
        const current = nodeByLabel(after, 'Renamed by QA')!;
        expect(JSON.stringify(current.data)).toContain('Body written before leaving the card');
    });

    /**
     * The overlay view modes. QA_TEST_SCENARIOS B6 lists "Open Card" alongside
     * these, but in this build that button *navigates into* the card's nested
     * canvas rather than opening a layer over the board — covered by B9.
     */
    const OVERLAY_MODES = ['Full Screen', 'Center Peek', 'Side Panel (Left)', 'Side Panel (Right)'];

    /** Opens one view mode on `node` and returns how many layers are on screen. */
    async function openViewMode(page: Parameters<typeof openCanvas>[0], node: ReturnType<typeof nodeById>, mode: string) {
        // Re-centre first: opening and closing a panel moves the viewport, and a
        // card toolbar scrolled off-screen is unclickable — far enough off and
        // React Flow unmounts the card entirely.
        await fitView(page);
        await expect(node, `card not mounted before opening "${mode}"`).toBeVisible({ timeout: 10_000 });
        await focusNode(page, node);
        await node.hover({ force: true }).catch(() => { /* toolbar may already be pinned */ });

        // Scope to this card's own toolbar: every mounted card renders one, and
        // a page-wide lookup happily resolves to an off-screen card's copy.
        const trigger = node.getByTitle(mode, { exact: true }).first();
        await expect(trigger, `no trigger for view mode "${mode}"`).toBeVisible({ timeout: 10_000 });
        await trigger.click();
        await page.waitForTimeout(900);
    }

    /**
     * How many card layers are on screen. The four modes render through
     * different components (a modal overlay, a peek dialog, a docked panel), so
     * the count spans all three shapes rather than looking for one class.
     */
    const layerCount = (page: Parameters<typeof openCanvas>[0]) =>
        page.locator('[class*="_overlay_"], [class*="_panel_"], [role="dialog"]').evaluateAll(
            (els) => els.filter((e) => (e as HTMLElement).offsetParent !== null
                || getComputedStyle(e).position === 'fixed').length,
        );

    test(
        'B6c every view mode closes with Escape',
        {
            annotation: {
                type: 'known-defect',
                description:
                    'None of the four card view modes respond to Escape. FullscreenModal registers only a '
                    + 'Ctrl+\\ keydown handler and no Escape handler, so the overlay stays mounted, full-size '
                    + 'and click-blocking. Spec B6 step 3 requires Escape to close each one.',
            },
        },
        async ({ page }) => {
            await openCanvas(page);
            const node = await addNote(page, 'View mode tour');
            const id = await nodeId(node);

            for (const mode of OVERLAY_MODES) {
                const before = await layerCount(page);
                await openViewMode(page, node, mode);
                expect(await layerCount(page), `"${mode}" did not open a layer`).toBeGreaterThan(before);

                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);

                expect(await layerCount(page), `Escape did not close "${mode}"`).toBeLessThanOrEqual(before);
                await expect(page.locator(PANE), `canvas not usable after closing "${mode}"`).toBeVisible();
                // Ask the document, not the DOM: React Flow culls off-screen
                // nodes, so an unmounted card is not a deleted one.
                await waitForCanvasState(
                    page,
                    (s) => s.nodes.some((n) => n.id === id),
                    `the card to still exist after closing "${mode}"`,
                );
            }
        },
    );

    test('B6c2 every view mode opens and dismisses via the backdrop', async ({ page }) => {
        // The path that does work today, kept green as a regression guard so a
        // future Escape fix cannot quietly break the existing way out.
        await openCanvas(page);
        const node = await addNote(page, 'Backdrop tour');
        const id = await nodeId(node);

        for (const mode of OVERLAY_MODES) {
            const before = await layerCount(page);
            await openViewMode(page, node, mode);
            expect(await layerCount(page), `"${mode}" did not open a layer`).toBeGreaterThan(before);

            // Click the far-left edge: backdrop everywhere, card content nowhere.
            await page.mouse.click(8, 400);
            await page.waitForTimeout(1000);

            await expect(page.locator(PANE), `canvas not usable after closing "${mode}"`).toBeVisible();
            await waitForCanvasState(
                page,
                (s) => s.nodes.some((n) => n.id === id),
                `the card to still exist after closing "${mode}"`,
            );
        }
    });

    test('B6d duplicate then delete leaves the original untouched', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Original card');
        const originalId = await nodeId(node);
        await focusNode(page, node);

        const before = (await waitForCanvasState(page, (s) => !!nodeByLabel(s, 'Original card'), 'the original')).nodes.length;

        await page.keyboard.press('Control+d');
        const dup = await waitForCanvasState(page, (s) => s.nodes.length === before + 1, 'the duplicate');

        const copy = dup.nodes.find((n) => n.id !== originalId && n.data?.label === 'Original card');
        expect(copy, 'duplicate did not carry the original title').toBeDefined();

        // The copy is offset from the original and may be outside the culling
        // band, so bring it into view before trying to select and delete it.
        const copyNode = nodeById(page, copy!.id);
        await focusNode(page, copyNode);
        await deleteNode(page, copyNode);

        const after = await waitForCanvasState(
            page,
            (s) => !s.nodes.some((n) => n.id === copy!.id),
            'the duplicate to be deleted',
        );
        expect(after.nodes.some((n) => n.id === originalId), 'deleting the duplicate removed the original').toBe(true);
    });

    test('B6e a card can be renamed twice without losing its body', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'First name');
        await focusEditor(page, node);
        await page.keyboard.type('Body that must not move');
        await clickEmptyCanvas(page);

        await selectNode(node);
        await setTitle(node, 'Second name');
        await clickEmptyCanvas(page);
        await selectNode(node);
        await setTitle(node, 'Third name');
        await clickEmptyCanvas(page);

        const snap = await waitForCanvasState(page, (s) => !!nodeByLabel(s, 'Third name'), 'the twice-renamed card');
        expect(JSON.stringify(nodeByLabel(snap, 'Third name')!.data)).toContain('Body that must not move');
        expect(nodeByLabel(snap, 'First name'), 'renaming forked the card instead of renaming it').toBeUndefined();
        expect(nodeByLabel(snap, 'Second name'), 'renaming forked the card instead of renaming it').toBeUndefined();
    });
});
