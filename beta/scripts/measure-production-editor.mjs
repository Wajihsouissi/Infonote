import { chromium, expect as baseExpect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildInvestmentStudy } from '../qa/investment-study.mjs';

const expect = baseExpect.configure({ timeout: 30000 });

const baseURL = process.env.PERF_URL || 'http://localhost:5177';
const label = process.env.PERF_LABEL || 'production';
const runs = Number(process.env.PERF_RUNS || 3);
const cases = process.env.PERF_CASES?.split(',') || ['study-deep', 'study-table', 'study-columns'];
const cpuRate = Number(process.env.PERF_CPU || 1);
const surface = process.env.PERF_SURFACE || 'expanded-card';
const scrollPixels = Number(process.env.PERF_SCROLL || 0);
const out = fileURLToPath(new URL(`../../output/audits/production-editor/${new Date().toISOString().replace(/[:.]/g, '-')}-${label}/`, import.meta.url));
await mkdir(out, { recursive: true });
const report = { label, baseURL, runs, headed: true, viewport: { width: 1600, height: 1000 }, typingDelayMs: 8, cpuProfile: process.env.PERF_PROFILE === '1', results: [], errors: [], notes: ['Real production app; IndexedDB seeded before application boot in isolated contexts.', 'Input-to-second-rAF is a rendering proxy, not INP. CPU profiling is optional and recorded separately; no video recording.', 'Each workload retains the 160-card research fixture. Only target placement/order changes to make it initially reachable.'] };
const browser = await chromium.launch({ headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion'] });
report.browser = browser.version();
report.surface = surface;
report.scrollPixels = scrollPixels;
report.networkFailures = [];
report.nativeTrace = process.env.PERF_TRACE === '1';
report.paintContainmentExperiment = process.env.PERF_PAINT_CONTAINMENT === 'off';
const summarize = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { n: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1), p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] || 0, max: sorted.at(-1) || 0 };
};
let currentPage;
try {
    for (let run = 0; run < runs; run++) for (const id of cases) {
        console.log(`START ${run} ${id}`);
        const context = await browser.newContext({ viewport: report.viewport });
        // Keep optional telemetry/auth requests out of local editor timings.
        // Application scripts, fonts and storage still use the real origin.
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            return url.origin === new URL(baseURL).origin || !['http:', 'https:'].includes(url.protocol)
                ? route.continue() : route.fulfill({ contentType: 'application/json', body: '{}' });
        });
        const page = await context.newPage();
        if (report.paintContainmentExperiment) await context.addInitScript(() => {
            document.addEventListener('DOMContentLoaded', () => {
                const style = document.createElement('style');
                style.textContent = '.react-flow__node .infonote-scrollable, .react-flow__node [class*="_expandedView_"] { contain: layout style !important; }';
                document.head.append(style);
            }, { once: true });
        });
        if (process.env.PERF_FOLDER === '1') {
            report.notes.push('Folder diagnostic uses native OPFS streams with a substituted picker; not the OS folder permission dialog.');
            await context.addInitScript(() => {
                window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('performance-folder', { create: true });
            });
        }
        currentPage = page;
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
        await cdp.send('Performance.enable');
        if (process.env.PERF_PROFILE === '1' || process.env.PERF_STARTUP_PROFILE === '1') await cdp.send('Profiler.enable');
        page.setDefaultTimeout(30000);
        page.on('pageerror', error => report.errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
        page.on('requestfailed', request => {
            const url = new URL(request.url());
            report.networkFailures.push({ resource: url.origin + url.pathname, error: request.failure()?.errorText });
        });
        await context.addInitScript(() => {
            const m = window.__perf = { capture: false, inputs: [], tasks: [], frames: [], visibility: [] };
            document.addEventListener('visibilitychange', () => {
                if (m.capture) m.visibility.push({ state: document.visibilityState, at: performance.now() });
            });
            new PerformanceObserver(list => { if (m.capture) m.tasks.push(...list.getEntries().map(e => e.duration)); }).observe({ type: 'longtask' });
            document.addEventListener('input', () => {
                if (!m.capture) return;
                const t = performance.now();
                requestAnimationFrame(() => requestAnimationFrame(() => m.inputs.push(performance.now() - t)));
            }, true);
            let previous = performance.now();
            const frame = now => { if (m.capture) m.frames.push(now - previous); previous = now; requestAnimationFrame(frame); };
            requestAnimationFrame(frame);
        });
        await page.route('**/__performance_seed', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Preparing isolated performance workspace</body></html>' }));
        await page.goto(`${baseURL}/__performance_seed`);
        const study = buildInvestmentStudy();
        report.manifest = study.manifest;
        report.cpuRate = cpuRate;
        const target = study.nodes.find(n => n.id === id);
        study.nodes = [target, ...study.nodes.filter(n => n !== target)];
        const firstPosition = { ...target.position };
        const room = study.nodes.find(n => n.id === 'study-room');
        room.position = firstPosition;
        target.position = { x: 100, y: 100 };
        await page.evaluate(async ({ nodes, edges }) => {
            localStorage.setItem('chnk-it-welcomed', '1');
            await new Promise((resolve, reject) => {
                const open = indexedDB.open('infonote-local-workspaces');
                open.onupgradeneeded = () => {
                    const db = open.result;
                    db.createObjectStore('workspaces', { keyPath: 'key' });
                    for (const name of ['workspace-nodes', 'workspace-edges']) db.createObjectStore(name, { keyPath: ['workspace', 'id'] }).createIndex('workspace', 'workspace');
                };
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result, tx = db.transaction(['workspaces', 'workspace-nodes', 'workspace-edges'], 'readwrite');
                    tx.objectStore('workspaces').put({ key: 'anonymous', format: 3, commit: 'performance-fixture', nodeIds: nodes.map(n => n.id), edgeIds: edges.map(e => e.id), updatedAt: Date.now() });
                    for (const node of nodes) tx.objectStore('workspace-nodes').put({ workspace: 'anonymous', id: node.id, value: node });
                    for (const edge of edges) tx.objectStore('workspace-edges').put({ workspace: 'anonymous', id: edge.id, value: edge });
                    tx.oncomplete = () => { db.close(); resolve(); };
                    tx.onerror = () => reject(tx.error);
                };
            });
        }, study);
        const started = performance.now();
        if (process.env.PERF_STARTUP_PROFILE === '1') await cdp.send('Profiler.start');
        if (process.env.PERF_STARTUP_TRACE === '1') await cdp.send('Tracing.start', {
            categories: 'devtools.timeline,blink,cc', transferMode: 'ReturnAsStream',
        });
        await page.goto(`${baseURL}/canvas`, { waitUntil: 'networkidle' });
        const navigationMs = performance.now() - started;
        expect(await page.evaluate(() => Boolean(window.__appStore)), 'production must not expose the dev store').toBe(false);
        const card = page.locator(`.react-flow__node[data-id="${id}"]`);
        await expect(card).toBeVisible();
        const cardVisibleMs = performance.now() - started;
        let folderInitialSaveMs;
        if (process.env.PERF_FOLDER === '1') {
            await page.getByRole('button', { name: 'Backup and sign-in' }).click();
            const beginFolder = performance.now();
            await page.getByRole('button', { name: 'Choose or open folder' }).click();
            await expect(page.getByText(/performance-folder — Saved to folder/)).toBeVisible({ timeout: 60000 });
            folderInitialSaveMs = performance.now() - beginFolder;
            await page.getByRole('button', { name: 'Back', exact: true }).click();
        }
        const activate = async () => {
            // Benchmark setup uses the app's focus command. All measured
            // typing, scrolling and editor interactions use real input.
            await expect(card).toBeVisible({ timeout: 30000 });
            const owner = surface === 'fullscreen' ? page.locator('[data-chnk-it-block-editor]').first() : card.locator('[data-chnk-it-block-editor]').first();
            if (surface === 'fullscreen') {
                await page.evaluate(id => window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id], duration: 0 } })), id);
                await card.getByTitle('Full Screen', { exact: true }).evaluate(button => button.click());
            } else {
                // On a throttled cold reload the card can precede the focus
                // listener/initial fit. Do not lose the one bootstrap command.
                let visibleSince;
                await expect.poll(async () => {
                    if (await owner.isVisible()) {
                        visibleSince ??= performance.now();
                        return performance.now() - visibleSince >= 250;
                    }
                    visibleSince = undefined;
                    await page.evaluate(id => window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id], duration: 0 } })), id);
                    return false;
                }, { timeout: 30000, intervals: [100, 250, 500] }).toBe(true);
            }
            await expect(owner).toBeVisible({ timeout: 30000 });
            return owner;
        };
        const live = await activate();
        const editorVisibleMs = performance.now() - started;
        await expect(live).toBeVisible({ timeout: 30000 });
        let editableIndex = id === 'study-table' ? 8 : 0;
        let editable = live.locator('[contenteditable="true"]').nth(editableIndex);
        if (scrollPixels && surface !== 'fullscreen') {
            const area = card.locator('.infonote-scrollable').first();
            await area.hover(); await page.mouse.wheel(0, scrollPixels);
            await page.waitForTimeout(250);
            const index = await live.locator('[contenteditable="true"]').evaluateAll(els => els.findIndex(el => {
                const r = el.getBoundingClientRect(), a = el.closest('.infonote-scrollable').getBoundingClientRect();
                return r.top > a.top + 30 && r.bottom < a.bottom - 30;
            }));
            expect(index, 'a scrolled expanded-card editable must remain reachable').toBeGreaterThanOrEqual(0);
            editable = live.locator('[contenteditable="true"]').nth(index);
            editableIndex = index;
        }
        const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
        if (bounds.windowState === 'minimized') await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        await page.bringToFront();
        await editable.click();
        await page.keyboard.press('End');
        const anchorBefore = await editable.evaluate(el => ({ top: el.getBoundingClientRect().top, scroll: el.closest('.infonote-scrollable')?.scrollTop }));
        await page.waitForFunction(() => document.visibilityState === 'visible' && document.hasFocus(), null, { timeout: 15000 });
        const marker = ` Verified production ${run}: reconcile evidence, risks and assumptions before the next research review. `;
        const openMs = performance.now() - started;
        if (process.env.PERF_STARTUP_PROFILE === '1') {
            const { profile } = await cdp.send('Profiler.stop');
            await writeFile(path.join(out, `${run}-${id}-startup.cpuprofile`), JSON.stringify(profile));
        }
        if (process.env.PERF_STARTUP_TRACE === '1') {
            const finished = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
            await cdp.send('Tracing.end');
            const { stream } = await finished;
            let trace = '';
            while (true) {
                const chunk = await cdp.send('IO.read', { handle: stream });
                trace += chunk.data;
                if (chunk.eof) break;
            }
            await cdp.send('IO.close', { handle: stream });
            await writeFile(path.join(out, `${run}-${id}-startup.trace.json`), trace);
        }
        const perfBefore = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        if (process.env.PERF_PROFILE === '1') await cdp.send('Profiler.start');
        if (process.env.PERF_TRACE === '1') await cdp.send('Tracing.start', {
            categories: 'devtools.timeline,blink,accessibility', transferMode: 'ReturnAsStream',
        });
        await page.evaluate(() => { window.__perf.capture = true; });
        const typingStarted = performance.now();
        console.log(`TYPE ${run} ${id}`);
        let typingTimer;
        try {
            await Promise.race([
                page.keyboard.type(marker, { delay: report.typingDelayMs }),
                new Promise((_, reject) => { typingTimer = setTimeout(() => reject(Error(`Typing exceeded 60s in ${id}`)), 60000); }),
            ]);
        } catch (error) {
            if (process.env.PERF_PROFILE === '1') {
                const { profile } = await cdp.send('Profiler.stop');
                await writeFile(path.join(out, `${run}-${id}-timeout.cpuprofile`), JSON.stringify(profile));
            }
            throw error;
        } finally { clearTimeout(typingTimer); }
        const typingWallMs = performance.now() - typingStarted;
        console.log(`TYPED ${run} ${id} ${Math.round(typingWallMs)}ms`);
        await page.waitForTimeout(120);
        await expect.poll(() => page.evaluate(() => window.__perf.inputs.length), { timeout: 5000 }).toBe(marker.length);
        const metrics = await page.evaluate(() => {
            window.__perf.capture = false;
            const deferred = Array.from(document.querySelectorAll('[data-defer-offscreen]'));
            // The wrapper's own box remains visible even when its content is
            // skipped. Check a descendant, not the containment box itself.
            const skipped = deferred.filter(el => {
                const child = el.querySelector('[contenteditable="true"]') || el.firstElementChild;
                return child && !child.checkVisibility({ contentVisibilityAuto: true });
            }).length;
            return { ...window.__perf, visibilityState: document.visibilityState, dom: document.querySelectorAll('*').length, editors: document.querySelectorAll('[data-chnk-it-block-editor]').length, deferred: deferred.length, skipped };
        });
        expect(metrics.visibilityState, 'benchmark page must stay visible').toBe('visible');
        expect(metrics.visibility.filter(entry => entry.state !== 'visible'), 'backgrounded runs are not foreground typing measurements').toHaveLength(0);
        if (process.env.PERF_PROFILE === '1') {
            const { profile } = await cdp.send('Profiler.stop');
            await writeFile(path.join(out, `${run}-${id}.cpuprofile`), JSON.stringify(profile));
        }
        if (process.env.PERF_TRACE === '1') {
            const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
            await cdp.send('Tracing.end');
            const { stream } = await complete;
            let trace = '';
            for (;;) {
                const chunk = await cdp.send('IO.read', { handle: stream });
                trace += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data;
                if (chunk.eof) break;
            }
            await cdp.send('IO.close', { handle: stream });
            await writeFile(path.join(out, `${run}-${id}.trace.json`), trace);
        }
        const perfAfter = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        const anchorAfter = await editable.evaluate(el => ({ top: el.getBoundingClientRect().top, scroll: el.closest('.infonote-scrollable')?.scrollTop }));
        const editedCell = id === 'study-table' ? await editable.evaluate(el => ({
            block: el.closest('[data-block-id]')?.getAttribute('data-block-id'),
            row: Number(el.getAttribute('data-table-row')), column: Number(el.getAttribute('data-table-column')),
            text: el.textContent,
        })) : null;
        const result = { run, id, openMs, folderInitialSaveMs, startup: { navigationMs, cardVisibleMs, editorVisibleMs }, inputToSecondFrameMs: summarize(metrics.inputs), longTasksMs: summarize(metrics.tasks), frameIntervalMs: summarize(metrics.frames), dom: metrics.dom, editors: metrics.editors, persistedAndReloaded: false };
        Object.assign(result, { deferredBlocks: metrics.deferred, skippedBlocks: metrics.skipped, visibility: { state: metrics.visibilityState, changes: metrics.visibility }, typingWallMs, anchorBefore, anchorAfter,
            browserWorkMs: Object.fromEntries(['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].map(key => [key, (perfAfter[key] - perfBefore[key]) * 1000])) });
        report.results.push(result);
        await writeFile(path.join(out, `${run}-${id}-samples.json`), JSON.stringify({ inputs: metrics.inputs, tasks: metrics.tasks, frames: metrics.frames }));
        await writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
        const persisted = async () => page.evaluate(id => new Promise((resolve, reject) => {
            const open = indexedDB.open('infonote-local-workspaces');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result, tx = db.transaction('workspace-nodes', 'readonly');
                const request = tx.objectStore('workspace-nodes').get(['anonymous', id]);
                request.onsuccess = () => resolve(request.result?.value.data.content);
                tx.oncomplete = () => db.close();
            };
        }), id);
        console.log(`SAVE ${run} ${id}`);
        // A max-wait autosave can already contain marker.trim() while the final
        // typed space is still in the editor debounce. Acknowledgement must
        // include that last input before freezing the reload comparison.
        await expect.poll(async () => JSON.stringify(await persisted()), { timeout: 15000 }).toContain(marker);
        if (editedCell) await expect.poll(async () => {
            const graph = await persisted();
            return graph?.find(block => block.id === editedCell.block)?.metadata?.rows?.[editedCell.row]?.[editedCell.column];
        }, { timeout: 15000 }).toBe(editedCell.text);
        const saved = await persisted();
        if (process.env.PERF_FOLDER === '1') {
            await expect.poll(() => page.evaluate(async ({ id, saved }) => {
                const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('performance-folder')).getDirectoryHandle('chnk-it-workspace');
                const head = JSON.parse(await (await (await dir.getFileHandle('workspace.json')).getFile()).text());
                const entry = head.nodes.find(n => n.id === id);
                return entry ? JSON.stringify(JSON.parse(await (await (await dir.getFileHandle(entry.file)).getFile()).text()).data.content) === JSON.stringify(saved) : false;
            }, { id, saved }), { timeout: 60000 }).toBe(true);
            result.folderEditVerified = true;
        }
        console.log(`RELOAD ${run} ${id}`);
        await page.reload({ waitUntil: 'networkidle' });
        expect(await persisted()).toEqual(saved);
        console.log(`REACTIVATE ${run} ${id}`);
        const restoredEditor = await activate();
        await expect(restoredEditor.locator('[contenteditable="true"]').nth(editableIndex)).toContainText(marker.trim(), { timeout: 15000 });
        console.log(`VERIFIED ${run} ${id}`);
        await page.keyboard.press('Escape');
        if (surface === 'fullscreen' && await page.locator('[data-chnk-it-block-editor]').count()) await page.keyboard.press('Escape');
        result.persistedAndReloaded = true;
        if (process.env.PERF_SOAK === '1' && run === 0 && id === (process.env.PERF_SOAK_CASE || 'study-deep')) {
            const cycle = async () => {
                await activate();
                await expect(page.locator('[data-chnk-it-block-editor]')).toHaveCount(1, { timeout: 30000 });
                if (process.env.PERF_SOAK_FOCUS === '1') await page.locator('[data-chnk-it-block-editor] [contenteditable="true"]').first().click();
                await page.keyboard.press('Escape');
                if (surface === 'fullscreen' && await page.locator('[data-chnk-it-block-editor]').count()) await page.keyboard.press('Escape');
                if (surface !== 'fullscreen') await page.locator('.react-flow__pane').click({ position: { x: 15, y: 30 }, force: true });
                await expect(page.locator('[data-chnk-it-block-editor]')).toHaveCount(0);
            };
            await cdp.send('Performance.enable');
            const retained = async () => {
                await cdp.send('HeapProfiler.collectGarbage');
                const dom = await cdp.send('Memory.getDOMCounters');
                const perf = await cdp.send('Performance.getMetrics');
                return { ...dom, heapBytes: perf.metrics.find(m => m.name === 'JSHeapUsedSize')?.value };
            };
            for (let i = 0; i < 3; i++) await cycle();
            const before = await retained(), samples = [];
            for (let i = 1; i <= 20; i++) {
                await cycle();
                if (i % 5 === 0) samples.push({ cycle: i, ...await retained() });
            }
            result.soak = { before, samples, cycles: 20, focused: process.env.PERF_SOAK_FOCUS === '1', protocol: '3 warmup cycles, then GC and counters after each 5 close/open cycles; optional focus, no edits during soak' };
            const after = samples.at(-1);
            expect(after.nodes).toBeLessThanOrEqual(before.nodes + 500);
            expect(after.jsEventListeners).toBeLessThanOrEqual(before.jsEventListeners + 16);
        }
        console.log(JSON.stringify(result));
        await context.close();
        await writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
    }
} catch (error) {
    report.failure = error.stack;
    if (currentPage && !currentPage.isClosed()) {
        report.failureState = await currentPage.evaluate(() => ({
            viewport: document.querySelector('.react-flow__viewport') && getComputedStyle(document.querySelector('.react-flow__viewport')).transform,
            editors: document.querySelectorAll('[data-chnk-it-block-editor]').length,
            selectedCards: [...document.querySelectorAll('.react-flow__node.selected')].map(el => el.getAttribute('data-id')),
            visibility: document.visibilityState,
        })).catch(() => null);
        await currentPage.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    }
    throw error;
} finally {
    await writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
    console.log(`REPORT ${out}`);
    await browser.close();
}
