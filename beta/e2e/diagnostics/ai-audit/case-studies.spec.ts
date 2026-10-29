import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { stubAI, BODY } from '../../support/aiStub';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AppState } from '../../../src/store/types';

type DiagnosticWindow = Window & { __appStore: { getState: () => AppState } };

// Synthetic fixtures only. No account state or personal workspace is reused.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chnk-it-welcomed', '1'));
  await page.goto('/canvas');
  await expect(page.locator('.react-flow__pane')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => Boolean((window as unknown as DiagnosticWindow).__appStore));
});

async function open(page: Page, mode = 'ask') {
  await page.keyboard.press('Control+j');
  await expect(page.getByLabel('Ask AI', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: mode === 'ask' ? 'Ask' : 'Create', exact: true }).click();
}
async function send(page: Page, text: string) {
  await page.getByLabel('Ask AI', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => page.evaluate(() => [...(window as unknown as DiagnosticWindow).__appStore.getState().aiMessages].reverse().find(m => m.role === 'user')?.text)).toBe(text);
}
async function turn(page: Page) {
  return page.evaluate(() => [...(window as unknown as DiagnosticWindow).__appStore.getState().aiMessages].reverse().find(m => m.role === 'assistant')!);
}
async function settled(page: Page) {
  await expect.poll(async () => (await turn(page))?.status, { timeout: 125_000 }).toMatch(/done|error/);
  return turn(page);
}
async function capture(page: Page, info: TestInfo, data?: unknown) {
  const evidence = info.outputPath('evidence');
  await mkdir(evidence, { recursive: true });
  const name = info.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const shot = resolve(evidence, `${name}.png`);
  await page.screenshot({ path: shot });
  await info.attach('case-screenshot', { path: shot, contentType: 'image/png' });
  await writeFile(resolve(evidence, `${name}.json`), JSON.stringify(data ?? await turn(page), null, 2));
}
async function seedMeeting(page: Page) {
  await page.evaluate(() => {
    const s = (window as unknown as DiagnosticWindow).__appStore.getState();
    const id = s.addNode('note', { x: 100, y: 100 }, {
      label: 'Project Orion handover',
      content: [{ id: 'orion-p1', type: 'text', content: 'ORION-FACT-927: launch is 12 November. Mira owns onboarding. Leon must fix CSV export by 6 November. Budget is EUR 840.' }],
    }, { width: 420, height: 320 });
    // Preserve the existing probe's void-return selection input; correcting this
    // fixture is separate from moving/typing it (addNode does not return an ID).
    s.setSelectedCanvasNodeIds(new Set([id as unknown as string]));
  });
}

test('L1 live: meeting attachment, grounded answer, follow-up and saved history', async ({ page }, info) => {
  await open(page);
  await page.locator('input[type=file]').last().setInputFiles({
    name: 'orion-handover.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Fictional Project Orion handover: Launch 12 November. Mira owns onboarding. Leon fixes CSV export by 6 November. Budget EUR 840. Paid EUR 275. No other facts are available.'),
  });
  await send(page, 'Use only the attached handover. Give the launch date, each owner and task, the CSV deadline, and remaining budget. Keep it under 90 words.');
  const first = await settled(page);
  await capture(page, info, { first });
  expect(first.status, first.error).toBe('done');
  expect(first.text).toContain('565');
  expect(first.text).toMatch(/Mira/);
  expect(first.text).toMatch(/Leon/);
  expect(first.createdNodeIds).toHaveLength(0);
  await send(page, 'Who owns onboarding? Reply with only the name from the handover.');
  const followup = await settled(page);
  expect(followup.status, followup.error).toBe('done');
  expect(followup.text).toMatch(/Mira/);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.getByRole('button', { name: 'Chat history', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Use only the attached handover/ })).toBeVisible();
  await capture(page, info, { first, followup });
});

test('L2 live: create two study cards and retain content after reload', async ({ page }, info) => {
  await open(page, 'create');
  await send(page, 'Create exactly two note cards for a beginner German study session: one titled German word order and one titled German past tense. Each needs three practical examples and a short practice question. Use plain written cards, no interactive UI.');
  const result = await settled(page);
  await capture(page, info, result);
  expect(result.status, result.error).toBe('done');
  expect(result.createdNodeIds).toHaveLength(2);
  const before = await page.evaluate(() => (window as unknown as DiagnosticWindow).__appStore.getState().nodes.map((n) => ({ id: n.id, data: n.data })));
  expect(before.every((n) => JSON.stringify(n.data.content).length > 100)).toBeTruthy();
  await page.waitForTimeout(1800);
  await page.reload();
  await expect(page.locator('.react-flow__pane')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as DiagnosticWindow).__appStore.getState().nodes.length)).toBe(2);
  const after = await page.evaluate(() => (window as unknown as DiagnosticWindow).__appStore.getState().nodes.map((n) => ({ id: n.id, data: n.data })));
  expect(after).toEqual(before);
});

