import { chromium, expect as baseExpect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildInvestmentStudy, imagePages } from '../qa/investment-study.mjs';

const expect = baseExpect.configure({ timeout: 30000 });

const baseURL = process.env.PERF_URL || 'http://localhost:5180';
const out = fileURLToPath(new URL(`../../output/audits/production-canvas/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url));
await mkdir(out, { recursive: true });
const report = { baseURL, headed: true, surface: 'expanded cards and canvas', viewport: { width: 1600, height: 1000 }, phases: [], errors: [], networkFailures: [], notes: [
    'Isolated production IndexedDB workspace. No development store access.',
    'Initial bulk graph is seeded before boot. Focus setup uses the existing focusCanvasNodes UI command; navigation, typing, scrolling and pan/zoom use real input.',
    'Frame intervals are rAF samples, not official INP. Screenshots and disk writes occur outside measured pan intervals.',
] };
const summarize = values => { const s = [...values].sort((a, b) => a - b); return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / (s.length || 1), median: s[Math.floor(s.length / 2)] || 0, p95: s[Math.max(0, Math.ceil(s.length * .95) - 1)] || 0, max: s.at(-1) || 0 }; };
const browser = await chromium.launch({ headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion'] });
report.browser = browser.version();
const context = await browser.newContext({ viewport: report.viewport });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
page.setDefaultTimeout(30000);
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('requestfailed', r => { const u = new URL(r.url()); report.networkFailures.push({ resource: u.origin + u.pathname, error: r.failure()?.errorText }); });
await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === new URL(baseURL).origin || !['http:', 'https:'].includes(url.protocol) ? route.continue() : route.fulfill({ contentType: 'application/json', body: '{}' });
});
const images = [];
for (const [i, image] of imagePages.entries()) {
    const cached = fileURLToPath(new URL(`../node_modules/.cache/headed-study-photos/${decodeURIComponent(new URL(image.originalUrl).pathname.split('/').at(-1))}`, import.meta.url));
    const body = await readFile(cached).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        report.notes.push(`Source photo absent from the earlier evidence cache: ${image.originalUrl}`);
        return null;
    });
    if (!body) continue;
    await writeFile(path.join(out, `photo-${i}.jpg`), body);
    await context.route(image.originalUrl, route => route.fulfill({ contentType: 'image/jpeg', body }));
    images.push({ ...image, url: image.originalUrl });
}
await context.addInitScript(() => {
    const m = window.__canvasPerf = { capture: false, frames: [], tasks: [], visibility: [] };
    document.addEventListener('visibilitychange', () => { if (m.capture) m.visibility.push(document.visibilityState); });
    new PerformanceObserver(list => { if (m.capture) m.tasks.push(...list.getEntries().map(e => e.duration)); }).observe({ type: 'longtask' });
    let previous;
    const frame = now => { if (m.capture && previous !== undefined) m.frames.push(now - previous); previous = m.capture ? now : undefined; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
});
const node = id => page.locator(`.react-flow__node[data-id="${id}"]`);
const editors = page.locator('[data-chnk-it-block-editor]');
const camera = () => page.locator('.react-flow__viewport').evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return { x: m.e, y: m.f, zoom: m.a }; });
const read = (kind, id) => page.evaluate(({ kind, id }) => new Promise((resolve, reject) => {
    const open = indexedDB.open('infonote-local-workspaces');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
        const db = open.result, name = kind === 'header' ? 'workspaces' : `workspace-${kind}`;
        const tx = db.transaction(name, 'readonly');
        const request = tx.objectStore(name).get(kind === 'header' ? 'anonymous' : ['anonymous', id]);
        request.onsuccess = () => resolve(kind === 'header' ? request.result : request.result?.value);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
    };
}), { kind, id });
const graph = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('infonote-local-workspaces');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['workspace-nodes', 'workspace-edges'], 'readonly');
        const nodes = tx.objectStore('workspace-nodes').index('workspace').getAll('anonymous');
        const edges = tx.objectStore('workspace-edges').index('workspace').getAll('anonymous');
        tx.oncomplete = () => { resolve({ nodes: nodes.result.map(r => r.value), edges: edges.result.map(r => r.value) }); db.close(); };
        tx.onerror = () => reject(tx.error);
    };
}));
async function focus(id) {
    await page.evaluate(id => window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id], duration: 0 } })), id);
    await expect(node(id)).toBeAttached();
    await expect(node(id)).toBeVisible();
    await page.waitForTimeout(200);
    return node(id);
}
async function clearAndFit() {
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    const box = await page.locator('.react-flow__pane').boundingBox();
    await page.mouse.click(box.x + 12, box.y + 20);
    await page.keyboard.press('5');
    await page.waitForTimeout(750);
}
async function home() {
    const button = page.getByRole('button', { name: 'Canvas home', exact: true });
    if (await button.isEnabled()) await button.click();
    else await clearAndFit();
    await expect(node('study-deep')).toBeAttached();
}
async function openNested(id, firstChild) {
    const card = await focus(id);
    await card.hover();
    await card.getByTitle('Open Card', { exact: true }).first().click();
    if (firstChild) await expect(node(firstChild)).toBeAttached();
}
async function capture(name, action, { frames = false } = {}) {
    console.log(`START ${name}`);
    await page.bringToFront();
    await page.waitForFunction(() => document.visibilityState === 'visible' && document.hasFocus());
    const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    await page.evaluate(() => Object.assign(window.__canvasPerf, { capture: true, frames: [], tasks: [], visibility: [] }));
    const start = performance.now(), result = { name, status: 'passed' };
    try { result.details = await action(); }
    catch (error) { result.status = 'failed'; result.error = error.stack; }
    result.wallMs = performance.now() - start;
    const observed = await page.evaluate(() => { window.__canvasPerf.capture = false; return { ...window.__canvasPerf, state: document.visibilityState, dom: document.querySelectorAll('*').length, editors: document.querySelectorAll('[data-chnk-it-block-editor]').length, cards: document.querySelectorAll('.react-flow__node').length, overviewCards: document.querySelectorAll('[data-canvas-overview]').length }; });
    const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    result.browserWorkMs = Object.fromEntries(['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].map(k => [k, (after[k] - before[k]) * 1000]));
    result.metrics = { ...observed, frames: summarize(observed.frames), tasks: summarize(observed.tasks) };
    result.camera = await camera();
    if (frames) { await writeFile(path.join(out, `${name}-frames.json`), JSON.stringify(observed.frames)); result.validForeground = observed.state === 'visible' && observed.visibility.every(v => v === 'visible'); }
    report.phases.push(result);
    await writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
    console.log(`${result.status.toUpperCase()} ${name} ${Math.round(result.wallMs)}ms`);
    if (result.status === 'failed') throw Error(result.error);
    return result;
}
try {
    const study = buildInvestmentStudy(images);
    report.manifest = study.manifest;
    await page.route('**/__performance_seed', r => r.fulfill({ contentType: 'text/html', body: 'Isolated canvas benchmark' }));
    await page.goto(`${baseURL}/__performance_seed`);
    await page.evaluate(async ({ nodes, edges }) => {
        localStorage.setItem('chnk-it-welcomed', '1');
        await new Promise((resolve, reject) => {
            const open = indexedDB.open('infonote-local-workspaces');
            open.onupgradeneeded = () => { const db = open.result; db.createObjectStore('workspaces', { keyPath: 'key' }); for (const name of ['workspace-nodes', 'workspace-edges']) db.createObjectStore(name, { keyPath: ['workspace', 'id'] }).createIndex('workspace', 'workspace'); };
            open.onerror = () => reject(open.error);
            open.onsuccess = () => { const db = open.result, tx = db.transaction(['workspaces', 'workspace-nodes', 'workspace-edges'], 'readwrite');
                tx.objectStore('workspaces').put({ key: 'anonymous', format: 3, commit: 'canvas-benchmark-seed', nodeIds: nodes.map(n => n.id), edgeIds: edges.map(e => e.id), updatedAt: Date.now() });
                for (const node of nodes) tx.objectStore('workspace-nodes').put({ workspace: 'anonymous', id: node.id, value: node });
                for (const edge of edges) tx.objectStore('workspace-edges').put({ workspace: 'anonymous', id: edge.id, value: edge });
                tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
            };
        });
    }, study);
    const started = performance.now();
    await page.goto(`${baseURL}/canvas`, { waitUntil: 'networkidle' });
    await expect(node('study-deep')).toBeAttached();
    report.bootMs = performance.now() - started;
    expect(await page.evaluate(() => Boolean(window.__appStore))).toBe(false);
    await clearAndFit();
    await expect(editors).toHaveCount(0);
    await capture('expanded-dossier-scroll-and-edit', async () => {
        const card = await focus('study-deep'), live = card.locator('[data-chnk-it-block-editor]');
        await expect(live).toBeVisible();
        const cover = card.locator('img[src*="wikimedia"]').first();
        await expect.poll(() => cover.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
        const area = card.locator('.infonote-scrollable').first();
        await area.hover(); await page.mouse.wheel(0, 2100); await page.waitForTimeout(250);
        const index = await live.locator('[contenteditable="true"]').evaluateAll(els => els.findIndex(el => {
            const r = el.getBoundingClientRect(), a = el.closest('.infonote-scrollable').getBoundingClientRect();
            return r.top > a.top + 30 && r.bottom < a.bottom - 30;
        }));
        expect(index).toBeGreaterThanOrEqual(0);
        const editable = live.locator('[contenteditable="true"]').nth(index);
        await editable.click();
        const geometry = () => editable.evaluate(el => ({ top: el.getBoundingClientRect().top, scroll: el.closest('.infonote-scrollable').scrollTop }));
        const before = await geometry();
        await page.keyboard.type(' [canvas scroll reviewed]', { delay: 8 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const after = await geometry();
        expect(Math.abs(before.top - after.top)).toBeLessThan(50);
        expect(Math.abs(before.scroll - after.scroll)).toBeLessThan(90);
        await page.keyboard.press('Escape');
        await expect.poll(async () => JSON.stringify((await read('nodes', 'study-deep')).data.content)).toContain('[canvas scroll reviewed]');
        return { before, after, coverDecoded: true };
    });
    await capture('expanded-table-scroll-edit-grow', async () => {
        const card = await focus('study-table'), live = card.locator('[data-chnk-it-block-editor]');
        await expect(live).toBeVisible();
        const cells = live.locator('table').first().locator('[contenteditable="true"]');
        await expect(cells).toHaveCount(968);
        await cells.nth(8).click(); await page.keyboard.press('End');
        await page.keyboard.type(' [canvas table reviewed]', { delay: 8 });
        await page.keyboard.press('Tab'); await page.keyboard.type('123', { delay: 8 });
        // A normal click scrolls the actual expanded card to the table footer.
        await live.getByRole('button', { name: 'Add row', exact: true }).first().click();
        await expect(cells).toHaveCount(976);
        await page.keyboard.press('Escape');
        await expect.poll(async () => (await read('nodes', 'study-table')).data.content[0].metadata.rows.length).toBe(122);
        const rows = (await read('nodes', 'study-table')).data.content[0].metadata.rows;
        expect(rows[1][0]).toContain('[canvas table reviewed]');
        expect(rows[1][1]).toContain('123');
        return { cellsBefore: 968, cellsAfter: 976, savedRows: rows.length };
    });
    await home();
    await capture('generate-dossier-map', async () => {
        await openNested('study-deep');
        await expect.poll(async () => (await read('header')).nodeIds.length, { timeout: 60000 }).toBeGreaterThan(800);
        await clearAndFit();
        await expect(editors).toHaveCount(0);
        const saved = await graph();
        const children = saved.nodes.filter(n => n.parentId === 'study-deep');
        return { generatedCards: saved.nodes.length - study.nodes.length, children: children.length, totalNodes: saved.nodes.length, totalEdges: saved.edges.length, camera: await camera() };
    });
    await page.screenshot({ path: path.join(out, 'generated-map.png') });
    for (let run = 0; run < 3; run++) {
        await clearAndFit();
        await page.waitForTimeout(400);
        await capture(`map-pan-${run}`, async () => {
            const start = await camera();
            const positions = [];
            for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
                await page.keyboard.down(key); await page.waitForTimeout(650); await page.keyboard.up(key);
                positions.push(await camera());
            }
            const end = await camera();
            expect(positions.some(p => p.x !== start.x || p.y !== start.y), 'held arrows must actually move the canvas').toBe(true);
            await expect(editors).toHaveCount(0);
            return { start, positions, end, input: 'held arrow keys' };
        }, { frames: true });
    }
    for (let run = 0; run < 3; run++) {
        await clearAndFit(); await page.waitForTimeout(400);
        await capture(`map-mouse-pan-${run}`, async () => {
            const box = await page.locator('.react-flow__pane').boundingBox();
            const start = await camera();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down({ button: 'middle' });
            try { await page.mouse.move(box.x + box.width / 2 + 240, box.y + box.height / 2 + 140, { steps: 32 }); }
            finally { await page.mouse.up({ button: 'middle' }); }
            const end = await camera();
            expect(start).not.toEqual(end);
            await expect(editors).toHaveCount(0);
            return { start, end, input: 'middle-button drag' };
        }, { frames: true });
    }
    await capture('map-wheel-zoom', async () => {
        const box = await page.locator('.react-flow__pane').boundingBox();
        await page.mouse.move(box.x + 20, box.y + 100);
        const before = await camera();
        for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -350); await page.waitForTimeout(80); }
        await page.waitForTimeout(400);
        const after = await camera();
        expect(after.zoom).toBeGreaterThan(before.zoom);
        await expect(editors).toHaveCount(0);
        return { before, after };
    });
    await capture('edit-map-leaf-and-sync', async () => {
        const saved = await graph(), leaf = saved.nodes.find(n => n.parentId === 'study-deep' && n.data.content?.some(b => b.type === 'text'));
        assert.ok(leaf, 'generated text leaf exists');
        const card = await focus(leaf.id), live = card.locator('[data-chnk-it-block-editor]');
        await expect(live).toBeVisible();
        const marker = ' Verified through the expanded canvas card.';
        await live.locator('[contenteditable="true"]').first().click();
        await page.keyboard.press('End'); await page.keyboard.type(marker, { delay: 8 }); await page.keyboard.press('Escape');
        await expect.poll(async () => JSON.stringify((await read('nodes', leaf.id)).data.content)).toContain(marker.trim());
        await expect.poll(async () => JSON.stringify((await read('nodes', 'study-deep')).data.content)).toContain(marker.trim());
        expect((await read('nodes', 'study-deep')).data.content).toHaveLength(1211);
        return { leafId: leaf.id, parentBlocks: 1211 };
    });
    await capture('three-level-navigation', async () => {
        await home();
        await openNested('study-columns', 'nested-0-0');
        await openNested('nested-0-0', 'nested-1-0');
        await openNested('nested-1-0', 'nested-2-0');
        await home();
        return { levels: 3 };
    });
    await capture('whole-workspace-save-reload', async () => {
        await clearAndFit(); await page.waitForTimeout(1600);
        const before = await graph();
        await writeFile(path.join(out, 'before-reload.json'), JSON.stringify(before));
        await page.reload({ waitUntil: 'networkidle' });
        await expect(node('study-deep')).toBeAttached();
        const after = await graph();
        const canonical = g => ({ nodes: Object.fromEntries(g.nodes.map(n => [n.id, { parentId: n.parentId ?? null, data: { ...n.data, content: n.data.content === '' ? [] : n.data.content } }])), edges: [...g.edges].sort((a, b) => a.id.localeCompare(b.id)) });
        assert.deepStrictEqual(canonical(after), canonical(before));
        await writeFile(path.join(out, 'after-reload.json'), JSON.stringify(after));
        const card = await focus('study-deep');
        await expect(card.locator('[data-chnk-it-block-editor]')).toContainText('Verified through the expanded canvas card.', { timeout: 30000 });
        return { nodes: after.nodes.length, edges: after.edges.length, semanticEquality: true };
    });
    await page.screenshot({ path: path.join(out, 'expanded-dossier-after-reload.png') });
    if (process.env.PERF_PROFILE_PAN === '1') {
        // Attribution is deliberately after the unprofiled timing series and
        // save/reload assertions. Trace overhead is excluded from those results.
        await openNested('study-deep');
        await clearAndFit();
        await expect(editors).toHaveCount(0);
        let layers = [];
        const rememberLayers = event => { if (event.layers) layers = event.layers; };
        cdp.on('LayerTree.layerTreeDidChange', rememberLayers);
        await cdp.send('LayerTree.enable');
        const browserCDP = await browser.newBrowserCDPSession();
        const { gpu } = await browserCDP.send('SystemInfo.getInfo');
        const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.start', {
            categories: 'devtools.timeline,toplevel,blink,cc,disabled-by-default-devtools.timeline',
            transferMode: 'ReturnAsStream',
        });
        const box = await page.locator('.react-flow__pane').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down({ button: 'middle' });
        try { await page.mouse.move(box.x + box.width / 2 + 240, box.y + box.height / 2 + 140, { steps: 32 }); }
        finally { await page.mouse.up({ button: 'middle' }); }
        await page.waitForTimeout(500);
        await cdp.send('Tracing.end');
        const { stream } = await complete;
        const chunks = [];
        try {
            for (;;) {
                const chunk = await cdp.send('IO.read', { handle: stream });
                chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
                if (chunk.eof) break;
            }
        } finally { await cdp.send('IO.close', { handle: stream }); }
        await writeFile(path.join(out, 'diagnostic-pan-trace.json'), Buffer.concat(chunks));
        report.panProfile = { diagnosticOnly: true, trace: 'diagnostic-pan-trace.json', gpu: {
            devices: gpu.devices.map(({ vendorString, deviceString }) => ({ vendorString, deviceString })),
            featureStatus: gpu.featureStatus,
        }, layers: layers.map(({ layerId, width, height, drawsContent, paintCount }) => ({ layerId, width, height, drawsContent, paintCount })) };
        cdp.off('LayerTree.layerTreeDidChange', rememberLayers);
        await cdp.send('LayerTree.disable');
        await browserCDP.detach();
    }
} catch (error) {
    report.failure = error.stack; process.exitCode = 1;
    await writeFile(path.join(out, 'failure-workspace.json'), JSON.stringify(await graph())).catch(() => {});
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
    console.log(`REPORT ${out}`);
    await browser.close();
}
