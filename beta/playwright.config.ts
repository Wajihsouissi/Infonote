import { defineConfig, devices } from '@playwright/test';

/**
 * Beta QA suite. Scenarios were ported from the full app's suite (e2e/ at the
 * repo root) and trimmed to what the beta ships; beta-only features (the auto
 * mind map, card extras) have their own specs here.
 *
 *   npm run test:e2e                         the everyday suite (Chrome)
 *   npm run test:e2e:browsers                Firefox, Safari (WebKit), Edge, small screen
 *   npx playwright test --project=smoke      one tier
 *
 * The suite drives its own dev server on 5188 so it never collides with a
 * beta you have open on 5174.
 */

const PORT = 5188;

/**
 * What runs in the other browsers: the specs where engines genuinely differ —
 * typing and selection in the editor (contentEditable is the least uniform
 * thing on the web), saving to IndexedDB, files, drag and drop, and the pages.
 * Canvas maths and AI plumbing are engine-independent and stay Chrome-only.
 */
const CROSS_BROWSER = /scenarios\/core\/(accounts|block-editor|editor-keyboard|card-lifecycle|card-extras|persistence|files|gallery|loading)\.spec\.ts/;

/**
 * Edge runs a smaller set, because Edge *is* Chromium: anything the engine
 * decides is already covered by the Chrome projects, and what is left worth
 * checking is that the app runs in it at all — pages, editing, files, saving.
 *
 * It also earns one retry, which the other projects do not get. Driving the
 * installed Edge occasionally leaves a page that receives no pointer events at
 * all: not a click that misses, but a window that stops hearing the mouse,
 * while the same test in the same engine passes in Chrome. That is the browser
 * under automation, not the app, and a retry keeps it from failing a run.
 */
const EDGE_SMOKE = /scenarios\/core\/(accounts|block-editor|card-lifecycle|files|persistence|loading)\.spec\.ts/;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: './e2e/scenarios',
    // The canvas hydrates from IndexedDB and mounts editors on a scheduler;
    // generous-but-bounded timeouts keep real waits from reading as flakes.
    timeout: 60_000,
    expect: { timeout: 10_000 },

    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // One Vite dev server serves every worker; more than two starve it.
    workers: 2,

    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

    use: {
        baseURL: BASE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
    },

    projects: [
        { name: 'smoke', testMatch: /scenarios\/smoke\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
        { name: 'core', testMatch: /scenarios\/core\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', testMatch: CROSS_BROWSER, use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', testMatch: CROSS_BROWSER, use: { ...devices['Desktop Safari'] } },
        { name: 'edge', testMatch: EDGE_SMOKE, retries: 1, use: { ...devices['Desktop Edge'], channel: 'msedge' } },
        // A small laptop: the canvas chrome and side panels at their tightest.
        { name: 'small-screen', testMatch: CROSS_BROWSER, use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 640 } } },
    ],

    webServer: {
        command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
