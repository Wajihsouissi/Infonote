import { test as base, expect } from '@playwright/test';

/**
 * Shared fixtures.
 *
 * The important one is `consoleErrors`: an uncaught exception or a console
 * error during an otherwise "passing" flow is exactly the kind of defect a
 * scripted click-through misses, so every test in this suite fails on one
 * unless it explicitly opts out with `test.use({ allowConsoleErrors: true })`.
 *
 * Each test gets a fresh browser context, so IndexedDB and localStorage start
 * empty — no cross-test state leaks, and every test exercises first-run
 * hydration the way a new visitor would.
 */

/** Noise that is not the app's fault and must not fail a run. */
const IGNORED = [
    /favicon/i,
    /Failed to load resource.*404/i,
    // Supabase is not reachable from a local anonymous run; auth-gated paths
    // are covered by their own explicit assertions instead.
    /supabase/i,
    /net::ERR_INTERNET_DISCONNECTED/i,
    /net::ERR_NETWORK_ACCESS_DENIED/i,
    /ERR_NAME_NOT_RESOLVED/i,
    /Download the React DevTools/i,
    // The marketing page nests a <div> inside a <p> (MarketingPage's <motion.p>
    // wraps <LinkPreview>, which renders a div). React logs it on every visit,
    // which would otherwise fail every single test that so much as loads '/'.
    // It is a real defect, owned by one dedicated test — smoke S07 — so that
    // one bug produces one failure instead of a dozen.
    /cannot be a descendant of/i,
    /cannot contain a nested/i,
];

const isNoise = (text: string) => IGNORED.some((re) => re.test(text));

export const test = base.extend<{
    allowConsoleErrors: boolean;
    consoleErrors: string[];
}>({
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
                // Attached unconditionally so they stay visible on opt-out runs.
                await testInfo.attach('browser-errors', {
                    body: errors.join('\n'),
                    contentType: 'text/plain',
                });
            }
            // Only escalate on an otherwise-passing test: a test that already
            // failed has a better story to tell than its console spew.
            if (!allowConsoleErrors && testInfo.status === 'passed') {
                expect(errors, `Browser reported ${errors.length} error(s) during this scenario`).toEqual([]);
            }
        },
        { auto: true },
    ],
});

/** Re-exported so specs import `test` and `expect` from one place. */
export { expect };
