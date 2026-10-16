import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const output = 'design/marketing-block-journey/build-review';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const stages = ['begin', 'collect', 'connect', 'compose', 'card', 'inside', 'perspective', 'layers', 'angle', 'action', 'creators', 'students', 'designers', 'builders', 'para', 'zettelkasten', 'cornell', 'mindmap', 'start'];
const findings = [];
try {
  for (const [name, viewport, reducedMotion] of [
    ['desktop', { width: 1440, height: 1000 }, 'no-preference'],
    ['mobile', { width: 390, height: 844 }, 'no-preference'],
    ['reduced', { width: 390, height: 844 }, 'reduce'],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5193/journey');
    await page.getByTestId('journey-traveler').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-journey-section]').count(), 19, 'All chapters must exist in normal document flow');
    await page.evaluate(() => { window.__journeyOriginal = document.querySelector('[data-testid="journey-traveler"]'); });
    const scroll = page.getByTestId('journey-scroll');
    for (let i = 0; i < stages.length; i++) {
      await scroll.evaluate((element, index) => {
        const section = element.querySelectorAll('[data-journey-section]')[index];
        element.scrollTop += section.getBoundingClientRect().top - element.getBoundingClientRect().top;
      }, i);
      await page.waitForFunction(expected => document.querySelector('[data-testid="journey-stage"]')?.getAttribute('data-chapter') === expected, stages[i]);
      await page.waitForTimeout(220);
      const dimensions = await page.evaluate(() => {
        const block = document.querySelector('[data-testid="journey-traveler"]');
        const scroll = document.querySelector('[data-testid="journey-scroll"]');
        const rect = block.getBoundingClientRect();
        return { same: block === window.__journeyOriginal, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, overflow: scroll.scrollWidth > scroll.clientWidth + 1 };
      });
      assert(dimensions.same, `${name}/${stages[i]} replaced the original block`);
      assert(!dimensions.overflow, `${name}/${stages[i]} has horizontal overflow`);
      assert(dimensions.left >= -1 && dimensions.right <= dimensions.width + 1, `${name}/${stages[i]} block outside horizontal viewport: ${JSON.stringify(dimensions)}`);
      assert(dimensions.top >= 72 && dimensions.bottom < dimensions.height - 30, `${name}/${stages[i]} block outside visible stage: ${JSON.stringify(dimensions)}`);
      if (name !== 'reduced' && [0, 1, 3, 4, 6, 8, 9, 12, 14, 16, 17, 18].includes(i)) await page.screenshot({ path: `${output}/${name}-${stages[i]}.png` });
    }
    assert.equal(await page.locator('#journey-start').getAttribute('href'), '/signup');
    assert.equal(await page.getByRole('link', { name: 'Try the canvas', exact: false }).getAttribute('href'), '/canvas');
    await scroll.evaluate(element => { element.scrollTop = 0; });
    await page.waitForFunction(() => document.querySelector('[data-testid="journey-stage"]')?.getAttribute('data-chapter') === 'begin');
    assert(await page.evaluate(() => document.querySelector('[data-testid="journey-traveler"]') === window.__journeyOriginal));
    const headingBefore = await page.locator('h1').boundingBox();
    await scroll.evaluate(element => { element.scrollTop = 160; });
    await page.waitForTimeout(100);
    const headingAfter = await page.locator('h1').boundingBox();
    assert(Math.abs(headingBefore.y - headingAfter.y - 160) < 2, 'Heading must scroll naturally, not remain pinned');
    assert.deepEqual(errors, [], `${name} runtime errors`);
    findings.push({ device: name, stages: stages.length, originalBlockPreserved: true, horizontalOverflow: false, reverseScroll: true, runtimeErrors: errors });
    await context.close();
  }
  await fs.writeFile(`${output}/checks.json`, JSON.stringify(findings, null, 2));
  console.log(JSON.stringify(findings, null, 2));
} finally { await browser.close(); }
