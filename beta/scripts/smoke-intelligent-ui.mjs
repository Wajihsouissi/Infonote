import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Opt in explicitly: this check makes ONE real, billable generation request.
const replay = process.env.REPLAY_INTELLIGENT_UI === '1';
if (!replay && process.env.RUN_LIVE_AI !== '1') throw new Error('Set RUN_LIVE_AI=1 to run the provider-backed smoke check.');
const baseURL = process.env.INTELLIGENT_UI_BASE_URL || 'http://127.0.0.1:5177';
const output = resolve('qa/intelligent-ui-live');
await mkdir(output, { recursive: true });
const existing = replay ? JSON.parse(await readFile(resolve(output, 'artifact.json'), 'utf8')) : undefined;
const browser = await chromium.launch({ headless: false });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.addInitScript(() => {
        if (window.top === window) localStorage.setItem('chnk-it-welcomed', '1');
    });
    const requests = [];
    page.on('request', request => {
        if (request.url().includes('/api/ai/')) requests.push({ url: new URL(request.url()).pathname, authenticated: Boolean(request.headers().authorization) });
    });
    await page.goto(`${baseURL}/canvas`);
    await page.waitForFunction(() => Boolean(window.__appStore));
    await page.evaluate(async saved => {
        const state = window.__appStore.getState();
        state.loadGraph([], []);
        state.setAIModel('gemini-3.5-flash-lite');
        let content = [{ id: 'live-ui-block', type: 'intelligent-ui', content: '' }];
        if (saved) {
            const { parseGeneratedUI } = await import('/src/features/intelligent-ui/generate.ts');
            const { materializeUIBlocks } = await import('/src/features/intelligent-ui/nativeBlocks.ts');
            content = materializeUIBlocks({ ...parseGeneratedUI(JSON.stringify(saved), saved.prompt, saved.model), state: saved.state });
        }
        state.addNode(saved ? 'fused-note' : 'block', { x: 80, y: 80 }, { content, isStandaloneBlock: !saved }, { width: 640 }, undefined, 'live-ui-node');
    }, existing);
    await page.locator('.react-flow__node[data-id="live-ui-node"]').click();
    if (!replay) {
        await page.getByLabel('What would you like to explore?').fill('Build a compact bill splitter with a short native heading before it and one short editable explanation after it. Exactly two number inputs, labelled Total and People, stable ids total and people, defaults 120 and 3. Show total divided by people to two decimals in an output with id result. No tip or other fields. Illustrative euros. Minimal visual matching the host theme. Use concise vanilla JavaScript.');
        await page.getByRole('button', { name: 'Generate interface', exact: true }).click();
    }
    const iframe = page.locator('[data-intelligent-ui-block] iframe');
    await iframe.waitFor({ state: 'visible', timeout: 70_000 });
    const content = iframe.contentFrame();
    if (await content.locator('h1,h2,h3,h4,h5,h6,p').count()) throw new Error('Ordinary prose must be native blocks outside the sandbox.');
    await content.locator('#people').fill('6');
    await content.locator('#result').filter({ hasText: /20[.,]00/ }).waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => window.__appStore.getState().nodes.find(n => n.id === 'live-ui-node')?.data.content.find(b => b.type === 'intelligent-ui')?.metadata?.intelligentUI?.artifact?.state?.people === '6', undefined, { timeout: 10_000 });
    const saved = await page.evaluate(() => {
        const node = window.__appStore.getState().nodes.find(n => n.id === 'live-ui-node');
        const visual = node.data.content.find(b => b.type === 'intelligent-ui');
        if (!node.data.content.some(b => b.type.startsWith('heading'))) throw new Error('Missing native heading');
        return visual.metadata.intelligentUI.artifact;
    });
    await page.waitForFunction(() => !window.__appStore.getState().storage.isLocalDirty);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__appStore));
    await page.locator('.react-flow__node[data-id="live-ui-node"]').click();
    await page.locator('[data-intelligent-ui-block] iframe').contentFrame().locator('#result').filter({ hasText: /20[.,]00/ }).waitFor({ timeout: 10_000 });
    await page.locator('[data-intelligent-ui-block]').screenshot({ path: resolve(output, 'generated-interface.png') });
    await page.locator('.react-flow__node[data-id="live-ui-node"]').screenshot({ path: resolve(output, 'native-document.png') });
    await page.evaluate(() => window.__appStore.getState().updateNode('live-ui-node', { style: { width: 320 } }));
    await page.waitForFunction(() => document.querySelector('[data-intelligent-ui-block]')?.getBoundingClientRect().width < 320);
    await page.locator('.react-flow__node[data-id="live-ui-node"]').screenshot({ path: resolve(output, 'native-document-narrow.png') });
    await writeFile(resolve(output, 'artifact.json'), JSON.stringify(saved, null, 2));
    console.log(JSON.stringify({ ok: true, title: saved.title, model: saved.model, controlsPersisted: saved.state?.people === '6', requests, screenshot: resolve(output, 'generated-interface.png') }));
} finally {
    await browser.close();
}
