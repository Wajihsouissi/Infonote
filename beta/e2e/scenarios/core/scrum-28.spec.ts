import { test, expect } from '../../support/fixtures';
import type { Locator, Page } from '@playwright/test';
import { clickEmptyCanvas, fitView, nodeById, openCanvas, reload, waitForLocalSave } from '../../support/canvas';
import { readCanvasState, seedCanvasState, type CanvasStateNode } from '../../support/canvasState';
import type { Block } from '../../../src/features/editor/types';

type Surface = 'card' | 'fused-note' | 'canvas';
const surfaces: Surface[] = ['card', 'fused-note', 'canvas'];
const base = 'Before word after — مرحبا café 😀';
const b = (id: string, content: string, extra: Partial<Block> = {}): Block => ({ id, type: 'text', content, ...extra });
const ownerId = 'scrum28-owner';
const edit = (page: Page, id = 'line') => page.locator(`[data-block-id="${id}"] [contenteditable="true"]`).first();
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Text formatting', exact: true });

async function activate(page: Page) {
    const node = nodeById(page, ownerId), shield = node.locator('.interaction-overlay');
    if (await shield.count()) await shield.click();
    else if (!await node.locator('[contenteditable="true"]').count()) await node.click({ position: { x: 30, y: 14 } });
    // Use one live locator across scheduled reader/editor promotion. Choosing
    // the reader from a count and then awaiting its click can target a reader
    // which has already been replaced by an editor (especially in Firefox).
    await node.locator('[contenteditable="true"], [data-reader-text]').first().click();
    await expect(node.locator('[contenteditable="true"]').first()).toBeVisible();
    return node;
}
async function prepare(page: Page, surface: Surface, blocks: Block[], extras: CanvasStateNode[] = [], activateEditor = true) {
    await openCanvas(page);
    await seedCanvasState(page, [{ id: ownerId, type: surface === 'card' ? 'note' : surface === 'canvas' ? 'block' : 'fused-note',
        position: { x: 100, y: 80 }, style: { width: 680, height: surface === 'canvas' ? 160 : 500 },
        data: { label: 'SCRUM-28 inline document', viewMode: 'expanded', content: blocks, isStandaloneBlock: surface === 'canvas' },
    }, ...extras]);
    await fitView(page);
    return activateEditor ? activate(page) : nodeById(page, ownerId);
}
async function blocks(page: Page): Promise<Block[]> {
    return (await readCanvasState(page))!.nodes.find(n => n.id === ownerId)!.data!.content as Block[];
}
async function saved(page: Page, expected: string, id = 'line') {
    await expect.poll(async () => (await blocks(page)).find(b => b.id === id)?.content).toBe(expected);
}
async function select(page: Page, host: Locator, start: number, length: number) {
    await host.focus(); await page.keyboard.press('Home');
    for (let i = 0; i < start; i++) await page.keyboard.press('ArrowRight');
    for (let i = 0; i < length; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect(toolbar(page)).toBeVisible();
}
const target = (id: string, parentId?: string): CanvasStateNode => ({ id, type: 'note', parentId, position: { x: 850, y: 80 },
    style: { width: 432, height: 300 }, data: { label: `Target ${id}`, content: [b(`body-${id}`, `Only ${id} content`)], viewMode: 'expanded' } });

test.describe('SCRUM-28 inline formatting and safe links', () => {
    test.beforeAll(async ({ browser }, info) => console.info(`[SCRUM-28 browser] ${info.project.name}: ${browser.version()}`));
    test.afterEach(async ({ page, browserName }, info) => {
        if (info.status === 'passed' && browserName === 'firefox') {
            await waitForLocalSave(page); await page.goto('about:blank', { waitUntil: 'commit' });
        }
    });
    for (const surface of surfaces) {
        test(`${surface}: keyboard and toolbar marks toggle selectively and persist`, async ({ page }, info) => {
            test.setTimeout(100000);
            await prepare(page, surface, [b('line', base)]);
            const formats = [['Control+b', 'Bold (Ctrl+B)', '**'], ['Control+i', 'Italic (Ctrl+I)', '*'],
                ['Control+u', 'Underline (Ctrl+U)', '++'], ['Control+Shift+s', 'Strikethrough (Ctrl+Shift+S)', '~~'], ['Control+e', 'Code (Ctrl+E)', '`']];
            for (const [shortcut, name, marker] of formats) {
                await select(page, edit(page), 7, 4); await page.keyboard.press(shortcut);
                await saved(page, `Before ${marker}word${marker} after — مرحبا café 😀`);
                await select(page, edit(page), 7, 4);
                await expect(toolbar(page).getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
                await page.keyboard.press(shortcut); await saved(page, base);
                await select(page, edit(page), 7, 4); await toolbar(page).getByRole('button', { name, exact: true }).click();
                await saved(page, `Before ${marker}word${marker} after — مرحبا café 😀`);
                await toolbar(page).getByRole('button', { name, exact: true }).click(); await saved(page, base);
            }
            await select(page, edit(page), 7, 4); await page.keyboard.press('Control+b');
            await clickEmptyCanvas(page); await reload(page);
            expect((await blocks(page))[0].content).toBe('Before **word** after — مرحبا café 😀');
            await page.screenshot({ path: info.outputPath(`${surface}-formats.png`) });
        });

        test(`${surface}: all highlight colors and shortcut removal persist`, async ({ page }, info) => {
            test.setTimeout(100000); await prepare(page, surface, [b('line', 'Before word after')]);
            const hues = ['rose','amber','citrine','olive','jade','teal','azure','indigo','violet','magenta'];
            for (const hue of hues) {
                await edit(page).fill('Before word after'); await select(page, edit(page), 7, 4);
                await toolbar(page).getByRole('button', { name: 'Highlight (Ctrl+Shift+H)', exact: true }).click();
                await page.getByRole('option', { name: `Highlight ${hue}`, exact: true }).click();
                await saved(page, `Before ==${hue}|word== after`);
                await expect(edit(page).locator(`mark[data-hue="${hue}"]`)).toHaveText('word');
            }
            await select(page, edit(page), 7, 4); await page.keyboard.press('Control+Shift+h'); await saved(page, 'Before word after');
            await select(page, edit(page), 7, 4); await page.keyboard.press('Control+Shift+h'); await saved(page, 'Before ==citrine|word== after');
            await clickEmptyCanvas(page); await reload(page);
            expect((await blocks(page))[0].content).toBe('Before ==citrine|word== after');
            await page.screenshot({ path: info.outputPath(`${surface}-highlights.png`) });
        });

        test(`${surface}: external URL destinations, balanced punctuation and unsafe content render correctly`, async ({ page }, info) => {
            const raw = '[**Label**](https://example.test/**path**?q=++x++&v=~~y~~) [Article](https://example.test/a(b(c))?q=1) www.example.test/x. [bad](javascript:alert(1)) <img src=x onerror="window.__s28Executed=1">';
            const node = await prepare(page, surface, [b('line', raw)]);
            const links = edit(page).locator('a[href]');
            await expect(links).toHaveCount(3);
            await expect(links.nth(0)).toHaveAttribute('href', 'https://example.test/**path**?q=++x++&v=~~y~~');
            await expect(links.nth(0).locator('strong')).toHaveText('Label');
            await expect(links.nth(1)).toHaveAttribute('href', 'https://example.test/a(b(c))?q=1');
            await expect(links.nth(2)).toHaveAttribute('href', 'https://www.example.test/x');
            await expect(node.locator('img[src="x"], script, a[href^="javascript:"], a[href^="data:"]')).toHaveCount(0);
            for (const link of await links.all()) { await expect(link).toHaveAttribute('target', '_blank'); await expect(link).toHaveAttribute('rel', 'noopener noreferrer'); }
            expect(await page.evaluate(() => (window as unknown as {__s28Executed?:number}).__s28Executed)).toBeUndefined();
            const popupPromise = page.waitForEvent('popup'); await links.nth(1).click({ modifiers: ['Control'] });
            const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded');
            expect(popup.url()).toBe('https://example.test/a(b(c))?q=1');
            expect(await popup.evaluate(() => window.opener === null)).toBe(true); await popup.close();
            await reload(page); expect((await blocks(page))[0].content).toBe(raw);
            await page.screenshot({ path: info.outputPath(`${surface}-safe-links.png`) });
        });

        test(`${surface}: link toolbar validates, cancels, edits and unlinks with keyboard controls`, async ({ page }, info) => {
            test.setTimeout(90000); await prepare(page, surface, [b('line', 'Before word after')]);
            await select(page, edit(page), 7, 4); await page.keyboard.press('Control+k');
            const input = page.getByRole('textbox', { name: 'Link URL', exact: true });
            await input.fill('javascript:alert(1)'); await input.press('Enter');
            await expect(input).toBeVisible(); await expect(input).toHaveAttribute('aria-invalid', 'true');
            await expect(page.getByRole('alert')).toContainText('http:// or https://');
            await saved(page, 'Before word after');
            await page.screenshot({ path: info.outputPath(`${surface}-invalid-link.png`) });
            await input.press('Escape'); await expect(edit(page)).toBeFocused();
            await select(page, edit(page), 7, 4); await toolbar(page).getByRole('button', { name: 'Link (Ctrl+K)', exact: true }).click();
            await input.fill('example.test/first');
            await toolbar(page).getByRole('button', { name: 'Apply link', exact: true }).focus(); await page.keyboard.press('Enter');
            await saved(page, 'Before [word](https://example.test/first) after');
            await select(page, edit(page), 7, 4); await page.keyboard.press('Control+k');
            await expect(input).toHaveValue('https://example.test/first'); await input.fill('https://example.test/second'); await input.press('Enter');
            await saved(page, 'Before [word](https://example.test/second) after');
            await select(page, edit(page), 7, 4); await page.keyboard.press('Control+k');
            await toolbar(page).getByRole('button', { name: 'Remove link', exact: true }).click(); await saved(page, 'Before word after');
            await reload(page); expect((await blocks(page))[0].content).toBe('Before word after');
        });

        test(`${surface}: citation identity survives editing and missing targets preserve navigation`, async ({ page }, info) => {
            const raw = 'Before [Source](chnk://node/source-target) [Page](chnk://page/page-target) [Missing](chnk://page/missing-target) [Deleted citation](chnk://node/deleted-target) after';
            await prepare(page, surface, [b('line', raw)], [target('source-target'), target('page-target')]);
            await edit(page).focus(); await page.keyboard.press('End'); await page.keyboard.type('!'); await saved(page, raw + '!');
            await reload(page); await activate(page);
            await expect(edit(page).locator('[data-cite-node="source-target"]')).toHaveCount(1);
            const current = () => page.evaluate(() => {
                const s = (window as unknown as {__appStore:{getState:()=>{fullscreenId:string|null; currentParentId:string|null;selectedCanvasNodeIds:Set<string>}}}).__appStore.getState();
                return { fullscreen: s.fullscreenId, parent: s.currentParentId, selected: [...s.selectedCanvasNodeIds] };
            });
            const before = await current();
            await edit(page).locator('[data-page-id="missing-target"]').click(); expect(await current()).toEqual(before);
            await edit(page).locator('[data-cite-node="deleted-target"]').click(); expect(await current()).toEqual(before);
            await edit(page).locator('[data-page-id="page-target"]').focus(); await page.keyboard.press('Enter');
            await expect.poll(async () => (await current()).fullscreen).toBe('page-target');
            await page.keyboard.press('Escape');
            await page.evaluate(() => (window as unknown as {__appStore:{getState:()=>{setFullscreenId:(id:null)=>void}}}).__appStore.getState().setFullscreenId(null));
            await activate(page); await edit(page).locator('[data-cite-node="source-target"]').click();
            await expect.poll(async () => (await current()).selected).toEqual(['source-target']);
            await page.screenshot({ path: info.outputPath(`${surface}-citations.png`) });
        });

        test(`${surface}: native Enter balances marked halves and replaces selection without duplication`, async ({ page }, info) => {
            await prepare(page, surface, [b('line', 'Before **boldword** after')]);
            await edit(page).focus(); await page.keyboard.press('Home');
            for (let i=0;i<9;i++) await page.keyboard.press('ArrowRight');
            await page.keyboard.press('Enter');
            await expect.poll(async () => (await readCanvasState(page))!.nodes.flatMap(n=>Array.isArray(n.data?.content)?n.data.content as Block[]:[]).map(b=>b.content)).toEqual(['Before **bo**','**ldword** after']);
            await page.keyboard.type('X');
            await expect.poll(async () => (await readCanvasState(page))!.nodes.flatMap(n=>Array.isArray(n.data?.content)?n.data.content as Block[]:[]).map(b=>b.content).join('|')).toContain('X');
            await waitForLocalSave(page); await reload(page);
            const all = (await readCanvasState(page))!.nodes.flatMap(n=>Array.isArray(n.data?.content)?n.data.content as Block[]:[]);
            expect(all.map(b=>b.content).join('')).toContain('Before **bo**');
            expect(all.map(b=>b.content).join('')).not.toContain('boldwordboldword');
            await page.screenshot({ path: info.outputPath(`${surface}-enter.png`) });
        });

        test(`${surface}: partial code removal, nested marks and undo redo preserve neighbors`, async ({ page }, info) => {
            await prepare(page, surface, [b('line', 'Before `word` after')]);
            await select(page, edit(page), 8, 2); await page.keyboard.press('Control+e');
            await saved(page, 'Before `w`or`d` after');
            await expect(edit(page).locator('code')).toHaveText(['w', 'd']);
            await edit(page).fill('Before **word** after'); await clickEmptyCanvas(page); await activate(page);
            await select(page, edit(page), 7, 4); await page.keyboard.press('Control+i'); await saved(page, 'Before ***word*** after');
            await waitForLocalSave(page);
            await select(page, edit(page), 7, 4); await page.keyboard.press('Control+b'); await saved(page, 'Before *word* after');
            await waitForLocalSave(page); await clickEmptyCanvas(page);
            await page.keyboard.press('Control+z'); await saved(page, 'Before ***word*** after');
            await page.keyboard.press('Control+Shift+z'); await saved(page, 'Before *word* after');
            await reload(page); expect((await blocks(page))[0].content).toBe('Before *word* after');
            await page.screenshot({ path: info.outputPath(`${surface}-nested-marks.png`) });
        });

        test(`${surface}: selected Enter preserves both link labels and highlights`, async ({ page }, info) => {
            await prepare(page, surface, [b('line', 'Before [**word**](https://example.test/x) ==jade|next== after')]);
            await select(page, edit(page), 8, 2); await page.keyboard.press('Enter');
            const all = async () => (await readCanvasState(page))!.nodes.flatMap(n=>Array.isArray(n.data?.content)?n.data.content as Block[]:[]).map(b=>b.content);
            await expect.poll(all).toEqual(['Before [**w**](https://example.test/x)', '[**d**](https://example.test/x) ==jade|next== after']);
            await waitForLocalSave(page); await reload(page);
            expect(await all()).toEqual(['Before [**w**](https://example.test/x)', '[**d**](https://example.test/x) ==jade|next== after']);
            await page.screenshot({ path: info.outputPath(`${surface}-selected-enter.png`) });
        });

        test(`${surface}: selected readers activate nested citations and ignore deleted targets by keyboard`, async ({ page }, info) => {
            await prepare(page, surface, [b('line', '[Gone](chnk://node/no-target) [Nested source](chnk://node/nested-target)')], [target('nested-parent'), target('nested-target', 'nested-parent')], false);
            const shield = nodeById(page, ownerId).locator('.interaction-overlay');
            if (await shield.count()) await shield.click();
            const state = () => page.evaluate(() => {const s=(window as unknown as {__appStore:{getState:()=>{currentParentId:string|null;selectedCanvasNodeIds:Set<string>}}}).__appStore.getState();return {parent:s.currentParentId,selected:[...s.selectedCanvasNodeIds]};});
            const owner = nodeById(page, ownerId);
            await expect(owner.locator('[data-canvas-node-interaction]')).toHaveAttribute('data-canvas-node-interaction', 'interact');
            // Fused/standalone readers promote asynchronously after selection.
            // Wait for that ownership transition before choosing a DOM target.
            if (surface !== 'card') await expect(owner.locator('[data-chnk-it-block-editor]')).toBeVisible();
            await owner.locator('[data-cite-node="no-target"]').focus();
            await expect(owner.locator('[data-cite-node="no-target"]')).toBeFocused();
            const before = await state();
            await page.keyboard.press('Enter'); expect(await state()).toEqual(before);
            await page.keyboard.press('Space'); expect(await state()).toEqual(before);
            await page.keyboard.press('Tab');
            await expect(owner.locator('[data-cite-node="nested-target"]')).toBeFocused();
            await page.keyboard.press('Enter');
            await expect.poll(state).toEqual({ parent: 'nested-parent', selected: ['nested-target'] });
            await expect(nodeById(page, 'nested-target')).toBeVisible();
            await page.screenshot({ path: info.outputPath(`${surface}-nested-citation.png`) });
        });
    }

    test('nested container selection belongs to one toolbar and persists to the nested document', async ({ page }, info) => {
        await prepare(page, 'card', [b('container', '', { type: 'container', metadata: { blocks: [b('nested-line', 'Before word after')] } })]);
        await select(page, edit(page, 'nested-line'), 7, 4);
        await expect(toolbar(page)).toHaveCount(1);
        await toolbar(page).getByRole('button', { name: 'Bold (Ctrl+B)', exact: true }).click();
        await expect.poll(async () => (await blocks(page))[0].metadata?.blocks?.[0].content).toBe('Before **word** after');
        expect((await blocks(page))[0].content).toBe('');
        await reload(page); expect((await blocks(page))[0].metadata?.blocks?.[0].content).toBe('Before **word** after');
        await page.screenshot({ path: info.outputPath('nested-container.png') });
    });

    test('table cell formatting and links retain other cells and table identity', async ({ page }, info) => {
        await prepare(page, 'card', [b('table', '', { type: 'table', metadata: { tableRowsVersion: 1, rows: [['Header','Other'],['Before word after','Keep']] } })]);
        const cell = page.locator('[data-block-id="table"] [data-table-row="1"][data-table-column="0"][contenteditable="true"]');
        await select(page, cell, 7, 4); await page.keyboard.press('Control+b');
        await expect.poll(async () => (await blocks(page))[0].metadata?.rows?.[1][0]).toBe('Before **word** after');
        await select(page, cell, 7, 4); await page.keyboard.press('Control+k');
        const input = page.getByRole('textbox', { name: 'Link URL', exact: true });
        await input.fill('https://example.test/table'); await input.press('Enter');
        await expect.poll(async () => (await blocks(page))[0].metadata?.rows?.[1][0]).toBe('Before [**word**](https://example.test/table) after');
        expect((await blocks(page))[0].metadata?.rows).toEqual([['Header','Other'],['Before [**word**](https://example.test/table) after','Keep']]);
        await reload(page); expect((await blocks(page))[0].id).toBe('table');
        await page.screenshot({ path: info.outputPath('table-cell-links.png') });
    });

    test('HTML paste cannot execute handlers or script destinations in the host', async ({ page }, info) => {
        await prepare(page, 'card', [b('line', '')]);
        await edit(page).focus();
        await edit(page).evaluate(host => {
            const data = new DataTransfer();
            data.setData('text/html', '<p><strong>Safe</strong> <a href="javascript:window.__s28Executed=1" onclick="window.__s28Executed=2">Bad</a><img src="https://example.test/x.png" onerror="window.__s28Executed=3"></p>');
            data.setData('text/plain', 'Safe Bad');
            const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
            // Firefox ignores clipboardData in the synthetic constructor.
            // Bind this fixture payload explicitly; native OS paste is separate.
            Object.defineProperty(event, 'clipboardData', { value: data });
            host.dispatchEvent(event);
        });
        await expect.poll(async () => JSON.stringify(await blocks(page))).toContain('Safe');
        expect(await page.evaluate(() => (window as unknown as {__s28Executed?:number}).__s28Executed)).toBeUndefined();
        await expect(nodeById(page, ownerId).locator('script, [onclick], [onerror], a[href^="javascript:"], a[href^="data:"]')).toHaveCount(0);
        await reload(page); expect(JSON.stringify(await blocks(page))).toContain('Safe');
        await page.screenshot({ path: info.outputPath('safe-paste.png') });
    });

    test('inline code displays markdown-looking marks and links literally', async ({ page }) => {
        const literal = '**bold** [site](https://example.test) <img>';
        const source = `Before \`${literal}\` after`;
        await prepare(page, 'card', [b('line', source)]);
        const code = edit(page).locator('code');
        await expect(code).toHaveText(literal);
        await expect(code.locator('strong, em, a, img')).toHaveCount(0);
        await reload(page);
        await activate(page);
        await expect(edit(page).locator('code')).toHaveText(literal);
        expect((await blocks(page))[0].content).toBe(source);
    });

    test('collapsed inline code and Unicode typing preserve an empty document and following text', async ({ page }, info) => {
        await prepare(page, 'card', [b('line', '')]);
        await edit(page).focus();
        await page.keyboard.press('Control+e'); await page.keyboard.insertText('عربي café 😀 a`b');
        await expect.poll(async () => (await blocks(page))[0].content).toContain('عربي café 😀');
        await expect(edit(page)).toHaveText('عربي café 😀 a`b');
        await clickEmptyCanvas(page); await reload(page);
        expect((await blocks(page))[0].content).toBe('``عربي café 😀 a`b``');
        await page.screenshot({ path: info.outputPath('unicode-inline-code.png') });
    });

    test('AI answer citations preview actual sources and navigate across canvases without a live AI request', async ({ page }, info) => {
        await openCanvas(page);
        await seedCanvasState(page, [target('source-parent'), target('source-child', 'source-parent')]);
        await page.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
        // Fixture: a completed answer, not a fabricated provider success.
        await page.evaluate(() => {
            const store = (window as unknown as {__appStore:{getState:()=>{appendAIMessage:(message:unknown)=>void}}}).__appStore.getState();
            store.appendAIMessage({ id:'s28-answer',role:'assistant',intent:'ask',status:'done',steps:[],createdNodeIds:[],at:new Date().toISOString(),
                text:'Evidence [Nested source](chnk://node/source-child). Missing [Old source](chnk://node/deleted-source).' });
        });
        const chip = page.locator('[data-cite-node="source-child"]');
        await expect(chip).toBeVisible(); await chip.hover();
        await expect(page.getByRole('tooltip')).toContainText('Target source-child');
        await page.screenshot({ path: info.outputPath('ai-citation-preview.png') });
        const read = () => page.evaluate(() => {const s=(window as unknown as {__appStore:{getState:()=>{currentParentId:string|null;selectedCanvasNodeIds:Set<string>}}}).__appStore.getState();return {parent:s.currentParentId,selected:[...s.selectedCanvasNodeIds]};});
        const before = await read();
        await page.locator('[data-cite-node="deleted-source"]').click(); expect(await read()).toEqual(before);
        await chip.click(); await expect.poll(read).toEqual({parent:'source-parent',selected:['source-child']});
        await page.getByRole('button', { name: 'Close AI panel', exact: true }).click();
        await expect(nodeById(page,'source-child')).toBeVisible();
        await page.screenshot({ path: info.outputPath('ai-citation-destination.png') });
    });
});
