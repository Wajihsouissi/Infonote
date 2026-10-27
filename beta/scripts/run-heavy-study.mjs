import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { buildInvestmentStudy, imagePages } from '../qa/investment-study.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(repo, 'output', 'audits', 'headed-investment-study', stamp);
const baseURL = process.env.STUDY_BASE_URL || 'http://localhost:5174';
const only = process.env.STUDY_PHASES ? new Set(process.env.STUDY_PHASES.split(',')) : null;
await mkdir(out, { recursive: true });
const report = { started: new Date().toISOString(), baseURL, build: 'development (real application, not the isolated editor fixture)', headed: true, viewport: { width: 1600, height: 1000 }, typingDelayMs: 8, phases: [], errors: [], networkFailures: [], sources: [], images: [], notes: ['Bulk initial content loaded via the existing development graph-loading path; all subsequent editing and navigation uses real UI.', 'Fresh isolated persistent browser profile; no signed-in account or existing user workspace.', 'Input-to-second-animation-frame is a proxy, not official INP. Debug instrumentation and development React add overhead.'] };
const context = await chromium.launchPersistentContext(path.join(out, 'browser-profile'), {
  headless: false, viewport: report.viewport, deviceScaleFactor: 1,
  recordVideo: { dir: path.join(out, 'video'), size: { width: 1280, height: 800 } },
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = context.pages()[0] || await context.newPage();
const cdp = await context.newCDPSession(page);
const profileCPU = process.env.STUDY_PROFILE === '1';
await cdp.send('Performance.enable');
if (profileCPU) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); }
page.setDefaultTimeout(15000);
page.on('pageerror', error => report.errors.push({ kind: 'uncaught', url: page.url(), message: error.message }));
page.on('console', message => { if (message.type() === 'error') report.errors.push({ kind: 'console', url: page.url(), message: message.text() }); });
page.on('requestfailed', request => report.networkFailures.push({ url: request.url(), error: request.failure()?.errorText }));
const save = async () => { await writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); };
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0, p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] || 0, max: sorted.at(-1) || 0 };
};
await context.addInitScript(() => {
  localStorage.setItem('chnk-it-welcomed', '1');
  const metrics = window.__studyMetrics = { inputs: [], longTasks: [], events: [], frames: [], writes: [] };
  new PerformanceObserver(list => { for (const entry of list.getEntries()) metrics.longTasks.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask' });
  new PerformanceObserver(list => { for (const entry of list.getEntries()) metrics.events.push({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId }); }).observe({ type: 'event', durationThreshold: 16 });
  document.addEventListener('input', () => {
    const started = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => metrics.inputs.push(performance.now() - started)));
  }, true);
  let previous = performance.now();
  const frame = now => { if (metrics.captureFrames) metrics.frames.push(now - previous); previous = now; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    metrics.writes.push({ store: this.name, at: performance.now() });
    return put.apply(this, args);
  };
});
const state = () => page.evaluate(() => {
  const store = window.__appStore?.getState();
  return store && { nodes: store.nodes, edges: store.edges, currentParentId: store.currentParentId, breadcrumbs: store.breadcrumbs, fullscreenId: store.fullscreenId, centerPanelId: store.centerPanelId, rightSidePanelId: store.rightSidePanelId, leftSidePanelId: store.leftSidePanelId, dirty: store.storage.isLocalDirty };
});
const node = id => page.locator(`.react-flow__node[data-id="${id}"]`);
const pane = page.locator('.react-flow__pane');
const editor = '[data-chnk-it-block-editor]';
const screenshot = async name => { const file = `${name}.png`; await page.screenshot({ path: path.join(out, file), fullPage: false, timeout: 15000 }); return file; };
async function phase(name, action) {
  if (only && name !== 'load-heavy-workspace' && !only.has(name)) return { name, status: 'skipped' };
  console.log(`START ${name}`);
  await page.evaluate(() => { const m = window.__studyMetrics; if (m) { for (const key of ['inputs', 'longTasks', 'events', 'frames', 'writes']) m[key] = []; m.captureFrames = true; } }).catch(() => {});
  const started = performance.now();
  const captureProfile = profileCPU && ['load-heavy-workspace', 'deep-dossier-fast-typing'].includes(name);
  const perfBefore = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  if (captureProfile) await cdp.send('Profiler.start');
  const item = { name, status: 'passed' };
  try { item.details = await action(); }
  catch (error) { item.status = 'failed'; item.error = error.stack; item.screenshot = await screenshot(`FAIL-${report.phases.length}-${name}`).catch(() => null); await writeFile(path.join(out, `FAIL-${report.phases.length}-visible.txt`), (await page.locator('body').innerText().catch(() => '')).slice(0, 18000)); }
  item.wallMs = performance.now() - started;
  const perfAfter = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  item.browserWork = Object.fromEntries(['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration', 'LayoutCount', 'RecalcStyleCount'].map(key => [key.endsWith('Duration') ? key + 'Ms' : key, (perfAfter[key] - perfBefore[key]) * (key.endsWith('Duration') ? 1000 : 1)]));
  if (captureProfile) {
    const { profile } = await cdp.send('Profiler.stop');
    item.cpuProfile = `${name}.cpuprofile`;
    await writeFile(path.join(out, item.cpuProfile), JSON.stringify(profile));
  }
  const observed = await page.evaluate(() => {
    const m = window.__studyMetrics;
    if (!m) return null;
    m.captureFrames = false;
    return { inputs: m.inputs, longTasks: m.longTasks, events: m.events, frames: m.frames, writes: m.writes, dom: document.querySelectorAll('*').length, liveEditors: document.querySelectorAll('[data-chnk-it-block-editor]').length, mountedCards: document.querySelectorAll('.react-flow__node').length, heapBytes: performance.memory?.usedJSHeapSize, images: [...document.images].map(image => ({ src: image.currentSrc, complete: image.complete, width: image.naturalWidth })) };
  }).catch(() => null);
  if (observed) item.metrics = { inputToSecondFrameMs: summary(observed.inputs), frameIntervalMs: summary(observed.frames), longTasks: summary(observed.longTasks.map(t => t.duration)), longTaskTotalMs: observed.longTasks.reduce((sum, t) => sum + t.duration, 0), thresholdedEventsMs: summary(observed.events.map(e => e.duration)), idbWrites: observed.writes.length, ...Object.fromEntries(['dom', 'liveEditors', 'mountedCards', 'heapBytes', 'images'].map(key => [key, observed[key]])) };
  report.phases.push(item); await save(); console.log(`${item.status.toUpperCase()} ${name} ${Math.round(item.wallMs)}ms ${item.error?.split('\n')[0] || ''}`);
  return item;
}
async function settleSave() {
  // Let the editor's 300ms quiet debounce publish before testing the owner's dirty flag.
  await page.waitForTimeout(400);
  await expect.poll(async () => (await state())?.dirty, { timeout: 30000 }).toBe(false);
}
async function blur() {
  const editing = await page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA'].includes(el.tagName));
  });
  // Escape on bare nested canvas means go up; do not confuse it with blur.
  if (editing) await page.keyboard.press('Escape');
  await pane.click({ position: { x: 35, y: 65 }, force: true });
}
async function fit() { await blur(); await page.keyboard.press('5'); await page.waitForTimeout(800); }
async function select(id) {
  const card = node(id); await expect(card).toBeAttached({ timeout: 20000 });
  const shield = card.locator('.interaction-overlay');
  if (await shield.count()) await shield.click({ force: true });
  else await card.locator('.custom-drag-handle').first().click({ force: true });
  return card;
}
async function focusCard(id) {
  await fit();
  // Fit frames the whole board. Centre the requested card with real keyboard
  // panning before the focus shortcut returns it to a readable scale.
  const target = (await state()).nodes.find(n => n.id === id);
  if (!target) throw Error(`Card ${id} missing from the document`);
  for (let attempt = 0; attempt < 5; attempt++) {
    const camera = await page.locator('.react-flow__viewport').evaluate(el => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { x: m.e, y: m.f, zoom: m.a };
    });
    const box = await pane.boundingBox();
    const dx = box.width / 2 - (camera.x + (target.position.x + (target.style?.width || 432) / 2) * camera.zoom);
    const dy = box.height / 2 - (camera.y + (target.position.y + (target.style?.height || 260) / 2) * camera.zoom);
    if (Math.abs(dx) < 140 && Math.abs(dy) < 140) break;
    for (const [delta, positive, negative] of [[dx, 'ArrowLeft', 'ArrowRight'], [dy, 'ArrowUp', 'ArrowDown']]) {
      if (Math.abs(delta) < 80) continue;
      const key = delta > 0 ? positive : negative;
      await page.keyboard.down(key);
      await page.waitForTimeout(Math.max(80, Math.min(1800, Math.abs(delta) * 1000 / (18 * 60))));
      await page.keyboard.up(key);
    }
    await page.waitForTimeout(220);
  }
  const card = await select(id);
  // Blur the text input without clearing selection before the canvas focus shortcut.
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press('f'); await page.waitForTimeout(850);
  await select(id); return card;
}
async function toHome() {
  const snap = await state();
  if (!snap.currentParentId) return;
  const label = snap.breadcrumbs.at(-1)?.label;
  const strip = page.getByRole('button', { name: label, exact: true }).first().locator('xpath=ancestor::div[contains(@class,"_container_")][1]');
  await strip.getByRole('button').first().click();
  await expect.poll(async () => (await state())?.currentParentId, { timeout: 30000 }).toBe(null);
  await page.waitForTimeout(800);
}
async function openNested(id) {
  const card = await focusCard(id);
  await card.getByTitle('Open Card', { exact: true }).first().click();
  await expect.poll(async () => (await state())?.currentParentId, { timeout: 30000 }).toBe(id);
  await page.waitForTimeout(1100);
}