test('L3 live: interactive shared-trip calculator in Ask', async ({ page }, info) => {
  await open(page);
  await send(page, 'Build an interactive trip cost splitter for 4 friends. Defaults: accommodation 480 euros, transport 120 euros, food 200 euros. Let me change all costs and number of people, and show the total and cost per person. Use local calculations, no external data.');
  const result = await settled(page);
  await capture(page, info, result);
  expect(result.status, result.error).toBe('done');
  expect(result.intelligentUI).toBeTruthy();
  const frame = page.locator('iframe').last();
  await expect(frame).toBeVisible();
  const ui = frame.contentFrame();
  await expect(ui.locator('body')).toContainText(/200/);
  const numbers = ui.locator('input[type=number]');
  expect(await numbers.count()).toBeGreaterThanOrEqual(4);
  // Identify the people control by its actual generated value; assert recomputation.
  const people = ui.locator('input[type=number]').filter({ visible: true });
  for (let i = 0; i < await people.count(); i++) {
    if (await people.nth(i).inputValue() === '4') {
      await people.nth(i).fill('8');
      await expect(ui.locator('body')).toContainText(/100/);
      break;
    }
  }
  await capture(page, info, result);
});

test('D1 selected meeting card: Included in this AI request must match payload', async ({ page }, info) => {
  await seedMeeting(page);
  const bodies: unknown[] = [];
  page.on('request', r => { if (r.url().includes('/api/ai/')) bodies.push(r.postDataJSON()); });
  const stub = await stubAI(page, { text: ['{"route":"answer"}'], stream: ['I cannot see the handover.'] });
  await open(page);
  await expect(page.getByText('Included in this AI request', { exact: true })).toBeVisible();
  await send(page, 'Summarize the selected handover and name the CSV owner.');
  await settled(page);
  await capture(page, info, { bodies, prompts: stub.prompts, result: await turn(page) });
  expect(JSON.stringify(bodies), 'selected source content promised by the UI must reach the model').toContain('ORION-FACT-927');
});

test('D2 first-run Summarise canvas starter must attach the canvas', async ({ page }, info) => {
  await seedMeeting(page);
  const bodies: unknown[] = [];
  page.on('request', r => { if (r.url().includes('/api/ai/')) bodies.push(r.postDataJSON()); });
  await page.evaluate(() => (window as unknown as DiagnosticWindow).__appStore.getState().setSelectedCanvasNodeIds(new Set()));
  const stub = await stubAI(page, { text: ['{"route":"answer"}'], stream: ['No attached canvas.'] });
  await open(page);
  await page.getByRole('button', { name: /^Summarise canvas/ }).click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await settled(page);
  await capture(page, info, { bodies, prompts: stub.prompts });
  expect(JSON.stringify(bodies)).toContain('ORION-FACT-927');
});

test('D3 attachment-only send must submit or explain the missing prompt', async ({ page }, info) => {
  const stub = await stubAI(page);
  await open(page);
  await page.locator('input[type=file]').last().setInputFiles({ name: 'handover.txt', mimeType: 'text/plain', buffer: Buffer.from('Mira owns onboarding.') });
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForTimeout(1500);
  await capture(page, info, { prompts: stub.prompts });
  expect(stub.prompts.length, 'an enabled Send must not silently do nothing').toBeGreaterThan(0);
});

test('D4 new chat must not reuse or overwrite the old chat ID', async ({ page }, info) => {
  await stubAI(page, { text: ['{"route":"answer"}'], stream: ['The older answer.'] });
  await open(page);
  await send(page, 'Summarize our fictional Orion launch.');
  await settled(page);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.waitForTimeout(500);
  const fresh = await page.evaluate(() => { const s = (window as unknown as DiagnosticWindow).__appStore.getState(); return { id: s.aiChatId, messages: s.aiMessages, chats: s.aiChats }; });
  await capture(page, info, fresh);
  expect(fresh.messages).toHaveLength(0);
  expect(fresh.id, 'a new chat must not inherit the archived ID through an async save').toBeNull();
});

