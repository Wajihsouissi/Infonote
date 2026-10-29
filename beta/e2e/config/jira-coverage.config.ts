import { defineConfig } from '@playwright/test';
import base from './jira-case-studies.config';
import { diagnosticOutput } from './diagnosticPaths';

export default defineConfig({
    ...base,
    testMatch: 'jira-coverage.spec.ts',
    reporter: [['json', { outputFile: diagnosticOutput('jira', 'coverage-e2e.json') }]],
    outputDir: diagnosticOutput('jira', 'coverage-traces'),
    use: { ...base.use, baseURL: 'http://127.0.0.1:5191' },
    webServer: {
        ...base.webServer,
        command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5191 --strictPort',
        url: 'http://127.0.0.1:5191',
    },
});
