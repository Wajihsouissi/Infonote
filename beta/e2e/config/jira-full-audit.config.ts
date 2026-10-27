import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../playwright.config';
import { betaRoot, diagnosticOutput } from './diagnosticPaths';

export default defineConfig({
    ...base,
    testDir: resolve(betaRoot, 'e2e/scenarios'),
    retries: 0,
    reporter: [
        [resolve(betaRoot, 'e2e/reporters/jira-progress-reporter.cjs'), {
            outputFile: diagnosticOutput('jira', 'progress.jsonl'),
        }],
        ['json', { outputFile: diagnosticOutput('jira', 'e2e.json') }],
        ['html', { open: 'never', outputFolder: diagnosticOutput('jira', 'html') }],
    ],
    outputDir: diagnosticOutput('jira', 'traces'),
    webServer: {
        ...base.webServer,
        cwd: betaRoot,
        command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188 --strictPort',
    },
    projects: base.projects?.map(project => ({ ...project, retries: 0 })),
});