try {
  await phase('google-image-research', async () => {
    await page.goto('https://www.google.com/search?tbm=isch&q=site%3Acommons.wikimedia.org+silicon+wafer+server+rack+ASML', { waitUntil: 'domcontentloaded', timeout: 25000 });
    const reject = page.getByRole('button', { name: /Reject all|Tout refuser|Alle ablehnen/ }).first();
    if (await reject.isVisible().catch(() => false)) await reject.click();
    const links = await page.locator('a[href*="commons.wikimedia.org"]').evaluateAll(els => els.map(el => ({ text: el.innerText.slice(0, 120), href: el.href })).slice(0, 12));
    if (!links.length) throw Error('Google returned no usable source results (challenge/rate limit); use verified Wikimedia originals without bypassing the challenge.');
    return { title: await page.title(), links, screenshot: await screenshot('00-google-images') };
  });
  // Follow the discovered source pages and retain real photos and file credits.
  const assetCache = path.join(repo, 'beta', 'node_modules', '.cache', 'headed-study-photos');
  await mkdir(assetCache, { recursive: true });
  for (const image of imagePages) {
    try {
      // Original URLs verified from the file pages; do not retry rate-limited HTML pages.
      const url = image.originalUrl;
      const cacheFile = path.join(assetCache, path.basename(new URL(url).pathname));
      let bytes;
      try { bytes = await readFile(cacheFile); }
      catch {
        if (process.env.STUDY_CACHED_PHOTOS === '1') throw Error('Photo is not in the evidence cache');
        const asset = await context.request.get(url, { timeout: 30000 });
        if (!asset.ok() || !asset.headers()['content-type']?.startsWith('image/')) throw Error(`Photo request ${asset.status()}`);
        bytes = await asset.body();
        await writeFile(cacheFile, bytes);
      }
      const filename = `photo-${report.images.length}.jpg`;
      await writeFile(path.join(out, filename), bytes);
      report.images.push({ ...image, url, originalUrl: url, localFile: filename, bytes: bytes.length });
    } catch (error) { report.notes.push(`Image source unavailable: ${image.page}: ${error.message}`); }
  }
  if (report.images.length < 2) throw Error('At least two real source photos are required for this workload; see image-source notes.');
  // Only inbound source photographs are allowed off-origin; app data never goes to services.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin || !['http:', 'https:'].includes(url.protocol)) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  // Real downloaded source photos are served once from the evidence cache.
  // Do not duplicate megabytes of base64 into every card or every state-oracle read.
  for (const image of report.images) await context.route(image.url, async route => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: await readFile(path.join(out, image.localFile)) });
  });
  const study = buildInvestmentStudy(report.images);
  if (process.env.STUDY_RESTORE_FILE) {
    const restored = JSON.parse(await readFile(path.resolve(process.env.STUDY_RESTORE_FILE), 'utf8'));
    assert.ok(Array.isArray(restored.nodes) && Array.isArray(restored.edges), 'restored study must contain a graph');
    study.nodes = restored.nodes;
    study.edges = restored.edges;
    study.manifest = { ...study.manifest, totalCards: study.nodes.length, rootCards: study.nodes.filter(n => !n.parentId).length };
    report.notes.push(`Replay of saved heavy workspace: ${path.basename(process.env.STUDY_RESTORE_FILE)}; content counts describe the original fixture, including later edits.`);
  }
  if (process.env.STUDY_SMALL === '1') {
    const deep = study.nodes.find(n => n.id === 'study-deep');
    deep.data.content = deep.data.content.slice(0, 10);
    study.nodes = [deep]; study.edges = [];
    study.manifest = { ...study.manifest, rootCards: 1, totalCards: 1, blocks: 10, tableCells: 0, imageBlocks: 0, deepDossierBlocks: 10, initialNestedDepth: 0 };
    report.notes.push('Small control run to distinguish keyboard behavior from heavy-content performance.');
  }
  report.manifest = { ...study.manifest, images: report.images.map(({ url: _url, ...image }) => image) };
  report.images = report.manifest.images;
  // Portable specimen uses source image URLs; downloaded copies accompany the report.
  await writeFile(path.join(out, 'study-workspace.json'), JSON.stringify({ version: 1, nodes: study.nodes, edges: study.edges }));
  await phase('load-heavy-workspace', async () => {
    await page.goto(`${baseURL}/canvas`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await expect(pane).toBeVisible({ timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__appStore), null, { timeout: 30000 });
    await page.waitForTimeout(700);
    await page.evaluate(({ nodes, edges }) => window.__appStore.getState().loadGraph(nodes, edges), study);
    await expect(node(study.nodes[0].id)).toBeAttached({ timeout: 30000 });
    await settleSave();
    await fit();
    return { ...report.manifest, screenshot: await screenshot('01-research-room-overview') };
  });
  if (!(await state())?.nodes.some(n => n.id === 'study-deep')) throw Error('Heavy workspace did not load');

  await phase('deep-dossier-fast-typing', async () => {
    const card = await focusCard('study-deep');
    const live = card.locator(editor); await expect(live).toBeVisible({ timeout: 30000 });
    const editable = live.locator('[data-block-type="text"] [contenteditable="true"]').first();
    await editable.click(); await page.keyboard.press('End');
    const marker = ' Evidence review: separate verified demand from model assumptions. '; // 65 chars, 8ms/key
    await page.keyboard.type(marker, { delay: report.typingDelayMs });
    await settleSave();
    const saved = (await state()).nodes.find(n => n.id === 'study-deep').data.content;
    expect(JSON.stringify(saved)).toContain(marker.trim());
    const area = card.locator('[class*="noteArea"]').first();
    await area.hover(); await page.mouse.wheel(0, 2100); await page.waitForTimeout(300);
    const visible = await area.locator('[contenteditable="true"]').evaluateAll(els => els.findIndex(el => { const r = el.getBoundingClientRect(), a = el.closest('[class*="noteArea"]').getBoundingClientRect(); return r.top > a.top + 40 && r.bottom < a.bottom - 40; }));
    expect(visible, 'a scrolled editable must be reachable').toBeGreaterThanOrEqual(0);
    const target = area.locator('[contenteditable="true"]').nth(visible);
    await target.click();
    // Geometry discovery may render previously skipped text. Start the typing
    // check after that discovery; also assert the actual visual anchor.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before = await area.evaluate(el => el.scrollTop);
    const anchorBefore = await target.evaluate(el => el.getBoundingClientRect().top);
    await page.keyboard.type(' [reviewed]', { delay: 8 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await area.evaluate(el => el.scrollTop);
    const anchorAfter = await target.evaluate(el => el.getBoundingClientRect().top);
    expect(Math.abs(after - before), 'editing a scrolled note unexpectedly resets scroll').toBeLessThan(90);
    expect(Math.abs(anchorAfter - anchorBefore), 'the edited paragraph jumps visually').toBeLessThan(50);
    return { savedBlocks: saved.length, typedCharacters: marker.length + 11, scrollBefore: before, scrollAfter: after, anchorBefore, anchorAfter, screenshot: await screenshot('02-deep-dossier-editing') };
  });

  await phase('large-table-edit-and-grow', async () => {
    const card = await focusCard('study-table');
    const live = card.locator(editor); await expect(live).toBeVisible({ timeout: 30000 });
    const mainTable = live.locator('table').first();
    const cells = mainTable.locator('[contenteditable="true"]');
    await expect(cells).toHaveCount(121 * 8);
    await cells.nth(8).click(); await page.keyboard.press('End');
    await page.keyboard.type(' — committee reviewed', { delay: 8 });
    await page.keyboard.press('Tab'); await page.keyboard.type('123', { delay: 8 });
    await settleSave();
    const blocks = (await state()).nodes.find(n => n.id === 'study-table').data.content;
    expect(blocks[0].metadata.rows[1][0]).toContain('committee reviewed');
    expect(blocks[0].metadata.rows[1][1]).toContain('123');
    await live.getByRole('button', { name: 'Add row', exact: true }).first().click();
    await expect(cells).toHaveCount(122 * 8);
    return { cellsBefore: 968, cellsAfter: 976, screenshot: await screenshot('03-scenario-table') };
  });

  await phase('nested-columns-fast-edit', async () => {
    const card = await focusCard('study-columns');
    const live = card.locator(editor).first(); await expect(live).toBeVisible({ timeout: 30000 });
    const editables = live.locator('[contenteditable="true"]');
    await editables.first().click(); await page.keyboard.press('Home');
    await page.keyboard.type('Counter-thesis review: ', { delay: 8 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Track correlated risks before combining exposures.', { delay: 8 });
    await settleSave();
    expect(JSON.stringify((await state()).nodes.find(n => n.id === 'study-columns').data.content)).toContain('Track correlated risks');
    return { editables: await editables.count(), screenshot: await screenshot('04-nested-columns') };
  });

  await phase('switch-card-view-modes', async () => {
    const results = [];
    for (const mode of ['Center Peek', 'Side Panel (Right)', 'Side Panel (Left)', 'Full Screen']) {
      try {
      const card = await focusCard('study-deep');
      const started = performance.now();
      await card.getByTitle(mode, { exact: true }).first().click();
      await expect.poll(async () => { const s = await state(); return !!(s.fullscreenId || s.centerPanelId || s.rightSidePanelId || s.leftSidePanelId); }).toBe(true);
      const layer = page.locator(editor).last(); await expect(layer).toBeVisible({ timeout: 30000 });
      const edit = layer.locator('[contenteditable="true"]').first(); await edit.click(); await page.keyboard.press('End');
      await page.keyboard.type(` [${mode} checked]`, { delay: 8 });
      await settleSave();
      const openMs = performance.now() - started;
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      const first = await state();
      const firstEscapeClosed = !(first.fullscreenId || first.centerPanelId || first.rightSidePanelId || first.leftSidePanelId);
      if (!firstEscapeClosed) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
      const second = await state();
      results.push({ mode, firstEscapeClosed, secondEscapeClosed: !(second.fullscreenId || second.centerPanelId || second.rightSidePanelId || second.leftSidePanelId), openEditSaveCloseMs: openMs });
      await expect.poll(async () => { const s = await state(); return !!(s.fullscreenId || s.centerPanelId || s.rightSidePanelId || s.leftSidePanelId); }).toBe(false);
      results.at(-1).status = 'passed';
      } catch (error) {
        const entry = results.at(-1)?.mode === mode ? results.at(-1) : { mode };
        if (results.at(-1) !== entry) results.push(entry);
        Object.assign(entry, { status: 'failed', error: error.message, screenshot: await screenshot(`view-${results.length}-failure`) });
        // Recover through the visible close control, so a broken Escape does not hide later findings.
        const close = page.locator('button[aria-label="Close"]:visible, button[title="Close Panel"]:visible').last();
        if (await close.count()) await close.click();
        else await page.mouse.click(8, 400);
        await page.waitForTimeout(500);
      }
    }
    report.viewModes = results;
    expect(results.filter(result => result.status === 'failed'), 'view modes with a broken editing/close flow').toHaveLength(0);
    return results;
  });

  await phase('generate-large-nested-mind-map', async () => {
    await toHome();
    const before = await state();
    await openNested('study-deep');
    await expect.poll(async () => (await state()).nodes.filter(n => n.parentId === 'study-deep').length, { timeout: 45000 }).toBeGreaterThan(100);
    const s = await state();
    const children = s.nodes.filter(n => n.parentId === 'study-deep');
    const represented = new Set(children.flatMap(n => Array.isArray(n.data?.content) ? n.data.content.map(b => b.id) : []));
    const original = s.nodes.find(n => n.id === 'study-deep').data.content;
    const meaningful = b => b.type === 'table' ? b.metadata?.rows?.some(row => row.some(cell => cell.trim())) : b.type !== 'divider' && b.content.trim();
    const missing = original.filter(b => meaningful(b) && !represented.has(b.id));
    // Chapter nodes may own section content under another parent; inspect every generated descendant too.
    const allRepresented = new Set(s.nodes.filter(n => !before.nodes.some(old => old.id === n.id)).flatMap(n => Array.isArray(n.data?.content) ? n.data.content.map(b => b.id) : []));
    const trulyMissing = missing.filter(b => !allRepresented.has(b.id));
    await fit();
    const shot = await screenshot('05-generated-mind-map');
    await pane.hover();
    for (let i = 0; i < 12; i++) await page.mouse.wheel(i % 2 ? -400 : 500, i % 3 ? 260 : -180);
    await page.waitForTimeout(700);
    expect(trulyMissing, 'nonempty original blocks omitted from generated map').toHaveLength(0);
    await expect(page.locator(editor), 'inactive map nodes must not mount live editors').toHaveCount(0);
    return { originalBlocks: original.length, directChildren: children.length, generatedCards: s.nodes.length - before.nodes.length, totalCards: s.nodes.length, missingBlocks: trulyMissing.map(b => b.id), screenshot: shot };
  });

  await phase('overview-pan-only', async () => {
    await toHome(); await openNested('study-deep'); await fit(); await blur();
    await page.waitForTimeout(800);
    await expect(page.locator(editor)).toHaveCount(0);
    await expect(page.locator('[data-canvas-overview]').first()).toBeAttached();
    await pane.hover();
    await page.evaluate(() => { window.__panFrames = []; window.__panCapturing = true;
      let previous;
      const frame = now => { if (!window.__panCapturing) return; if (previous !== undefined) window.__panFrames.push(now - previous); previous = now; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });
    const start = await page.locator('.react-flow__viewport').getAttribute('style');
    // Real held arrow keys exercise the same camera path without visiting cards.
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.down(key); await page.waitForTimeout(600); await page.keyboard.up(key);
    }
    const frames = await page.evaluate(() => { window.__panCapturing = false; return window.__panFrames; });
    const end = await page.locator('.react-flow__viewport').getAttribute('style');
    expect(frames.length).toBeGreaterThan(20);
    expect(start).not.toBe(end);
    const dom = await page.locator('*').count();
    const cards = await page.locator('.react-flow__node').count();
    const overviewCards = await page.locator('[data-canvas-overview]').count();
    await writeFile(path.join(out, 'overview-pan-frames.json'), JSON.stringify(frames));
    return { panOnlyFrameMs: summary(frames), dom, cards, overviewCards, screenshot: await screenshot('05b-overview-pan') };
  });

  await phase('nested-map-edit-roundtrip', async () => {
    if ((await state()).currentParentId !== 'study-deep') { await toHome(); await openNested('study-deep'); }
    const s = await state();
    const leaf = s.nodes.find(n => n.parentId === 'study-deep' && n.data?.content?.some(b => b.type === 'text'));
    if (!leaf) throw Error('No generated text leaf on the active nested canvas');
    const card = await focusCard(leaf.id);
    const live = card.locator(editor); await expect(live).toBeVisible({ timeout: 30000 });
    await live.locator('[data-block-type="text"] [contenteditable="true"]').first().click(); await page.keyboard.press('End');
    const marker = ' Map-side evidence verified.';
    await page.keyboard.type(marker, { delay: 8 }); await settleSave();
    expect(JSON.stringify((await state()).nodes.find(n => n.id === 'study-deep').data.content)).toContain(marker.trim());
    await toHome();
    const parent = await focusCard('study-deep');
    await expect(parent.locator(editor)).toContainText(marker.trim());
    return { generatedLeaf: leaf.id, parentRetainsMapEdit: true, screenshot: await screenshot('06-map-to-note-roundtrip') };
  });

  await phase('three-level-navigation-and-return', async () => {
    await toHome(); await openNested('study-columns');
    const hops = [];
    for (const id of ['nested-0-0', 'nested-1-0']) { await openNested(id); const s = await state(); hops.push({ parent: s.currentParentId, breadcrumbDepth: s.breadcrumbs.length, cards: s.nodes.filter(n => n.parentId === id).length }); }
    expect(hops.at(-1).breadcrumbDepth).toBeGreaterThanOrEqual(4);
    const shot = await screenshot('07-deep-nested-canvas'); await toHome();
    expect((await state()).nodes.filter(n => !n.parentId).length).toBe(study.manifest.rootCards);
    return { hops, screenshot: shot };
  });

  await phase('rapid-card-switching-and-canvas-pan', async () => {
    await toHome();
    const visits = [];
    for (const id of ['study-room', 'study-deep', 'study-table', 'study-columns', 'sector-0-0', 'sector-2-1', 'study-deep', 'study-room']) {
      const started = performance.now(); const card = await focusCard(id);
      await expect(card.locator(editor).first()).toBeVisible({ timeout: 30000 });
      visits.push({ id, wallMs: performance.now() - started, liveEditors: await page.locator(editor).count() });
    }
    await fit(); const box = await pane.boundingBox();
    const cameraBefore = await page.locator('.react-flow__viewport').getAttribute('style');
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(box.x + box.width * .7, box.y + box.height * .8);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5, { steps: 8 });
      await page.mouse.up({ button: 'middle' });
      await page.mouse.wheel(0, i % 2 ? 500 : -500);
    }
    await page.waitForTimeout(250);
    const cameraAfter = await page.locator('.react-flow__viewport').getAttribute('style');
    expect(cameraAfter, 'pan/zoom gestures must actually move the viewport').not.toBe(cameraBefore);
    await fit(); return { visits, cameraBefore, cameraAfter, screenshot: await screenshot('08-after-navigation-marathon') };
  });

  await phase('author-new-card-and-add-real-cover', async () => {
    await toHome(); await blur();
    await page.keyboard.press('Control+n');
    const title = page.locator('input[value="New Note"]:visible').last();
    await expect(title).toBeVisible({ timeout: 20000 });
    const created = title.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," react-flow__node ")]');
    const id = await created.getAttribute('data-id');
    const card = node(id);
    await title.fill('Committee follow-up — authored during the headed test');
    await card.locator('input[type="text"]').first().press('Enter');
    await select(id); await expect(card.locator(editor)).toBeVisible({ timeout: 20000 });
    await card.locator(`${editor} [contenteditable="true"]`).first().click();
    for (const line of ['# Committee follow-up', 'The evidence dossier needs a separate cash-conversion review before the next committee meeting.', '## Next research actions', '- Verify inventory and customer payment assumptions', '- Connect power availability to deployment schedules']) {
      await page.keyboard.type(line, { delay: 8 }); await page.keyboard.press('Enter'); await page.waitForTimeout(110);
    }
    await settleSave();
    const image = report.manifest.images[0];
    if (image) {
      await card.getByRole('button', { name: 'Add cover', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Card cover' }); await expect(dialog).toBeVisible();
      await dialog.getByRole('tab', { name: 'Link' }).or(dialog.getByRole('radio', { name: 'Link' })).click();
      await dialog.getByLabel('Image address').fill(image.originalUrl);
      await dialog.getByRole('button', { name: 'Use it' }).click();
      await expect(dialog).toBeHidden();
      await expect(card.locator('img').first()).toBeVisible();
    }
    await settleSave();
    const saved = (await state()).nodes.find(n => n.id === id);
    expect(JSON.stringify(saved.data.content)).toContain('cash-conversion review');
    return { id, blocks: saved.data.content.length, cover: saved.data.coverImage, screenshot: await screenshot('09-authored-research-card') };
  });

  await phase('save-reload-restore-heavy-workspace', async () => {
    await toHome(); await blur(); await settleSave();
    const before = await state();
    const canonical = nodes => JSON.parse(JSON.stringify(Object.fromEntries(nodes.map(n => [n.id, { parentId: n.parentId ?? null, data: { ...n.data, content: n.data.content === '' ? [] : n.data.content } }]))));
    await writeFile(path.join(out, 'before-final-reload.json'), JSON.stringify(before));
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await expect(pane).toBeVisible({ timeout: 30000 });
    await expect.poll(async () => (await state())?.nodes.length, { timeout: 45000 }).toBe(before.nodes.length);
    const after = await state();
    await writeFile(path.join(out, 'after-final-reload.json'), JSON.stringify(after));
    assert.deepStrictEqual(canonical(after.nodes), canonical(before.nodes), 'saved block data or nested ownership changed across reload');
    assert.deepStrictEqual(after.edges, before.edges, 'saved graph edges changed across reload');
    await writeFile(path.join(out, 'final-workspace.json'), JSON.stringify({ version: 1, nodes: after.nodes, edges: after.edges }));
    await focusCard('study-room');
    return { nodes: after.nodes.length, edges: after.edges.length, contentIdentical: true, screenshot: await screenshot('09-restored-research-room') };
  });
} catch (error) { report.fatal = error.stack; console.error(error); }
finally {
  report.finished = new Date().toISOString();
  report.failedPhases = report.phases.filter(p => p.status === 'failed' && p.name !== 'google-image-research').map(p => p.name);
  await save();
  await context.close().catch(() => {});
  await writeFile(path.join(repo, 'output', 'audits', 'headed-investment-study', 'latest-run.txt'), out);
  console.log(`RESULTS ${out}`);
  process.exitCode = report.fatal || report.failedPhases.length ? 1 : 0;
}
