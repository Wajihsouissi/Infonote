/**
 * What opening the canvas costs, measured on the production build.
 *
 *   npm run build && npm run measure
 *
 * Serves dist/ with `vite preview`, opens /canvas in Chromium as a returning
 * visitor (no welcome cards) and adds up every script and stylesheet the page
 * downloads until the network goes quiet. Chunks fetched later on idle (the AI
 * panel is prefetched this way) are reported separately: they do not delay
 * the canvas, but they are still bytes on the wire.
 *
 * The budget is plan-Beta.md §8: at most 1.2 MB of code to open the canvas,
 * no chunk over 500 kB.
 */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const PORT = 4199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BUDGET_JS = 1.2 * 1024 * 1024;
const BUDGET_CHUNK = 500 * 1024;

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

async function waitForServer(url, ms = 30_000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
        try {
            if ((await fetch(url)).ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`preview server did not start on ${url}`);
}

const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    shell: true,
    stdio: 'ignore',
});

let exitCode = 0;
try {
    await waitForServer(ORIGIN);
    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('chnk-it-welcomed', '1'));
    const page = await context.newPage();

    /** url → { bytes, type, phase } */
    const assets = new Map();
    let phase = 'load';
    // A request belongs to the phase it was MADE in; the body arrives later.
    const madeIn = new Map();
    page.on('request', (request) => madeIn.set(request.url(), phase));
    page.on('response', async (response) => {
        const url = new URL(response.url());
        if (url.origin !== ORIGIN) return;
        const type = /\.js$/.test(url.pathname) ? 'js' : /\.css$/.test(url.pathname) ? 'css' : null;
        if (!type) return;
        try {
            const body = await response.body();
            assets.set(url.pathname, { bytes: body.length, type, phase: madeIn.get(response.url()) ?? phase });
        } catch { /* navigated away */ }
    });

    await page.goto(`${ORIGIN}/canvas`);
    await page.locator('.react-flow__pane').waitFor({ timeout: 30_000 });
    // Everything asked for once the canvas is on screen is not what opened it.
    phase = 'idle';
    // Idle prefetches start after the canvas settles.
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle');
    await browser.close();

    const sum = (filter) => [...assets.values()].filter(filter).reduce((n, a) => n + a.bytes, 0);
    const loadJs = sum((a) => a.phase === 'load' && a.type === 'js');
    const loadCss = sum((a) => a.phase === 'load' && a.type === 'css');
    const idleJs = sum((a) => a.phase === 'idle' && a.type === 'js');

    const rows = [...assets.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
    console.log('\nOpening /canvas (uncompressed):');
    for (const [path, a] of rows) {
        const flag = a.type === 'js' && a.bytes > BUDGET_CHUNK ? '  ⚠ over 500 kB' : '';
        console.log(`  ${a.phase.padEnd(4)} ${a.type.padEnd(3)} ${kb(a.bytes).padStart(8)}  ${path.replace('/assets/', '')}${flag}`);
    }
    console.log(`\n  code to open the canvas: ${kb(loadJs)}  (budget ${kb(BUDGET_JS)})`);
    console.log(`  styles:                  ${kb(loadCss)}`);
    console.log(`  prefetched on idle:      ${kb(idleJs)}`);

    const overChunk = rows.some(([, a]) => a.type === 'js' && a.phase === 'load' && a.bytes > BUDGET_CHUNK);
    if (loadJs > BUDGET_JS || overChunk) exitCode = 1;
    console.log(exitCode ? '\n  ✗ over budget' : '\n  ✓ within budget');
} catch (error) {
    console.error(error);
    exitCode = 2;
} finally {
    server.kill();
    // On Windows the shell wrapper's child outlives kill(); the port frees when node exits.
    process.exit(exitCode);
}
