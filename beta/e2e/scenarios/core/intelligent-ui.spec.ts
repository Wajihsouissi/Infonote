import type { Page } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { test, expect } from '../../support/fixtures';
import { addNote, clickEmptyCanvas, focusEditor, openCanvas, reload, selectNode } from '../../support/canvas';
import { readCanvasState, seedCanvasState } from '../../support/canvasState';
import { openAIPanel, stubAI } from '../../support/aiStub';

const CALCULATOR = {
    title: 'Bill splitter', summary: 'Illustrative bill. Change the total and group size to calculate each share.', initialHeight: 300,
    before: [{ type: 'heading2', content: 'Split a bill' }, { type: 'text', content: 'Adjust the total and group size.' }],
    after: [{ type: 'text', content: 'Each share is the total divided by the number of people.' }],
    css: 'label{display:block;margin:12px 0 4px}input{width:100%;padding:8px}output{display:block;margin-top:16px;font-size:24px;font-weight:600}h2{margin-top:0}',
    html: '<section style="border:1px solid red;padding:24px;border-radius:12px"><h2>Split a bill</h2><label for="total">Total (€)</label><input id="total" type="number" value="120" min="0"><label for="people">People</label><input id="people" type="number" value="3" min="1"><output id="result" aria-live="polite">€40.00 each</output></section>',
    jsFunctions: "function update(){const total=document.getElementById('total').value;const people=document.getElementById('people').value;document.getElementById('result').textContent=total!==''&&people!==''&&Number(total)>=0&&Number(people)>0?'€'+(Number(total)/Number(people)).toFixed(2)+' each':'Enter a valid total and group size.';}function setup(){document.querySelectorAll('input').forEach(el=>el.addEventListener('input',update));update();}",
    jsExpressions: ['setup();'],
};

const artifact = () => ({ ...CALCULATOR,
    html: CALCULATOR.html.replace('<h2>Split a bill</h2>', ''),
    before: CALCULATOR.before.map((block, index) => ({ ...block, id: `before-${index}` })),
    after: CALCULATOR.after.map((block, index) => ({ ...block, id: `after-${index}` })),
    version: 1, id: 'fixture-ui', prompt: 'A bill splitter', createdAt: '2026-10-16T12:00:00Z' });
const frame = (page: Page) => page.frameLocator('iframe[title="Bill splitter"]');
const block = (page: Page) => page.locator('[data-intelligent-ui-block]');