test('D5 Stop during card planning must prevent later placement', async ({ page }, info) => {
  await stubAI(page, { text: ['{"route":"create"}'], stream: [BODY] });
  let planning = false;
  await page.route('**/api/ai/text', async route => {
    if (route.request().headers()['x-ai-phase'] === 'plan') {
      planning = true;
      await new Promise(r => setTimeout(r, 2500));
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ text: '[{"type":"note","title":"Cancelled plan","brief":"Never place this"}]' }) }).catch(() => {});
    } else await route.fallback();
  });
  await open(page, 'create');
  await send(page, 'Create a written note about Orion.');
  await expect.poll(() => planning).toBeTruthy();
  await page.getByRole('button', { name: /^Stop —/ }).click();
  await page.waitForTimeout(3500);
  const state = await page.evaluate(() => { const s = (window as unknown as DiagnosticWindow).__appStore.getState(); return { nodes: s.nodes, running: s.aiIsRunning, messages: s.aiMessages }; });
  await capture(page, info, state);
  expect(state.running).toBe(false);
  expect(state.nodes).toHaveLength(0);
});

test('D6 quota failure displays a recoverable error and preserves the canvas', async ({ page }, info) => {
  await stubAI(page, { text: ['{"route":"answer"}'] });
  await page.route('**/api/ai/stream', route => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Rate limit exceeded. Try again in 30 seconds.' }) }));
  await open(page);
  await send(page, 'Give me a quick Orion launch checklist.');
  const result = await settled(page);
  await capture(page, info, result);
  expect(result.status).toBe('error');
  await expect(page.getByText('Rate limit exceeded. Try again in 30 seconds.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Ask AI', { exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as DiagnosticWindow).__appStore.getState().nodes.length)).toBe(0);
});

test('D7 390px viewport: composer and Send stay inside the screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByLabel('Ask AI', { exact: true }).fill('Summarize my meeting notes.');
  const input = await page.getByLabel('Ask AI', { exact: true }).boundingBox();
  const sendBox = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
  const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  await capture(page, info, { input, send: sendBox, metrics });
  expect(input!.x).toBeGreaterThanOrEqual(0);
  expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(390);
});

test('D8 closed panel must leave keyboard and screen-reader navigation', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: 'Close AI panel', exact: true }).click();
  await page.waitForTimeout(350);
  const ax = await page.locator('body').ariaSnapshot();
  await capture(page, info, { ax });
  expect(ax, 'closed AI controls should not remain exposed to assistive technology').not.toContain('textbox "Ask AI"');
});

test('D9 resizing the panel must work using a keyboard', async ({ page }, info) => {
  await open(page);
  const handle = page.getByRole('separator', { name: 'Resize AI panel', exact: true });
  await capture(page, info, { tabindex: await handle.getAttribute('tabindex'), value: await handle.getAttribute('aria-valuenow') });
  expect(await handle.getAttribute('tabindex')).toBe('0');
  await handle.focus();
  const before = await handle.boundingBox();
  await page.keyboard.press('ArrowLeft');
  expect((await handle.boundingBox())!.x).toBeLessThan(before!.x);
});

test('D10 Stop during rewriting must preserve the original meeting card', async ({ page }, info) => {
  await seedMeeting(page);
  await stubAI(page, { text: ['{"route":"edit"}'] });
  let rewriting = false;
  await page.route('**/api/ai/text', async route => {
    if ((route.request().postDataJSON().prompt as string).includes('You are editing an existing card')) {
      rewriting = true;
      await new Promise(r => setTimeout(r, 2500));
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ text: JSON.stringify({ title: 'Unexpected rewrite after Stop', content: 'Original source replaced after cancellation.' }) }) }).catch(() => {});
    } else await route.fallback();
  });
  await open(page, 'create');
  await send(page, 'Rewrite this handover more concisely.');
  await expect.poll(() => rewriting).toBeTruthy();
  await page.getByRole('button', { name: /^Stop —/ }).click();
  await page.waitForTimeout(3500);
  const nodes = await page.evaluate(() => (window as unknown as DiagnosticWindow).__appStore.getState().nodes);
  await capture(page, info, nodes);
  expect(nodes[0].data.label).toBe('Project Orion handover');
  expect(JSON.stringify(nodes[0].data.content)).toContain('ORION-FACT-927');
});
