import { defineConfig, devices } from '@playwright/test';

/**
 * Chnk it (Infonote) — automated QA suite.
 *
 * Scenario tests live in `e2e/scenarios/` and are the default run. The older
 * ad-hoc specs still sitting flat in `e2e/` are kept out of `testDir` on
 * purpose: they hardcode hosts and were written as one-off investigations, so
 * they are opted into explicitly (`npm run test:e2e:legacy`) rather than
 * failing every run.
 *
 * Tiers map to projects so the CLI can run a slice:
 *   npx playwright test --project=smoke
 *   npx playwright test --project=core --project=advanced
 */

const BASE_URL = process.env.PW_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
    testDir: './e2e/scenarios',
    // The canvas animates, hydrates from IndexedDB and mounts editors on a
    // scheduler; generous-but-bounded timeouts keep real waits from reading as
    // flakes without hiding a genuine hang.
    timeout: 60_000,
    expect: { timeout: 10_000 },

    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // This app is heavy (canvas + animation + a single Vite dev server). Four
    // workers starve each other and produce timeouts that look like product
    // bugs; two is the point where runs stay honest.
    workers: 2,

    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
        : [['list'], ['html', { open: 'never' }]],

    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
    },

    projects: [
        {
            name: 'smoke',
            testMatch: /scenarios\/smoke\/.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'core',
            testMatch: /scenarios\/core\/.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'advanced',
            testMatch: /scenarios\/advanced\/.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile',
            testMatch: /scenarios\/mobile\/.*\.spec\.ts/,
            use: { ...devices['Pixel 7'] },
        },
    ],

    webServer: {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
