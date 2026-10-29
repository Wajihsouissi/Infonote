import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { betaRoot, diagnosticOutput } from './diagnosticPaths';

export default defineConfig({
  testDir: resolve(betaRoot, 'e2e/diagnostics/ai-audit'),
  timeout: 150_000,
  expect: { timeout: 12_000 },
  workers: 1,
  retries: 0,
  outputDir: diagnosticOutput('ai-audit', 'cases'),
  reporter: [['list'], ['json', { outputFile: diagnosticOutput('ai-audit', 'results.json') }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 12_000,
  },
});
