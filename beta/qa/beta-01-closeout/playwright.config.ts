import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config';

const scope = /scenarios\/core\/(scrum-(18|19|23|27|28|29|37|125|243)|scrum-29-clipboard-safety|editor-keyboard|editor-regressions|block-editor|local-storage|workspace-startup|accounts|persistence)\.spec\.ts/;
const run = process.env.CLOSEOUT_RUN ?? 'discovery';
export default defineConfig({
  ...base,
  retries: 0,
  workers: 1,
  testDir: fileURLToPath(new URL('../../e2e/scenarios', import.meta.url)),
  outputDir: fileURLToPath(new URL(`./test-results/${run}/`, import.meta.url)),
  reporter: [[fileURLToPath(new URL('./Reporter.cjs', import.meta.url))]],
  use: { ...base.use, video: 'retain-on-failure' },
  projects: base.projects?.filter(project => ['core', 'firefox', 'webkit', 'small-screen'].includes(project.name!))
    .map(project => ({ ...project, testMatch: scope, retries: 0, workers: 1 })),
  webServer: {
    ...base.webServer as object,
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188 --strictPort',
    stdout: 'pipe',
  },
});
