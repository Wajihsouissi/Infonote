import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import base from '../../playwright.config';
export default defineConfig({...base,retries:0,workers:1,
 testDir:fileURLToPath(new URL('../../e2e/scenarios',import.meta.url)),
 projects:base.projects?.filter(p=>!['smoke','edge'].includes(p.name!)).map(p=>({...p,testMatch:/scenarios\/core\/(scrum-37|local-storage|workspace-startup)\.spec\.ts/})),
 webServer:{...base.webServer as object,cwd:fileURLToPath(new URL('../..',import.meta.url)),command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188 --strictPort',stdout:'pipe'},
});