async function chunkedAI(page: Page, first: string) {
    let response: ServerResponse | undefined;
    const server = createServer((req, res) => {
        req.resume();
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-cache' });
        response = res;
        res.write(first);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Streaming fixture did not start');
    await page.route('**/api/ai/stream', route => route.continue({ url: `http://127.0.0.1:${address.port}/stream` }));
    return {
        started: () => Boolean(response),
        write: (chunk: string) => response?.write(chunk),
        finish: (chunk: string) => response?.end(`${chunk}\u001e{"finishReason":"stop"}`),
        close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
    };
}

test.use({ viewport: { width: 1440, height: 1100 } });

async function seedBlock(page: Page, saved = false, source: ReturnType<typeof artifact> & { libraries?: string[] } = artifact()) {
    await seedCanvasState(page, [{ id: 'interactive-node', type: 'block', position: { x: 80, y: 80 }, style: { width: 640 }, data: {
        content: [{ id: 'interactive-block', type: 'intelligent-ui', content: saved ? 'Bill splitter' : '', metadata: { intelligentUI: saved ? { artifact: source, nativeTextPlaced: true } : {} } }],
        isStandaloneBlock: true,
    } }]);
    const node = page.locator('.react-flow__node[data-id="interactive-node"]');
    // Seeded graph projection and measurement settle before a real user click.
    // force:true could hit the pane while the node moved into position.
    await expect(node.locator('.interaction-overlay')).toBeVisible();
    await node.locator('.interaction-overlay').click();
    await expect(node.locator('[data-intelligent-ui-preview]')).toHaveCount(0);
    await expect(block(page)).toBeVisible();
    if (saved) await expect(page.locator('iframe[data-ui-ready="true"]')).toBeVisible({ timeout: 30_000 });
}

async function send(page: Page, request: string) {
    await page.getByLabel('Ask AI', { exact: true }).fill(request);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => page.evaluate(() => {
        const store = (window as unknown as { __appStore: { getState: () => { aiMessages: Array<{ role: string; status?: string }> } } }).__appStore;
        return [...store.getState().aiMessages].reverse().find(m => m.role === 'assistant')?.status;
    }), { timeout: 25_000 }).toBe('done');
}

test.describe('core: Intelligent UI', () => {
    test('slash menu inserts an intelligent block and generates a functional interface', async ({ page }) => {
        await openCanvas(page);
        const stub = await stubAI(page, { stream: [JSON.stringify(CALCULATOR)] });
        const note = await addNote(page, 'Interactive note');
        await focusEditor(page, note);
        await page.keyboard.type('/intelligent');
        await page.getByRole('listbox', { name: 'Blocks', exact: true }).getByText('Intelligent UI', { exact: true }).click();
        await expect(block(page)).toBeVisible();
        await page.getByLabel('What would you like to explore?').fill('A bill splitter with editable inputs');
        await page.getByRole('button', { name: 'Generate interface', exact: true }).click();
        await expect(frame(page).getByText('€40.00 each')).toBeVisible();
        await expect(frame(page).locator('h1,h2,h3,p')).toHaveCount(0);
        const nativeText = note.getByText('Adjust the total and group size.', { exact: true });
        await expect(nativeText).toHaveAttribute('contenteditable', 'true');
        await nativeText.fill('My editable explanation');
        await expect.poll(async () => JSON.stringify((await readCanvasState(page))?.nodes)).toContain('My editable explanation');
        const noteState = (await readCanvasState(page))?.nodes.find(node => node.data?.label === 'Interactive note');
        const content = noteState?.data?.content as Array<{ type: string }>;
        expect(content.map(b => b.type)).toEqual(['heading2', 'text', 'intelligent-ui', 'text']);
        await frame(page).getByLabel('People', { exact: true }).fill('4');
        await expect(frame(page).getByText('€30.00 each')).toBeVisible();
        expect(stub.prompts).toHaveLength(1);
        expect(stub.phases).toEqual(['body']);
    });

    test('saved code and controls remain visible after reload and deselection', async ({ page }) => {
        await openCanvas(page);
        const stub = await stubAI(page);
        await seedBlock(page, true);
        await expect(frame(page).getByText('€40.00 each')).toBeVisible();
        await frame(page).getByLabel('People', { exact: true }).fill('6');
        await expect(frame(page).getByText('€20.00 each')).toBeVisible();
        await expect.poll(async () => JSON.stringify((await readCanvasState(page))?.nodes)).toContain('"people":"6"');
        await reload(page);
        await selectNode(page.locator('.react-flow__node[data-id="interactive-node"]'));
        await expect(frame(page).getByLabel('People', { exact: true })).toHaveValue('6');
        await expect(frame(page).getByText('€20.00 each')).toBeVisible();
        // Deselect before the 250ms state debounce; the final commit must reach
        // the newly visible passive frame without another selection round trip.
        await frame(page).getByLabel('People', { exact: true }).fill('7');
        await clickEmptyCanvas(page);
        await expect(page.locator('[data-intelligent-ui-preview]')).toBeVisible();
        await expect(frame(page).getByLabel('People', { exact: true })).toHaveValue('7');
        await expect(frame(page).getByText('€17.14 each')).toBeVisible();
        await expect(page.getByText('Select to interact', { exact: true })).toHaveCount(0);
        await selectNode(page.locator('.react-flow__node[data-id="interactive-node"]'));
        await expect(frame(page).getByLabel('People', { exact: true })).toHaveValue('7');
        await expect(frame(page).getByText('€17.14 each')).toBeVisible();
        expect(stub.prompts).toHaveLength(0);
    });

    test('unselected Intelligent UI stays visible and drags directly without a grip', async ({ page }, testInfo) => {
        await openCanvas(page);
        const stub = await stubAI(page);
        await seedBlock(page, true);
        const node = page.locator('.react-flow__node[data-id="interactive-node"]');
        await node.hover();
        await expect(node.locator('[class*="dragHandle"]')).toHaveCount(0);
        await frame(page).getByLabel('People', { exact: true }).fill('6');
        await expect.poll(async () => JSON.stringify((await readCanvasState(page))?.nodes)).toContain('"people":"6"');
        await clickEmptyCanvas(page);
        const overlay = node.locator('.interaction-overlay');
        await expect(overlay).toBeVisible();
        await expect(node.locator('[data-intelligent-ui-preview]')).toHaveAttribute('inert', '');
        await expect(frame(page).getByText('€20.00 each')).toBeVisible();
        await node.screenshot({ path: testInfo.outputPath('unselected-intelligent-ui.png') });
        const before = (await readCanvasState(page))!.nodes.find(n => n.id === 'interactive-node')!;
        const bounds = await overlay.boundingBox();
        if (!bounds) throw new Error('No unselected drag surface');
        const start = { x: bounds.x + bounds.width * .5, y: bounds.y + bounds.height * .35 };
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        await page.mouse.move(start.x + 160, start.y + 100, { steps: 16 }); await page.mouse.up();
        await expect.poll(async () => {
            const after = (await readCanvasState(page))!.nodes.find(n => n.id === 'interactive-node')!;
            return Math.hypot(after.position!.x - before.position!.x, after.position!.y - before.position!.y);
        }).toBeGreaterThan(60);
        await clickEmptyCanvas(page);
        await expect(node.locator('[data-intelligent-ui-preview]')).toBeVisible();
        await expect(frame(page).getByText('€20.00 each')).toBeVisible();
        await expect(node.locator('[class*="dragHandle"]')).toHaveCount(0);
        expect(JSON.stringify((await readCanvasState(page))!.nodes[0].data?.content)).toBe(JSON.stringify(before.data?.content));
        await node.screenshot({ path: testInfo.outputPath('dragged-intelligent-ui.png') });
        expect(stub.prompts).toHaveLength(0);
    });

    test('Ask chooses a UI without touching the canvas, then Keep creates an undoable block', async ({ page }) => {
        await openCanvas(page);
        await stubAI(page, { text: ['{"route":"answer","presentation":"intelligent-ui"}'], stream: [JSON.stringify(CALCULATOR)] });
        await openAIPanel(page, 'ask');
        await send(page, 'Help me divide restaurant expenses between friends');
        await expect(frame(page).getByText('€40.00 each')).toBeVisible();
        expect((await readCanvasState(page))?.nodes).toHaveLength(0);
        await frame(page).getByLabel('People', { exact: true }).fill('6');
        // Persist the selection into the transcript before copying the artifact.
        await expect.poll(() => page.evaluate(() => JSON.stringify((window as unknown as { __appStore: { getState: () => unknown } }).__appStore.getState()))).toContain('"people":"6"');
        await page.getByRole('button', { name: 'Keep as a block', exact: true }).click();
        await expect.poll(async () => (await readCanvasState(page))?.nodes.length).toBe(1);
        expect(JSON.stringify((await readCanvasState(page))?.nodes)).toContain('"people":"6"');
        await page.getByRole('button', { name: 'Undo created items', exact: true }).click();
        await expect.poll(async () => (await readCanvasState(page))?.nodes.length).toBe(0);
    });

    test('Create routes an implicit request into a native canvas block with provenance', async ({ page }) => {
        await openCanvas(page);
        const stub = await stubAI(page, { text: ['{"route":"create","presentation":"intelligent-ui","shapes":[]}'], stream: [JSON.stringify(CALCULATOR)] });
        await openAIPanel(page, 'create');
        await send(page, 'Let me adjust the group size and see what each person pays');
        const state = await readCanvasState(page);
        expect(state?.nodes).toHaveLength(1);
        expect(state?.nodes[0].type).toBe('fused-note');
        expect((state?.nodes[0].data?.content as Array<{ type: string }>).map(b => b.type)).toEqual(['heading2', 'text', 'intelligent-ui', 'text']);
        expect(state?.nodes[0].data?.aiProvenance).toBeTruthy();
        expect(JSON.stringify(state?.nodes[0].data?.content)).toContain('"type":"intelligent-ui"');
        expect(stub.prompts).toHaveLength(2);
    });

    test('a failed revision keeps working code; successful revisions can be restored', async ({ page }) => {
        await openCanvas(page);
        const stub = await stubAI(page, { stream: ['{"title":"unfinished"}', JSON.stringify({ ...CALCULATOR, title: 'Updated splitter' })] });
        await seedBlock(page, true);
        await page.getByLabel('Refine this interface').fill('Change the wording');
        await page.getByRole('button', { name: 'Update interface' }).click();
        await expect(block(page).getByRole('alert')).toContainText('invalid interface');
        await expect(frame(page).getByText('€40.00 each')).toBeVisible();
        await page.getByRole('button', { name: 'Update interface' }).click();
        await expect(page.locator('iframe[title="Updated splitter"]')).toBeVisible();
        await page.getByRole('button', { name: 'Restore previous revision' }).click();
        await expect(frame(page).getByText('€40.00 each')).toBeVisible();
        expect(stub.prompts[1]).toContain('[PREVIOUS INTERFACE TO REVISE]');
    });

    test('Stop cancels generation without replacing a saved artifact', async ({ page }) => {
        await openCanvas(page);
        await seedBlock(page, true);
        let requested = 0;
        await page.route('**/api/ai/stream', async route => {
            requested++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            await route.fulfill({ status: 200, contentType: 'text/plain', body: JSON.stringify({ ...CALCULATOR, title: 'Must not land' }) }).catch(() => {});
        });
        await page.getByLabel('Refine this interface').fill('Generate a different version');
        await page.getByRole('button', { name: 'Update interface' }).click();
        await expect.poll(() => requested).toBe(1);
        await block(page).getByRole('button', { name: 'Stop', exact: true }).click();
        await expect(frame(page).getByText('€40.00 each')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Update interface' })).toBeEnabled();
        await page.waitForTimeout(1200);
        expect(JSON.stringify((await readCanvasState(page))?.nodes)).not.toContain('Must not land');
        expect(requested).toBe(1);
    });

    test('truncated structured output fails once and preserves the last good artifact', async ({ page }) => {
        await openCanvas(page);
        await seedBlock(page, true);
        let requests = 0;
        await page.route('**/api/ai/stream', async route => {
            requests++;
            await route.fulfill({ status: 200, contentType: 'text/plain', body: '{"title":"cut off"\u001e{"finishReason":"length"}' });
        });
        await page.getByLabel('Refine this interface').fill('Make a larger tool');
        await page.getByRole('button', { name: 'Update interface' }).click();
        await expect(block(page).getByRole('alert')).toContainText('exceeded the generation limit');
        await expect(frame(page).getByText('€40.00 each')).toBeVisible();
        expect(requests).toBe(1);
    });

    test('unsupported saved versions never execute and oversized bridge state is rejected', async ({ page }) => {
        await openCanvas(page);
        const result = await page.evaluate(async () => {
            const modulePath = '/src/features/intelligent-ui/types.ts';
            const { isIntelligentUIArtifact, validateControlState, clampUIHeight } = await import(modulePath);
            return {
                invalid: isIntelligentUIArtifact({ version: 2 }),
                oversized: validateControlState({ value: 'x'.repeat(2001) }) === undefined,
                unsafeKey: validateControlState(JSON.parse('{"__proto__":"bad"}')) === undefined,
                badNumber: validateControlState({ value: Infinity }) === undefined,
                badHeight: clampUIHeight(NaN),
            };
        });
        expect(result).toEqual({ invalid: false, oversized: true, unsafeKey: true, badNumber: true, badHeight: null });
    });

    test('the frame is responsive and matches the host at desktop and narrow widths', async ({ page }, testInfo) => {
        await openCanvas(page);
        await seedBlock(page, true);
        await expect(frame(page).getByText('€40.00 each')).toBeVisible();
        await expect(frame(page).locator('main > section')).toHaveCSS('border-top-width', '0px');
        await expect(frame(page).locator('main > section')).toHaveCSS('padding', '0px');
        await block(page).screenshot({ path: testInfo.outputPath('intelligent-ui-desktop.png') });
        await page.evaluate(() => {
            const store = (window as unknown as { __appStore: { getState: () => { updateNode: (id: string, patch: unknown) => void } } }).__appStore;
            store.getState().updateNode('interactive-node', { style: { width: 300 } });
        });
        await expect.poll(() => frame(page).locator('body').evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
        await block(page).screenshot({ path: testInfo.outputPath('intelligent-ui-narrow.png') });
    });
});

test.describe('core: Intelligent UI enhanced rendering', () => {
    test('inherits both scrollbars and always opens dropdowns directly below their button', async ({ page }, testInfo) => {
        await openCanvas(page);
        const options = Array.from({ length: 18 }, (_, index) => `<option value="${index}">Scenario ${index + 1}</option>`).join('');
        await seedBlock(page, true, { ...artifact(),
            html: `<label for="top-choice">Scenario</label><select id="top-choice">${options}</select><div id="scroll-area" tabindex="0" aria-label="Wide diagram"><svg width="900" height="320" role="img" aria-label="Scrollable comparison"><rect width="900" height="320" fill="var(--ui-surface)"/><path d="M20 160H880" stroke="var(--ui-accent)" stroke-width="3"/></svg></div><label for="bottom-choice">Compare with</label><select id="bottom-choice">${options}</select><output id="selection">Scenario 1</output>`,
            css: 'label,output{display:block}select{width:100%;margin:4px 0 12px}#scroll-area{height:120px;overflow:auto;margin-bottom:12px}#scroll-area svg{max-width:none}output{margin-top:8px}',
            jsFunctions: "function setup(){document.getElementById('bottom-choice').addEventListener('change',event=>document.getElementById('selection').textContent=event.target.selectedOptions[0].textContent)}", jsExpressions: ['setup();'] });
        const scroll = frame(page).locator('#scroll-area');
        await expect(scroll).toHaveCSS('scrollbar-width', 'thin');
        const scrollbarColors = await scroll.evaluate(el => [getComputedStyle(el).scrollbarColor, getComputedStyle(document.documentElement).scrollbarColor]);
        expect(scrollbarColors[0]).toBe(scrollbarColors[1]);
        expect(scrollbarColors[0]).not.toBe('auto');
        expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight && el.scrollWidth > el.clientWidth)).toBe(true);
        await scroll.evaluate(el => { el.scrollLeft = 80; el.scrollTop = 80; });
        await expect.poll(() => scroll.evaluate(el => [Math.round(el.scrollLeft), Math.round(el.scrollTop)])).toEqual([80, 80]);
        for (const width of [640, 300]) {
            await page.evaluate(width => (window as unknown as { __appStore: { getState: () => { updateNode: (id: string, patch: unknown) => void } } }).__appStore.getState().updateNode('interactive-node', { style: { width } }), width);
            await expect.poll(() => frame(page).locator('body').evaluate(() => innerWidth)).toBeLessThan(width);
            // Canvas zoom can round fractional frame widths up for scrollWidth
            // and down for innerWidth; tolerate that one CSS pixel only.
            await expect.poll(() => frame(page).locator('body').evaluate(el => el.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
            for (const id of ['top-choice', 'bottom-choice']) {
                const select = frame(page).locator(`#${id}`);
                await expect.poll(() => frame(page).locator('body').evaluate(el => {
                    const style = getComputedStyle(el);
                    const base = Math.ceil(el.querySelector('main')!.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom));
                    return Math.abs(innerHeight - base);
                })).toBeLessThanOrEqual(1);
                const closedHeight = await frame(page).locator('body').evaluate(() => innerHeight);
                await select.focus();
                await select.press('Space');
                await expect.poll(() => select.evaluate(el => el.matches(':open'))).toBe(true);
                if (id === 'bottom-choice') await expect.poll(() => frame(page).locator('body').evaluate(() => innerHeight)).toBeGreaterThan(closedHeight + 100);
                const bounds = await select.evaluate(el => {
                    const option = el.querySelector('option')!.getBoundingClientRect();
                    const anchor = el.getBoundingClientRect();
                    return { top: option.top, left: option.left, right: option.right, frameWidth: innerWidth,
                        anchorTop: anchor.top, anchorBottom: anchor.bottom };
                });
                expect(bounds.top).toBeGreaterThanOrEqual(4);
                expect(bounds.left).toBeGreaterThanOrEqual(4);
                expect(bounds.right).toBeLessThanOrEqual(bounds.frameWidth - 4);
                expect(bounds.top - bounds.anchorBottom).toBeGreaterThanOrEqual(4);
                expect(bounds.top - bounds.anchorBottom).toBeLessThanOrEqual(12);
                await block(page).screenshot({ path: testInfo.outputPath(`dropdown-${id}-${width}.png`) });
                await page.keyboard.press('Escape');
                await expect.poll(() => select.evaluate(el => el.matches(':open'))).toBe(false);
                await expect.poll(() => frame(page).locator('body').evaluate(() => innerHeight)).toBe(closedHeight);
            }
        }
        const bottom = frame(page).locator('#bottom-choice');
        await bottom.focus(); await bottom.press('Space'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
        await expect(frame(page).locator('#selection')).toHaveText('Scenario 18');
        await expect.poll(async () => JSON.stringify((await readCanvasState(page))?.nodes)).toContain('"bottom-choice":"17"');
        const frameBox = await page.locator('iframe[title="Bill splitter"]').boundingBox();
        const local = await bottom.evaluate(el => { const rect = el.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: innerWidth }; });
        if (!frameBox) throw new Error('No frame bounds');
        const scale = frameBox.width / local.width;
        await page.mouse.click(frameBox.x + local.x * scale, frameBox.y + local.y * scale);
        await expect.poll(() => bottom.evaluate(el => el.matches(':open'))).toBe(true);
        await page.keyboard.press('Home'); await page.keyboard.press('Enter');
        await expect(frame(page).locator('#selection')).toHaveText('Scenario 1');
    });

    test('streams an inert visual before completion and commits only validated code', async ({ page }, testInfo) => {
        await openCanvas(page);
        await seedBlock(page);
        const generated = { ...CALCULATOR, html: '<h2>Native title</h2><svg viewBox="0 0 400 140" role="img" aria-label="Streaming diagram"><rect id="preview-shape" x="10" y="10" width="380" height="120" rx="8" fill="var(--ui-accent)"></rect></svg><output id="ready">Waiting</output><button>Ask AI</button>',
            jsFunctions: "function setup(){document.getElementById('ready').textContent='Interactive';}", jsExpressions: ['setup();'] };
        const full = JSON.stringify(generated);
        const cssStart = full.indexOf('"css":') + 9;
        const htmlEnd = full.indexOf(',"jsFunctions":');
        const stream = await chunkedAI(page, full.slice(0, cssStart));
        try {
            await page.getByLabel('What would you like to explore?').fill('A streamed diagram');
            await page.getByRole('button', { name: 'Generate interface', exact: true }).click();
            await expect.poll(stream.started).toBe(true);
            await expect(page.locator('[data-intelligent-ui-streaming]')).toHaveCount(0);
            stream.write(full.slice(cssStart, htmlEnd));
            const preview = page.frameLocator('iframe[title="Generating interface preview"]');
            await expect(preview.locator('#preview-shape')).toBeVisible();
            await expect(preview.locator('#ready')).toHaveText('Waiting');
            await expect(preview.locator('h2')).toHaveCount(0);
            await expect(preview.getByRole('button')).toBeDisabled();
            await expect.poll(async () => JSON.stringify((await readCanvasState(page))?.nodes)).not.toContain('"artifact":');
            await block(page).screenshot({ path: testInfo.outputPath('streaming-preview.png') });
            stream.finish(full.slice(htmlEnd));
            await expect(frame(page).locator('#ready')).toHaveText('Interactive');
            await expect(page.locator('[data-intelligent-ui-streaming]')).toHaveCount(0);
            await expect.poll(async () => JSON.stringify((await readCanvasState(page))?.nodes)).toContain('Native title');
        } finally { await stream.close(); }
    });

    test('stopping a streamed refinement removes preview and preserves the saved controls', async ({ page }) => {
        await openCanvas(page);
        await seedBlock(page, true);
        const full = JSON.stringify({ ...CALCULATOR, title: 'Uncommitted preview' });
        const split = full.indexOf(',"jsFunctions":');
        const stream = await chunkedAI(page, full.slice(0, split));
        try {
            await page.getByLabel('Refine this interface').fill('Preview a new version');
            await page.getByRole('button', { name: 'Update interface' }).click();
            await expect(page.locator('[data-intelligent-ui-streaming]')).toBeVisible();
            await block(page).getByRole('button', { name: 'Stop', exact: true }).click();
            stream.finish(full.slice(split));
            await expect(page.locator('[data-intelligent-ui-streaming]')).toHaveCount(0);
            await expect(frame(page).getByText('€40.00 each')).toBeVisible();
            expect(JSON.stringify((await readCanvasState(page))?.nodes)).not.toContain('Uncommitted preview');
        } finally { await stream.close(); }
    });

    test('a real AI button sends selected values once and preserves the unsent chat draft', async ({ page }) => {
        await openCanvas(page);
        const withPrompt = { ...CALCULATOR, html: CALCULATOR.html + '<button id="ask-scenario">Ask AI about this scenario</button><output id="bridge-status"></output>',
            jsExpressions: ['setup();', "document.getElementById('ask-scenario').addEventListener('click',async()=>{try{await chnkUI.sendPrompt({text:'Explain this share',values:{formula:'total / people'}});document.getElementById('bridge-status').textContent='Sent';}catch(error){document.getElementById('bridge-status').textContent=error.message;}});", "chnkUI.sendPrompt({text:'Must never send automatically'}).catch(()=>{});"] };
        const stub = await stubAI(page, { text: ['{"route":"answer","presentation":"intelligent-ui"}', '{"route":"answer","presentation":"text"}'],
            stream: [JSON.stringify(withPrompt), 'Each person pays twenty illustrative euros.'] });
        await openAIPanel(page, 'ask');
        await send(page, 'Make a bill splitter');
        expect(stub.prompts).toHaveLength(2);
        await frame(page).getByLabel('People', { exact: true }).fill('6');
        await page.getByLabel('Ask AI', { exact: true }).fill('My unsent draft');
        await frame(page).getByRole('button', { name: 'Ask AI about this scenario' }).press('Enter');
        await expect(frame(page).locator('#bridge-status')).toHaveText('Sent');
        await expect(page.getByText('Each person pays twenty illustrative euros.', { exact: true })).toBeVisible();
        expect(stub.prompts).toHaveLength(4);
        expect(stub.prompts[3]).toContain('"people":"6"');
        expect(stub.prompts[3]).toContain('total / people');
        expect(stub.prompts.join(' ')).not.toContain('Must never send automatically');
        await expect(page.getByLabel('Ask AI', { exact: true })).toHaveValue('My unsent draft');
    });

    test('a canvas button opens Ask with a mouse click and keeps its original visual', async ({ page }) => {
        await openCanvas(page);
        const stub = await stubAI(page, { text: ['{"route":"answer","presentation":"text"}'], stream: ['This is the selected canvas scenario.'] });
        await seedBlock(page, true, { ...artifact(), html: '<button id="ask-scenario" style="padding:12px">Ask AI about this scenario</button><output id="bridge-status"></output>',
            jsFunctions: "function setup(){document.getElementById('ask-scenario').addEventListener('click',()=>chnkUI.sendPrompt({text:'Explain this canvas scenario',values:{selected:'A'}}).catch(error=>document.getElementById('bridge-status').textContent=error.message));}", jsExpressions: ['setup();'] });
        const before = JSON.stringify((await readCanvasState(page))?.nodes[0].data?.content);
        const button = frame(page).getByRole('button', { name: 'Ask AI about this scenario' });
        await button.scrollIntoViewIfNeeded();
        let previousBounds = '';
        await expect.poll(async () => {
            const bounds = await page.locator('iframe[title="Bill splitter"]').boundingBox();
            const key = JSON.stringify(bounds && [bounds.x, bounds.y, bounds.width, bounds.height].map(Math.round));
            const stable = key === previousBounds;
            previousBounds = key;
            return stable;
        }).toBe(true);
        const frameBox = await page.locator('iframe[title="Bill splitter"]').boundingBox();
        const local = await button.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: innerWidth }; });
        if (!frameBox) throw new Error('No frame bounds');
        const scale = frameBox.width / local.width;
        const point = { x: frameBox.x + local.x * scale, y: frameBox.y + local.y * scale };
        await page.mouse.click(point.x, point.y);
        await expect(page.getByText('This is the selected canvas scenario.', { exact: true })).toBeVisible();
        expect(stub.prompts).toHaveLength(2);
        expect(stub.prompts[1]).toContain('"selected":"A"');
        expect(JSON.stringify((await readCanvasState(page))?.nodes[0].data?.content)).toBe(before);
    });

    test('local engines render a real chart, 3D mesh, animation and map without a CDN', async ({ page }, testInfo) => {
        await openCanvas(page);
        const loaded: string[] = [];
        page.on('request', request => { if (request.url().includes('/intelligent-ui-libs/')) loaded.push(request.url()); });
        await page.route('https://basemap.nationalmap.gov/**', route => route.fulfill({ contentType: 'image/png',
            body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64') }));
        await seedBlock(page, true, { ...artifact(), libraries: ['three', 'd3', 'chart.js', 'gsap', 'leaflet'],
            html: '<svg id="d3-chart" viewBox="0 0 400 40" role="img" aria-label="Illustrative bar"></svg><canvas id="three-scene" width="360" height="140" aria-label="Interactive 3D cube"></canvas><canvas id="chart" width="360" height="140" aria-label="Illustrative chart"></canvas><div id="map" style="height:180px" aria-label="Illustrative map"></div><output id="engines"></output>',
            css: 'canvas{display:block;width:100%;max-width:360px}#d3-chart{display:block;width:100%}',
            jsFunctions: `function setup(){
                d3.select('#d3-chart').append('rect').attr('width',280).attr('height',30).attr('fill','var(--ui-accent)');
                const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(50,360/140,.1,100); camera.position.z=4;
                const cube=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({color:0xff553e,wireframe:true}));scene.add(cube);
                const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('three-scene'),alpha:true});renderer.setSize(360,140);renderer.render(scene,camera);
                document.getElementById('three-scene').dataset.rendered=String(renderer.info.render.frame);
                new Chart(document.getElementById('chart'),{type:'bar',data:{labels:['A','B'],datasets:[{data:[12,20],backgroundColor:'#ff553e'}]},options:{responsive:false,animation:false,plugins:{legend:{display:false}}}});
                const state={value:0};gsap.to(state,{value:7,duration:1,paused:true}).progress(1);
                const map=L.map('map',{zoomControl:false}).setView([36.8,10.18],8);L.circleMarker([36.8,10.18]).addTo(map);
                L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',{attribution:'USGS',maxZoom:18}).addTo(map);
                document.getElementById('engines').textContent='Engines ready: '+state.value;
            }`, jsExpressions: ['setup();'] });
        await expect(frame(page).locator('#engines')).toHaveText('Engines ready: 7', { timeout: 30_000 });
        await expect(frame(page).locator('#d3-chart rect')).toHaveAttribute('width', '280');
        await expect(frame(page).locator('#three-scene')).toHaveAttribute('data-rendered', '1');
        await expect(frame(page).locator('.leaflet-interactive')).toBeAttached();
        await expect(frame(page).locator('#map')).toContainText('USGS');
        expect(loaded.filter(url => url.endsWith('.js'))).toHaveLength(5);
        expect(loaded.every(url => new URL(url).hostname === '127.0.0.1')).toBe(true);
        await block(page).screenshot({ path: testInfo.outputPath('advanced-engines.png') });
    });

    test('downloads a standalone working visual with values and native prose', async ({ page }) => {
        await openCanvas(page);
        await seedBlock(page, true);
        await frame(page).getByLabel('People', { exact: true }).fill('6');
        await expect.poll(async () => JSON.stringify((await readCanvasState(page))?.nodes)).toContain('"people":"6"');
        const downloading = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download interface' }).click();
        const download = await downloading;
        const path = await download.path();
        if (!path) throw new Error('No export file');
        const html = await readFile(path, 'utf8');
        expect(html).toContain('Adjust the total and group size.');
        expect(html).not.toContain('Authorization');
        await page.route('**/qa-ui-export.html', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.goto('/qa-ui-export.html');
        await expect(frame(page).getByLabel('People', { exact: true })).toHaveValue('6');
        await expect(frame(page).getByText('€20.00 each')).toBeVisible();
        await frame(page).getByLabel('People', { exact: true }).fill('4');
        await expect(frame(page).getByText('€30.00 each')).toBeVisible();
        await expect.poll(() => frame(page).locator('body').evaluate(el => el.scrollHeight <= window.innerHeight)).toBe(true);
    });
});

test.describe('core: Intelligent UI sandbox', () => {
    test.use({ allowConsoleErrors: true });
    test('blocks host/storage/network access and ignores forged host messages', async ({ page }) => {
        await openCanvas(page);
        const malicious = { ...artifact(), jsFunctions: `function setup(){let denied=0;try{parent.document.body.dataset.sandboxEscaped='yes'}catch{denied++}try{localStorage.getItem('secret')}catch{denied++}document.getElementById('result').textContent='Denied: '+denied;fetch('/api/ai/text').catch(()=>{});chnkUI.sendPrompt({text:'Automatic request'}).catch(()=>{});parent.postMessage({channel:'chnk-intelligent-ui',id:'fixture-ui',type:'prompt',token:'forged',requestId:'forged',value:{text:'Forged request',values:{}}},'*');}` };
        await seedCanvasState(page, [{ id: 'security-node', type: 'block', position: { x: 80, y: 80 }, style: { width: 640 }, data: {
            content: [{ id: 'security-block', type: 'intelligent-ui', content: 'Bill splitter', metadata: { intelligentUI: { artifact: malicious } } }], isStandaloneBlock: true,
        } }]);
        let calls = 0;
        page.on('request', request => { if (request.url().includes('/api/ai/')) calls++; });
        await page.locator('.react-flow__node[data-id="security-node"] .interaction-overlay').click();
        await expect(page.locator('iframe[data-ui-ready="true"]')).toBeVisible();
        await expect(frame(page).getByText('Denied: 2')).toBeVisible();
        expect(await page.locator('body').getAttribute('data-sandbox-escaped')).toBeNull();
        expect(calls).toBe(0);
        await page.evaluate(() => window.postMessage({ channel: 'chnk-intelligent-ui', id: 'fixture-ui', type: 'state', value: { people: '999' } }, '*'));
        await page.waitForTimeout(350);
        expect(JSON.stringify((await readCanvasState(page))?.nodes)).not.toContain('999');
        await expect(page.locator('iframe[title="Bill splitter"]')).toHaveAttribute('sandbox', 'allow-scripts');
    });
});
