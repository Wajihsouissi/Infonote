import { test, expect } from '../../support/fixtures';
import { addNote, clickEmptyCanvas, focusEditor, openCanvas, selectNode } from '../../support/canvas';
import { nodeByLabel, nodeText, waitForCanvasState } from '../../support/canvasState';

/**
 * QA scenario I40 (2) — stored XSS through card content.
 *
 * This is the highest-severity class of bug in this product: card content is
 * synced to collaborators, so anything that executes in the author's browser
 * executes in theirs too. Payloads must come back as literal text, on first
 * render and after leaving and re-entering the card.
 */

const PAYLOADS = [
    '<script>window.__xss = 1</script>',
    '<img src=x onerror="window.__xss = 1">',
    '<svg onload="window.__xss = 1"></svg>',
    '<iframe src="javascript:window.__xss=1"></iframe>',
];

/**
 * Fails the test if a payload manages to open a script dialog.
 *
 * `beforeunload` is deliberately excluded: the app registers an unsaved-work
 * warning by design, and attaching any dialog listener stops Playwright
 * auto-dismissing it. Treating that as an XSS hit would be a false positive.
 */
async function trapScriptDialogs(dialog: import('@playwright/test').Dialog) {
    const type = dialog.type();
    if (type === 'beforeunload') {
        // Accept, not dismiss: a storage backend may warn before leaving the
        // page, and this listener must not turn that product warning into XSS.
        await dialog.accept().catch(() => { /* already handled */ });
        return;
    }
    await dialog.dismiss().catch(() => { /* already handled */ });
    throw new Error(`A payload opened a ${type} dialog: ${dialog.message()}`);
}

/** Fails if anything on the page executed script or opened a dialog. */
async function assertNothingExecuted(page: Parameters<typeof openCanvas>[0]) {
    expect(
        await page.evaluate(() => (window as unknown as { __xss?: number }).__xss ?? null),
        'card content executed script — a payload escaped the editor',
    ).toBeNull();
    expect(
        await page.locator('script:not([src]):not([type])').evaluateAll(
            (els) => els.filter((e) => e.textContent?.includes('__xss')).length,
        ),
        'a payload was injected into the page as a live <script> element',
    ).toBe(0);
}

test.describe('advanced: security (I40)', () => {
    test('I40 script payloads typed into a block never execute', async ({ page }) => {
        // A dialog would mean a payload ran; fail loudly instead of hanging.
        page.on('dialog', trapScriptDialogs);

        await openCanvas(page);
        const node = await addNote(page, 'XSS attempt');
        await focusEditor(page, node);

        for (const payload of PAYLOADS) {
            await page.keyboard.type(payload);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(120);
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);

        await assertNothingExecuted(page);

        await clickEmptyCanvas(page);
        const snap = await waitForCanvasState(
            page,
            (s) => nodeText(nodeByLabel(s, 'XSS attempt') ?? { id: '' }).includes('__xss'),
            'the payloads to be stored',
        );
        // Stored as data is fine and expected — executing is not.
        expect(nodeText(nodeByLabel(snap, 'XSS attempt')!)).toContain('script');

        // The dangerous half: does it execute when rendered fresh after the
        // card is reselected?
        await selectNode(node);
        await page.waitForTimeout(1500);
        await assertNothingExecuted(page);

        // And the payload must be readable as text, not silently swallowed.
        await expect(node).toContainText('script');
    });

    test('I40b a javascript: URL is not turned into a live link', async ({ page }) => {
        page.on('dialog', trapScriptDialogs);

        await openCanvas(page);
        const node = await addNote(page, 'Link payload');
        await focusEditor(page, node);
        await page.keyboard.type('javascript:window.__xss=1');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);

        const dangerous = await node.locator('a[href^="javascript:"]').count();
        expect(dangerous, 'a javascript: URL was rendered as a clickable link').toBe(0);
        await assertNothingExecuted(page);
    });
});
