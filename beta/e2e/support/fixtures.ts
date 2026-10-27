import { test as base, expect } from '@playwright/test';

/**
 * Shared fixtures.
 *
 * `consoleErrors` fails any otherwise-passing test that logged an uncaught
 * exception or console error — the defect a scripted click-through misses.
 * Opt out per test with `test.use({ allowConsoleErrors: true })`.
 *
 * Each test gets a fresh browser context, so IndexedDB and localStorage start
 * empty and every test exercises first-run hydration like a new visitor —
 * except for the welcome canvas: a first visit seeds three demo cards, which
 * would be noise in every test that counts cards. `firstVisit: true` opts in.
 */

/** Noise that is not the app's fault and must not fail a run. */
const IGNORED = [
    /favicon/i,
    /Failed to load resource.*404/i,
    /net::ERR_INTERNET_DISCONNECTED/i,
    /net::ERR_NETWORK_ACCESS_DENIED/i,
    /ERR_NAME_NOT_RESOLVED/i,
    /Download the React DevTools/i,
    // Playwright's context init scripts also target deliberately inert srcdoc
    // previews. Chromium reports their expected sandbox denial as an error.
    /Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\./,
    // A layout notice, not a failure: WebKit reports it as an uncaught error
    // where Chrome stays quiet. Nothing is lost when it fires.
    /ResizeObserver loop/i,
    // Firefox, when a test navigates while a font is still downloading: the
    // download was aborted (NS_BINDING_ABORTED), not failed. A font that truly
    // fails to load reports a different status and still counts.
    /downloadable font: download failed.*status=2152398850/i,
];

const isNoise = (text: string) => IGNORED.some((re) => re.test(text));

export const test = base.extend<{
    firstVisit: boolean;
    allowConsoleErrors: boolean;
    consoleErrors: string[];
}>({
    firstVisit: [false, { option: true }],
    context: async ({ context, baseURL, firstVisit }, provide) => {
        if (!firstVisit) {
            // The marker services/storage/welcomeCanvas.ts leaves after greeting someone.
            await context.addInitScript(() => {
                // The welcome marker belongs to the host. Opaque-origin UI
                // sandboxes correctly have no localStorage access.
                if (window.top !== window || location.origin === 'null') return;
                if (!localStorage.getItem('chnk-it-welcomed')) localStorage.setItem('chnk-it-welcomed', '1');
            });
        }
        const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
        // The beta is local-only: nothing may leave the machine during a test.
        await context.route('**/*', (route) => {
            const url = new URL(route.request().url());
            if (url.origin === origin || !/^https?:$/.test(url.protocol)) return route.continue();
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        });
        await provide(context);
    },
    allowConsoleErrors: [false, { option: true }],

    consoleErrors: [
        async ({ page, allowConsoleErrors }, use, testInfo) => {
            const errors: string[] = [];

            page.on('console', (msg) => {
                if (msg.type() !== 'error') return;
                const text = msg.text();
                if (!isNoise(text)) errors.push(`console.error: ${text}`);
            });
            page.on('pageerror', (err) => {
                const text = `${err.name}: ${err.message}`;
                if (!isNoise(text)) errors.push(`uncaught: ${text}`);
            });

            await use(errors);

            if (errors.length) {
                await testInfo.attach('browser-errors', { body: errors.join('\n'), contentType: 'text/plain' });
            }
            // Only escalate on an otherwise-passing test: a failed test already
            // has a better story to tell than its console output.
            if (!allowConsoleErrors && testInfo.status === 'passed') {
                expect(errors, `Browser reported ${errors.length} error(s) during this scenario`).toEqual([]);
            }
        },
        { auto: true },
    ],
});

export { expect };
