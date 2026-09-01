import baseConfig from './playwright.config';
import { defineConfig, devices } from '@playwright/test';

/**
 * The older, flat specs in `e2e/` — one-off investigations written before the
 * scenario suite existed. Several hardcode hosts and ports, so they are opted
 * into explicitly (`npm run test:e2e:legacy`) rather than failing every run.
 */
export default defineConfig({
    ...baseConfig,
    testDir: './e2e',
    testMatch: /e2e\/[^/]+\.spec\.ts$/,
    projects: [{ name: 'legacy', use: { ...devices['Desktop Chrome'] } }],
});
