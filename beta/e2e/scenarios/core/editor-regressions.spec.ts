import { test, expect } from '../../support/fixtures';

// DOM trace snapshots force deferred subtrees to render and stall Firefox at
// this scale. These fixtures retain semantic assertions and failure screenshots.
test.use({ trace: 'off' });

/** Isolated actual editor: no saved workspace or external services. */
test.describe('core: editor regression fixtures', () => {
    test('continuous typing and lifecycle transitions publish pending edits', async ({ page }) => {
        await page.goto('/qa/editor-benchmark.html?blocks=1');
        await page.getByRole('button', { name: 'Run saving regression checks' }).click();
        await expect(page.locator('#document-checks')).toContainText('PASS unmount publishes', { timeout: 10000 });
        await expect(page.locator('#document-checks')).not.toContainText('FAIL');
    });
    test('DOM splits preserve marks, links, highlights and selected text', async ({ page }) => {
        await page.goto('/qa/editor-benchmark.html?blocks=1');
        await page.getByRole('button', { name: 'Run DOM regression checks' }).click();
        await expect(page.locator('#dom-checks')).not.toContainText('FAIL');
        await expect(page.locator('#dom-checks')).toContainText('PASS ==jade|highlight==');
    });
    test('formatted Enter preserves text and balances both halves', async ({ page }) => {
        await page.goto('/qa/editor-benchmark.html?blocks=1&mode=formatted');
        const editors = page.locator('#editor [contenteditable="true"]');
        await editors.first().click();
        await page.keyboard.press('Home');
        for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        await expect(editors).toHaveCount(2);
        await expect(editors.nth(0)).toHaveText('Before bo');
        await expect(editors.nth(1)).toHaveText('ldword after');
        await expect.poll(async () => JSON.parse(await page.locator('#metrics').innerText()).savedBlocks.map((b: { content: string }) => b.content))
            .toEqual(['Before **bo**', '**ldword** after']);
        // The caret is at the start of the new block and typing continues there.
        await page.keyboard.type('X');
        await expect(editors.nth(1)).toHaveText('Xldword after');
    });

    test('an incoming deletion during typing stays deleted', async ({ page }) => {
        await page.goto('/qa/editor-benchmark.html?blocks=5');
        await page.getByLabel('Delete second block during next edit').check();
        const editors = page.locator('#editor [contenteditable="true"]');
        await editors.first().click();
        await page.keyboard.type('x');
        await expect(editors).toHaveCount(4);
        await expect.poll(async () => JSON.parse(await page.locator('#metrics').innerText()).savedHasSecond).toBe(false);
        await expect(editors.last()).toContainText('Paragraph 4.');
    });

    test('independent incoming text edits survive pending local typing', async ({ page }) => {
        await page.goto('/qa/editor-benchmark.html?blocks=5');
        await page.getByLabel('Change second block during next edit').check();
        const editors = page.locator('#editor [contenteditable="true"]');
        await editors.first().click();
        await page.keyboard.type('x');
        await expect(editors.nth(1)).toHaveText('Incoming external second-block edit');
        await expect.poll(async () => JSON.parse(await page.locator('#metrics').innerText()).ownerUpdates).toBeGreaterThan(0);
        await expect(editors.first()).toContainText('x');
    });

    test('ordinary text mount does not read innerText to force layout', async ({ page }) => {
        await page.goto('/qa/editor-benchmark.html?blocks=1500&profileDOM=1');
        await expect(page.locator('#editor [contenteditable="true"]')).toHaveCount(1500);
        await expect.poll(async () => JSON.parse(await page.locator('#metrics').innerText()).innerTextReads).toBe(0);
    });

    test('composition confirmation does not split a text block', async ({ page }) => {
        await page.goto('/qa/editor-benchmark.html?blocks=1&mode=formatted');
        const editable = page.locator('#editor [contenteditable="true"]');
        await editable.click();
        await editable.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
        await expect(editable).toHaveCount(1);
        await expect(editable).toHaveText('Before boldword after');
    });

    test.describe('large native document', () => {
        test('long documents retain editable identity, distant text, native find and print', async ({ page }) => {
            test.setTimeout(120000);
            await page.goto('/qa/editor-benchmark.html?blocks=1500');
            const editables = page.locator('#editor [contenteditable="true"]');
            const deferred = page.locator('#editor [data-defer-offscreen]');
            await expect(editables).toHaveCount(1500);
            await expect(deferred).toHaveCount(1500);
            await editables.first().evaluate(el => { (el as HTMLElement).dataset.identity = 'original'; });
            await editables.first().click();
            await page.keyboard.type('First retained.');
            await editables.last().scrollIntoViewIfNeeded();
            await editables.last().click();
            await page.keyboard.press('End');
            await page.keyboard.type(' Distant evidence retained.');
            await expect.poll(async () => JSON.parse(await page.locator('#metrics').innerText()).savedLast)
                .toContain('Distant evidence retained.');
            await expect(editables.first()).toHaveAttribute('data-identity', 'original');
            await editables.last().dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
            await expect(editables).toHaveCount(1500);
            const found = await page.evaluate(() => {
                const first = document.querySelector('#editor [contenteditable="true"]')!;
                const range = document.createRange(); range.selectNodeContents(first); range.collapse(true);
                const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
                const browserFind = window as unknown as { find: (text: string) => boolean };
                return browserFind.find('Paragraph 1499.') && !!selection.anchorNode?.parentElement?.closest('#editor');
            });
            expect(found, 'native find reaches distant document text').toBe(true);
            await page.emulateMedia({ media: 'print' });
            await expect(deferred.nth(750)).toHaveCSS('content-visibility', 'visible');
            await page.emulateMedia({ media: 'screen' });
            await editables.last().click();
            await page.keyboard.press('End');
            await page.keyboard.press('Enter');
            await expect(editables).toHaveCount(1501);
            await page.keyboard.type('New distant block.');
            await expect(editables.last()).toHaveText('New distant block.');
            await expect(editables.first()).toHaveAttribute('data-identity', 'original');
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Control+a');
            await expect(page.locator('#editor [data-block-type][class*="selected"]')).toHaveCount(1501);
            const copied = await page.evaluate(() => {
                const data = new DataTransfer();
                const event = new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true });
                document.dispatchEvent(event);
                return event.clipboardData?.getData('text/plain') || '';
            });
            expect(copied.match(/Paragraph \d+\./g)).toHaveLength(1500);
            expect(copied).toContain('Distant evidence retained.');
            expect(copied).toContain('New distant block.');
        });
    });
});
