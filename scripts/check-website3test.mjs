import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.RESEARCH_TEST_URL || 'http://127.0.0.1:5196';
const out = 'design/research-cut/review';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [name, viewport, reducedMotion] of [
    ['desktop', { width: 1440, height: 1000 }, 'no-preference'],
    ['mobile', { width: 390, height: 844 }, 'no-preference'],
    ['reduced', { width: 360, height: 800 }, 'reduce'],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) external.push(request.url()); });
    await page.goto(`${base}/website3test/`);
    await page.locator('h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('h1').count(), 1);
    assert(await page.locator('img').evaluate(image => image.complete && image.naturalWidth > 0), 'Hero photo loaded');
    if (name === 'reduced') assert.equal(await page.locator('[data-research-page]').getAttribute('data-motion'), 'reduced');
    const sections = ['collection', 'cut', 'connect', 'depth', 'assist', 'plan', 'explore', 'storage', 'faq'];
    for (const section of sections) {
      await page.locator(`#${section}`).evaluate(el => window.scrollTo({ top: el.offsetTop - 95, behavior: 'instant' }));
      await page.waitForTimeout(750);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `${name}/${section} horizontal overflow: ${overflow}`);
      if (name !== 'reduced') await page.screenshot({ path: `${out}/${name}-${section}.png` });
    }
    await page.getByRole('button', { name: 'Open this idea' }).click();
    await page.getByRole('heading', { name: 'Workspace experiment', exact: true }).waitFor();
    assert(await page.getByText('Next experiment: clear one part of the desk.').isVisible());
    await page.getByRole('button', { name: 'Back to the bigger picture' }).click();
    assert(await page.getByRole('button', { name: 'Open this idea' }).isVisible());
    await page.getByRole('button', { name: 'Start task', exact: false }).click();
    assert(await page.getByRole('status').filter({ hasText: 'moved to In progress' }).isVisible());
    await page.getByRole('button', { name: 'Move back' }).click();
    const options = page.locator('#explore button[aria-pressed]');
    const connect = page.getByRole('button', { name: 'Connect ideas', exact: true });
    assert(await connect.isDisabled());
    // Exercise the keyboard path, not just mouse events.
    await options.nth(0).focus(); await page.keyboard.press('Space');
    await options.nth(1).focus(); await page.keyboard.press('Enter');
    assert(await connect.isEnabled());
    await connect.click();
    assert.equal(await page.getByTestId('demo-connections').locator('path').count(), 1);
    assert(await page.getByText('1 connection', { exact: true }).isVisible());
    if (name !== 'desktop') {
      const pairs = page.getByRole('list', { name: 'Your connections' });
      assert(await pairs.isVisible(), 'Mobile connection identifies both ideas');
      assert(await pairs.getByText('Keep tools within reach', { exact: true }).isVisible());
      assert(await pairs.getByText('Leave space for the current task', { exact: true }).isVisible());
    }
    await options.nth(0).click(); await options.nth(1).click();
    assert(await connect.isDisabled(), 'Existing pair cannot be duplicated');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert(await page.getByText('0 connections', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await page.locator('#explore button[aria-pressed="true"]').count(), 0);
    await page.getByText('Where is my work saved?', { exact: true }).click();
    assert(await page.getByText('Choose this device, or this device plus cloud sync.', { exact: false }).isVisible());
    const motion = page.getByRole('button', { name: /Motion:/ });
    await motion.click();
    assert.equal(await page.locator('[data-research-page]').getAttribute('data-motion'), name === 'reduced' ? 'full' : 'reduced');
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const violations = a11y.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) }));
    results.push({ name, viewport, runtimeErrors: errors, externalRequests: external, accessibility: violations, interactions: 'passed', horizontalOverflow: false });
    await fs.writeFile(`${out}/checks.json`, JSON.stringify(results, null, 2));
    assert.deepEqual(errors, [], `${name} runtime errors`);
    assert.deepEqual(external, [], `${name} should not call the app backend or external services`);
    assert.deepEqual(violations, [], `${name} accessibility violations`);
    await context.close();
  }
  if (process.env.RESEARCH_TEST_STATIC === '1') {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${base}/website3test/`);
    assert.equal(await page.locator('h1').count(), 1, 'The product introduction ships as HTML');
    for (const id of ['collection', 'cut', 'connect', 'depth', 'assist', 'plan', 'explore', 'storage']) {
      assert((await page.locator(`#${id}`).innerText()).length > 40, `${id} is readable without JavaScript`);
    }
    assert.equal(await page.locator('a[href="/canvas"]').count(), 4);
    results.push({ name: 'no-javascript', readableChapters: 8, canvasLinks: 4, prerender: 'passed' });
    await fs.writeFile(`${out}/checks.json`, JSON.stringify(results, null, 2));
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
