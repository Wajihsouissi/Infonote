import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const allowed = path.join(repo, 'output', 'audits', 'headed-investment-study');
const run = process.argv[2] ? path.resolve(process.argv[2]) : (await readFile(path.join(allowed, 'latest-run.txt'), 'utf8')).trim();
if (path.relative(allowed, run).startsWith('..') || path.isAbsolute(path.relative(allowed, run))) throw Error('Choose a headed-study run inside this repository output directory.');
const result = JSON.parse(await readFile(path.join(run, 'results.json'), 'utf8'));
const context = await chromium.launchPersistentContext(path.join(run, 'browser-profile'), { headless: false, viewport: { width: 1600, height: 1000 } });
const origin = new URL(result.baseURL).origin;
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return url.origin === origin || !['http:', 'https:'].includes(url.protocol) ? route.continue() : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
for (const image of result.manifest.images) await context.route(image.originalUrl, async route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: await readFile(path.join(run, image.localFile)) }));
const page = context.pages()[0] || await context.newPage();
await page.goto(`${origin}/canvas`, { waitUntil: 'domcontentloaded' });
await expect(page.locator('.react-flow__pane')).toBeVisible({ timeout: 30000 });
await page.waitForFunction(() => window.__appStore?.getState().nodes.length > 0, null, { timeout: 30000 });
await page.waitForTimeout(1200);
const readState = () => page.evaluate(() => { const s = window.__appStore.getState(); return { nodes: s.nodes, edges: s.edges, dirty: s.storage.isLocalDirty }; });
const followup = { headed: true, resumedRun: run, phases: [] };
if (process.argv.includes('--author-and-reload')) {
  try {
    await page.locator('.react-flow__pane').click({ position: { x: 35, y: 65 }, force: true });
    await page.keyboard.press('Control+n');
    const title = page.locator('input[value="New Note"]:visible').last();
    await expect(title).toBeVisible({ timeout: 20000 });
    const id = await title.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," react-flow__node ")]').getAttribute('data-id');
    const card = page.locator(`.react-flow__node[data-id="${id}"]`);
    await title.fill('Committee follow-up — authored during the headed test');
    await card.locator('input[type="text"]').first().press('Enter');
    const shield = card.locator('.interaction-overlay');
    if (await shield.count()) await shield.click({ force: true });
    else await card.locator('.custom-drag-handle').first().click({ force: true });
    const live = card.locator('[data-chnk-it-block-editor]');
    await expect(live).toBeVisible({ timeout: 20000 });
    await live.locator('[contenteditable="true"]').first().click();
    for (const line of ['# Committee follow-up', 'The evidence dossier needs a separate cash-conversion review before the next committee meeting.', '## Next research actions', '- Verify inventory and customer payment assumptions', 'Connect power availability to deployment schedules']) {
      await page.keyboard.type(line, { delay: 8 }); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    }
    await card.getByRole('button', { name: 'Add cover', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Card cover' }); await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Link' }).or(dialog.getByRole('radio', { name: 'Link' })).click();
    await dialog.getByLabel('Image address').fill(result.manifest.images[0].originalUrl);
    await dialog.getByRole('button', { name: 'Use it' }).click(); await expect(dialog).toBeHidden();
    await expect(card.locator('img').first()).toBeVisible();
    await page.locator('.react-flow__pane').click({ position: { x: 35, y: 65 }, force: true });
    await page.waitForTimeout(500); await expect.poll(async () => (await readState()).dirty, { timeout: 30000 }).toBe(false);
    const before = await readState();
    const authored = before.nodes.find(n => n.id === id);
    expect(JSON.stringify(authored.data.content)).toContain('cash-conversion review');
    expect(authored.data.coverImage).toBe(result.manifest.images[0].originalUrl);
    await page.screenshot({ path: path.join(run, '11-authored-card-with-source-photo.png') });
    followup.phases.push({ name: 'UI card creation, structured typing and cover', status: 'passed', id, blocks: authored.data.content.length, cover: authored.data.coverImage });
    const canonical = nodes => Object.fromEntries(nodes.map(n => [n.id, { parentId: n.parentId ?? null, data: { ...n.data, content: n.data.content === '' ? [] : n.data.content } }]));
    await writeFile(path.join(run, 'before-final-reload.json'), JSON.stringify(before));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.react-flow__pane')).toBeVisible({ timeout: 30000 });
    await expect.poll(async () => (await readState())?.nodes.length, { timeout: 30000 }).toBe(before.nodes.length);
    const after = await readState();
    await writeFile(path.join(run, 'after-final-reload.json'), JSON.stringify(after));
    assert.deepStrictEqual(canonical(after.nodes), canonical(before.nodes));
    assert.deepStrictEqual(after.edges, before.edges);
    followup.phases.push({ name: 'Semantic content and edges survive reload', status: 'passed', nodes: after.nodes.length, edges: after.edges.length });
  } catch (error) {
    process.exitCode = 1;
    followup.phases.push({ name: 'UI author/reload follow-up', status: 'failed', error: error.stack });
    await page.screenshot({ path: path.join(run, 'FAIL-author-followup.png') });
  }
  await writeFile(path.join(run, 'author-reload-followup.json'), JSON.stringify(followup, null, 2));
}
if (process.argv.includes('--complete-cover')) {
  const proof = { headed: true, workaround: 'Focus/zoom the authored card with the real F shortcut before clicking Add cover', phases: [] };
  try {
    const existing = (await readState()).nodes.find(n => n.data?.label === 'Committee follow-up — authored during the headed test' && Array.isArray(n.data?.content) && n.data.content.length > 1);
    assert.ok(existing, 'The authored card must already exist');
    const card = page.locator(`.react-flow__node[data-id="${existing.id}"]`);
    await expect(card).toBeAttached({ timeout: 15000 });
    const shield = card.locator('.interaction-overlay');
    if (await shield.count()) await shield.click({ force: true });
    else await card.locator('.custom-drag-handle').first().click({ force: true });
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await card.hover(); await page.keyboard.press('f'); await page.waitForTimeout(1000);
    await card.getByRole('button', { name: 'Add cover', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Card cover' }); await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Link' }).or(dialog.getByRole('radio', { name: 'Link' })).click();
    await dialog.getByLabel('Image address').fill(result.manifest.images[0].originalUrl);
    await dialog.getByRole('button', { name: 'Use it' }).click(); await expect(dialog).toBeHidden();
    await expect.poll(() => card.locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.locator('.react-flow__pane').click({ position: { x: 35, y: 65 }, force: true });
    await page.waitForTimeout(500); await expect.poll(async () => (await readState()).dirty, { timeout: 30000 }).toBe(false);
    const before = await readState();
    await writeFile(path.join(run, 'before-final-reload.json'), JSON.stringify(before));
    await page.screenshot({ path: path.join(run, '11-authored-card-with-source-photo.png') });
    proof.phases.push({ name: 'Source photo attaches and decodes after zooming', status: 'passed', id: existing.id });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.react-flow__pane')).toBeVisible({ timeout: 30000 });
    await expect.poll(async () => (await readState())?.nodes.length, { timeout: 30000 }).toBe(before.nodes.length);
    const after = await readState();
    await writeFile(path.join(run, 'after-final-reload.json'), JSON.stringify(after));
    const canonical = nodes => JSON.parse(JSON.stringify(Object.fromEntries(nodes.map(n => [n.id, { parentId: n.parentId ?? null, data: { ...n.data, content: n.data.content === '' ? [] : n.data.content } }]))));
    assert.deepStrictEqual(canonical(after.nodes), canonical(before.nodes));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(after.edges)), JSON.parse(JSON.stringify(before.edges)));
    proof.phases.push({ name: 'All content, nested ownership and edges survive reload', status: 'passed', nodes: after.nodes.length, edges: after.edges.length });
  } catch (error) {
    process.exitCode = 1;
    proof.phases.push({ name: 'Cover workaround and reload', status: 'failed', error: error.stack });
    await page.screenshot({ path: path.join(run, 'FAIL-cover-workaround.png') });
  }
  await writeFile(path.join(run, 'cover-workaround-followup.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
}
const snapshot = await page.evaluate(() => { const s = window.__appStore.getState(); return { nodes: s.nodes, edges: s.edges, currentParentId: s.currentParentId }; });
await writeFile(path.join(run, 'final-workspace.json'), JSON.stringify({ version: 1, nodes: snapshot.nodes, edges: snapshot.edges }));
const parent = snapshot.nodes.find(n => n.id === 'study-deep');
const generated = snapshot.nodes.filter(n => n.parentId === 'study-deep');
const represented = new Set(generated.flatMap(n => n.data?.content?.map(b => b.id) || []));
const meaningful = block => block.type === 'table' ? block.metadata?.rows?.some(row => row.some(cell => cell.trim())) : block.type !== 'divider' && block.content.trim();
const missing = parent.data.content.filter(block => meaningful(block) && !represented.has(block.id));
const authored = snapshot.nodes.find(n => n.data?.label === 'Committee follow-up — authored during the headed test');
const check = {
  restoredCards: snapshot.nodes.length, restoredEdges: snapshot.edges.length,
  deepDossierBlocks: parent.data.content.length, generatedCards: generated.length,
  sourceTables: parent.data.content.filter(b => b.type === 'table').length,
  missingMeaningfulBlocksIncludingTables: missing.map(b => b.id),
  authoredCard: authored && { id: authored.id, content: authored.data.content, cover: authored.data.coverImage },
};
if (missing.length) process.exitCode = 1;
await writeFile(path.join(run, 'restoration-check.json'), JSON.stringify(check, null, 2));
await page.screenshot({ path: path.join(run, '10-reopened-saved-workspace.png') });
console.log(JSON.stringify({ ...check, authoredCard: check.authoredCard && { id: check.authoredCard.id, blocks: check.authoredCard.content.length } }, null, 2));
if (process.argv.includes('--keep-open')) {
  console.log('HEADED STUDY READY. Close the browser window to stop this viewer.');
  await new Promise(resolve => context.on('close', resolve));
} else await context.close();
