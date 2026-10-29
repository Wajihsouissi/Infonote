import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { betaRoot, diagnosticOutput } from './diagnosticPaths';

export default defineConfig({
    testDir: resolve(betaRoot, 'e2e/diagnostics'),
    testMatch: 'jira-case-studies.spec.ts',
    timeout: 120_000,
    expect: { timeout: 15_000 },
    workers: 1,
    retries: 0,
    reporter: [
        ['json', { outputFile: diagnosticOutput('jira', 'case-studies.json') }],
        ['html', { open: 'never', outputFolder: diagnosticOutput('jira', 'cases-html') }],
    ],
    outputDir: diagnosticOutput('jira', 'cases-traces'),
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:5190',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        actionTimeout: 15_000,
    },
    webServer: {
        cwd: betaRoot,
        command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5190 --strictPort',
        url: 'http://127.0.0.1:5190',
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
