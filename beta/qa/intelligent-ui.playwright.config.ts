import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

/** Focused integration checks against the beta already running on localhost. */
export default defineConfig({
    ...base,
    testDir: '../e2e/scenarios',
    workers: 1,
    webServer: undefined,
    use: { ...base.use, baseURL: process.env.INTELLIGENT_UI_BASE_URL || 'http://localhost:5174' },
    outputDir: '../test-results/intelligent-ui',
});
