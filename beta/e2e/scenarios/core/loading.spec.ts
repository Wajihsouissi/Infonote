import { test, expect } from '../../support/fixtures';
import { openCanvas } from '../../support/canvas';
import { makeCards, seedCanvasState } from '../../support/canvasState';

/**
 * What opening the canvas downloads.
 *
 * Step 7 took the canvas from ~1.9 MB of code to ~1.1 MB, mostly by not
 * downloading things nobody on the page needs yet. Each of those savings is one
 * top-level import away from quietly coming back, so each has a test here.
 * (`npm run measure` gives the whole picture on the production build.)
 */

test.describe('core: what the canvas loads (L)', () => {
    test('L3 cards fetch only the icons they show, never the full icon set', async ({ page }) => {
        const requested: string[] = [];
        page.on('request', (request) => requested.push(new URL(request.url()).pathname));

        await openCanvas(page);
        const cards = makeCards(3, 'Iconed').map((card, i) => ({
            ...card,
            data: { ...card.data, icon: ['Home', 'Map', 'Star'][i] },
        }));
        await seedCanvasState(page, cards);

        await expect.poll(() => requested.filter((p) => p.startsWith('/icons/solar/')).sort())
            .toEqual(['/icons/solar/home.svg', '/icons/solar/map.svg', '/icons/solar/star.svg']);
        // The whole set (1.8 MB) belongs to the icon picker alone.
        expect(requested.some((p) => p.includes('solarBodies'))).toBe(false);

        // And the icons are really drawn, not just fetched.
        const drawn = page.locator('.react-flow__node svg path');
        await expect.poll(() => drawn.count()).toBeGreaterThan(0);
    });

    test('L4 a guest with no saved session never downloads the sign-in library', async ({ page }) => {
        const requested: string[] = [];
        page.on('request', (request) => requested.push(request.url()));

        await openCanvas(page);
        await page.waitForTimeout(1500);
        expect(requested.filter((url) => url.includes('auth-js'))).toEqual([]);
    });

    test('L5 a crash is reported once, however many times it happens', async ({ page }) => {
        // The reporter's job is to be harmless: it must not throw, must not
        // repeat itself, and must stop after a handful. Only the last step
        // differs in a deployed build, where the report is written to the
        // project's one table instead of the console.
        await openCanvas(page);
        const lines = await page.evaluate(async (path) => {
            const { reportError } = await import(path);
            const seen: string[] = [];
            const original = console.warn;
            console.warn = (...args: unknown[]) => { seen.push(String(args[1] ?? '')); };
            try {
                for (let i = 0; i < 3; i += 1) reportError('window-error', new Error('the same fault'));
                for (let i = 0; i < 30; i += 1) reportError('window-error', new Error(`fault ${i}`));
            } finally {
                console.warn = original;
            }
            return seen;
        }, '/src/services/errorReports.ts');

        expect(lines.filter((l) => l.includes('the same fault'))).toHaveLength(1);
        // Ten per session, the same ceiling the deployed build uses.
        expect(lines).toHaveLength(10);
    });
});
