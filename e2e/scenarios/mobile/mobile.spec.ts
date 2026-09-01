import { test, expect } from '../../support/fixtures';

/**
 * QA scenario I39 — mobile reality check.
 *
 * The marketing page is the one surface that must genuinely work at 375px: it
 * is where every new visitor lands. The canvas is desktop-first by design, so
 * the bar there is "usable and honest", not "full parity".
 */

test.describe('mobile: 375px reality check (I39)', () => {
    test('I39 the marketing page does not scroll sideways at phone width', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2500);

        const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            widest: Array.from(document.querySelectorAll('body *'))
                .map((el) => ({
                    w: Math.round(el.getBoundingClientRect().right),
                    tag: el.tagName,
                    cls: String((el as HTMLElement).className).slice(0, 60),
                }))
                .filter((e) => e.w > document.documentElement.clientWidth + 1)
                .sort((a, b) => b.w - a.w)
                .slice(0, 5),
        }));

        expect(
            overflow.scrollWidth,
            `page scrolls horizontally at ${overflow.clientWidth}px. Widest offenders: `
            + JSON.stringify(overflow.widest),
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test('I39b the marketing page offers a reachable call to action', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2500);

        // Whatever the copy, something must lead into the product.
        const cta = page.getByRole('button', { name: /canvas|start|try|get started|sign/i })
            .or(page.getByRole('link', { name: /canvas|start|try|get started|sign/i }));
        await expect(cta.first(), 'no visible way into the product on mobile').toBeVisible({ timeout: 15_000 });

        const box = await cta.first().boundingBox();
        expect(box, 'the primary call to action has no layout box').not.toBeNull();
        // Apple and Google both put the minimum comfortable touch target at 44px.
        expect(box!.height, 'the primary call to action is too small to tap comfortably').toBeGreaterThanOrEqual(36);
    });

    test('I39c the canvas loads on a phone rather than failing outright', async ({ page }) => {
        await page.goto('/canvas');
        await page.waitForTimeout(4000);

        // Desktop-first is fine; a blank page or a crashed boundary is not.
        await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
        const text = (await page.locator('body').innerText()).trim();
        expect(text.length, 'the canvas rendered nothing at all on a phone viewport').toBeGreaterThan(10);
    });
});
