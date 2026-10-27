import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if (process.env.RUN_LIVE_AI !== '1') throw new Error('Set RUN_LIVE_AI=1: this makes one real, billable generation request.');
const output = resolve('qa/intelligent-ui-advanced');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.addInitScript(() => { if (window.top === window) localStorage.setItem('chnk-it-welcomed', '1'); });
    const requests = [];
    page.on('request', request => {
        if (request.url().includes('/api/ai/')) requests.push({ path: new URL(request.url()).pathname, authenticated: Boolean(request.headers().authorization) });
    });
    await page.goto(`${process.env.INTELLIGENT_UI_BASE_URL || 'http://127.0.0.1:5177'}/canvas`);
    await page.waitForFunction(() => Boolean(window.__appStore));
    await page.evaluate(() => {
        const state = window.__appStore.getState(); state.loadGraph([], []); state.setAIModel('gemini-3.5-flash-lite');
        state.addNode('block', { x: 80, y: 80 }, { content: [{ id: 'advanced-ui', type: 'intelligent-ui', content: '' }], isStandaloneBlock: true }, { width: 640 }, undefined, 'advanced-ui-node');
    });
    await page.locator('.react-flow__node[data-id="advanced-ui-node"] .interaction-overlay').click();
    const previewCapture = page.locator('[data-intelligent-ui-streaming]').waitFor({ state: 'visible', timeout: 70_000 })
        .then(async () => { await page.locator('[data-intelligent-ui-streaming]').screenshot({ path: resolve(output, 'streaming.png') }); return true; })
        .catch(() => false);
    await page.getByLabel('What would you like to explore?').fill('Explain rotation using a small interactive 3D cube rendered with the preinstalled Three.js library. A single range slider id angle, label Rotation, initial 0, from 0 to 180 degrees, changes the cube rotation around Y immediately. Show the selected angle in output id angle-value. Keep the scene height 220px and responsive using ResizeObserver. No auto rotation or extra controls. Minimal host theme, native heading before and one concise native explanation after. Include a text alternative for the canvas. Use concise JavaScript.');
    await page.getByRole('button', { name: 'Generate interface', exact: true }).click();
    const frame = page.locator('[data-intelligent-ui-block] iframe').contentFrame();
    await expect(frame.locator('#angle')).toBeVisible({ timeout: 90_000 });
    await frame.locator('#angle').fill('45');
    await expect(frame.locator('#angle-value')).toContainText('45');
    await expect(frame.locator('canvas')).toBeVisible();
    await expect(frame.locator('h1,h2,h3,p')).toHaveCount(0);
    await expect(page.locator('[data-intelligent-ui-block] [role="alert"]')).toHaveCount(0);
    const artifact = await page.evaluate(() => window.__appStore.getState().nodes.find(n => n.id === 'advanced-ui-node').data.content.find(b => b.type === 'intelligent-ui').metadata.intelligentUI.artifact);
    if (!artifact.libraries?.includes('three')) throw new Error('The generated answer did not declare Three.js');
    await page.locator('.react-flow__node[data-id="advanced-ui-node"]').screenshot({ path: resolve(output, 'desktop.png') });
    await page.evaluate(() => window.__appStore.getState().updateNode('advanced-ui-node', { style: { width: 360 } }));
    await expect.poll(() => frame.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('.react-flow__node[data-id="advanced-ui-node"]').screenshot({ path: resolve(output, 'narrow.png') });
    const previewSeen = await previewCapture;
    await writeFile(resolve(output, 'artifact.json'), JSON.stringify(artifact, null, 2));
    console.log(JSON.stringify({ ok: true, title: artifact.title, libraries: artifact.libraries, previewSeen, controlsWork: true, requests }));
} finally { await browser.close(); }
