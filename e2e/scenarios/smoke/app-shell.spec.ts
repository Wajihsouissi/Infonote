import { test, expect } from '../../support/fixtures';
import { openCanvas, PANE, NODE } from '../../support/canvas';
import { waitForCanvasState } from '../../support/canvasState';

/**
 * Tier 0 — smoke.
 *
 * The cheapest possible question: does the app stand up? Everything here runs
 * in seconds and is meant to be the first thing CI reports, so a broken build
 * never burns twenty minutes of the deeper suites before saying so.
 */

test.describe('smoke: app shell', () => {
    test('S01 marketing page renders for an anonymous visitor', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/.+/);
        // The shell must paint actual content, not an empty error-boundary page.
        await expect(page.locator('body')).not.toHaveText('');
        await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
    });

    test('S02 canvas boots with its seeded demo content', async ({ page }) => {
        await openCanvas(page);
        await expect(page.locator(PANE)).toBeVisible();
        // At least one card must actually mount, not just the empty pane.
        await expect(page.locator(NODE).first()).toBeVisible();

        const snap = await waitForCanvasState(page, (s) => s.nodes.length > 0, 'seed cards to hydrate');
        expect(snap.nodes.length).toBeGreaterThan(0);
    });

    test('S03 canvas chrome is present and reachable', async ({ page }) => {
        await openCanvas(page);
        for (const name of [/^Undo/, /^Redo/, /^Search/, /^AI /, /Add New Note Card/]) {
            await expect(page.getByTitle(name).first()).toBeVisible();
        }
        await expect(page.locator('.react-flow__minimap')).toBeVisible();
    });

    test('S04 deep links resolve to a rendered view, never a blank page', async ({ page }) => {
        for (const path of ['/features', '/login', '/signup', '/canvas', '/definitely-not-a-route']) {
            await page.goto(path);
            // Give the lazy route chunk time to mount.
            await expect
                .poll(async () => (await page.locator('body').innerText()).trim().length, {
                    message: `route ${path} rendered nothing`,
                    timeout: 15_000,
                })
                .toBeGreaterThan(20);
            await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
        }
    });

    test('S05 theme toggle flips the document theme and keeps the canvas up', async ({ page }) => {
        await openCanvas(page);
        const toggle = page.getByRole('button', { name: /Switch to (light|dark) mode/ }).first();
        const before = await page.locator('html').getAttribute('data-theme');

        await toggle.click();
        await expect(page.locator('html')).not.toHaveAttribute('data-theme', before ?? '');
        // The toggle must re-label itself, or the control lies about its state.
        await expect(toggle).toHaveAccessibleName(
            before === 'dark' ? /Switch to dark mode/ : /Switch to light mode/,
        );
        await expect(page.locator(PANE)).toBeVisible();
    });

    test(
        'S07 the marketing page renders valid HTML',
        {
            annotation: {
                type: 'known-defect',
                description:
                    'MarketingPage.tsx wraps <LinkPreview> in a <motion.p>; LinkPreview renders a <div>, '
                    + 'so a block element is nested inside a paragraph. The browser auto-closes the <p>, '
                    + 'which React reports as a hydration error on every visit to "/".',
            },
        },
        async ({ page }) => {
            // Owns the invalid-nesting warning for the whole suite (see the
            // IGNORED list in support/fixtures.ts).
            const nesting: string[] = [];
            page.on('console', (msg) => {
                if (msg.type() === 'error' && /cannot be a descendant of|cannot contain a nested/i.test(msg.text())) {
                    nesting.push(msg.text().split('\n')[0]);
                }
            });

            await page.goto('/');
            await page.waitForTimeout(3000);

            expect(nesting, 'the marketing page renders invalid HTML nesting').toEqual([]);
        },
    );

    test('S06 canvas state is available without a hidden local snapshot', async ({ page }) => {
        await openCanvas(page);
        await waitForCanvasState(page, (state) => state.nodes.length > 0, 'the live canvas state');
        const hasLegacyStore = await page.evaluate(async () => {
            const databases = await (indexedDB as unknown as {
                databases?: () => Promise<Array<{ name?: string }>>;
            }).databases?.() ?? [];
            if (!databases.some((database) => database.name === 'chnk-it-local')) return false;
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open('chnk-it-local');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            try {
                return db.objectStoreNames.contains('snapshots');
            } finally {
                db.close();
            }
        });
        expect(hasLegacyStore).toBe(false);
    });
});
