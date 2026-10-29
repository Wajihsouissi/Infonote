import { test, expect } from '../../support/fixtures';
import type { Locator, Page } from '@playwright/test';
import { clickEmptyCanvas, fitView, nodeById, openCanvas, reload, waitForLocalSave } from '../../support/canvas';
import { readCanvasState, seedCanvasState, type CanvasStateNode } from '../../support/canvasState';
import type { Block } from '../../../src/features/editor/types';

type Surface = 'card' | 'fused-note' | 'canvas';
const surfaces: Surface[] = ['card', 'fused-note', 'canvas'];
const block = (id: string, type: Block['type'], content = '', extra: Partial<Block> = {}): Block => ({ id, type, content, ...extra });
const types = [
    ['text', 'Text'], ['heading1', 'Heading 1'], ['heading2', 'Heading 2'], ['heading3', 'Heading 3'],
    ['bullet', 'Bullet List'], ['numbered', 'Numbered List'], ['todo', 'To-do List'], ['toggle', 'Toggle List'],
    ['callout', 'Callout'], ['quote', 'Quote'], ['code', 'Code'], ['divider', 'Divider'], ['color', 'Color Block'],
] as const;

async function activate(node: Locator) {
    const shield = node.locator('.interaction-overlay');
    if (await shield.count()) await shield.click();
    else if (!await node.locator('[contenteditable="true"]').count()) await node.click({ position: { x: 30, y: 15 } });
    return node;
}

async function prepare(page: Page, surface: Surface, content: Block[]) {
    await openCanvas(page);
    const groups: Block[][] = [];
    if (surface === 'canvas') {
        for (const item of content) {
            if ((item.indent ?? 0) > 0 && groups.length) groups.at(-1)!.push(item);
            else groups.push([item]);
        }
    } else groups.push(content);
    const nodes: CanvasStateNode[] = groups.map((content, i) => ({
        id: `s27-${i}`, type: surface === 'card' ? 'note' : surface === 'canvas' ? 'block' : 'fused-note',
        position: { x: 100, y: 80 + i * 160 }, style: { width: 600, height: surface === 'canvas' ? 100 : 520 },
        data: { label: 'SCRUM-27 document', viewMode: 'expanded', content, isStandaloneBlock: surface === 'canvas' },
    }));
    await seedCanvasState(page, nodes);
    await fitView(page);
    await activate(nodeById(page, 's27-0'));
    return nodeById(page, 's27-0');
}

const item = (page: Page, id: string) => page.locator(`[data-block-id="${id}"]`);
const editable = (page: Page, id: string) => item(page, id).locator('[contenteditable="true"]').first();
async function stored(page: Page): Promise<Block[]> {
    return (await readCanvasState(page))!.nodes.flatMap(n => Array.isArray(n.data?.content) ? n.data.content as Block[] : []);
}
async function saved(page: Page, predicate: (blocks: Block[]) => boolean) {
    await expect.poll(async () => predicate(await stored(page))).toBe(true);
    return stored(page);
}
async function turnInto(page: Page, id: string, label: string) {
    await editable(page, id).focus();
    await page.keyboard.press('Control+/');
    const menu = page.locator('.block-menu').first();
    await expect(menu).toBeVisible();
    await menu.getByText('Turn into', { exact: true }).hover();
    await page.locator('.block-menu').last().getByText(label, { exact: true }).click();
}

test.describe('SCRUM-27 text and structural blocks', () => {
    test.beforeAll(async ({ browser }, info) => console.info(`[SCRUM-27 browser] ${info.project.name}: ${browser.version()}`));
    test.afterEach(async ({ page, browserName }, info) => {
        if (browserName === 'firefox' && info.status === 'passed') {
            await waitForLocalSave(page);
            await page.goto('about:blank', { waitUntil: 'commit', timeout: 10_000 });
        }
    });

    for (const surface of surfaces) {
        test(`${surface}: all 13 menu types can be created and retained locally`, async ({ page }, info) => {
            test.setTimeout(120_000);
            if (surface === 'canvas') {
                await openCanvas(page);
                await seedCanvasState(page, []);
                for (const [type, label] of types) {
                    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 25, y: 180 } });
                    const menu = page.locator('[data-app-menu="canvas-context"]');
                    await menu.getByRole('button', { name: 'Add Block', exact: true }).click();
                    await menu.getByRole('button', { name: label, exact: true }).click();
                    await saved(page, b => b.some(b => b.type === type));
                }
            } else {
                await prepare(page, surface, types.map((_, i) => block(`slot-${i}`, 'text')));
                for (const [i, [type, label]] of types.entries()) {
                    await editable(page, `slot-${i}`).fill('/');
                    await page.getByRole('textbox', { name: 'Search blocks' }).fill(label);
                    await page.getByRole('listbox', { name: 'Blocks' }).getByText(label, { exact: true }).click();
                    await expect(item(page, `slot-${i}`)).toHaveAttribute('data-block-type', type);
                    if (!['divider', 'color'].includes(type)) await editable(page, `slot-${i}`).fill(`${label} — عربي café 😀`);
                }
            }
            await clickEmptyCanvas(page);
            await saved(page, b => types.every(([type]) => b.some(b => b.type === type)));
            await reload(page);
            const persisted = await stored(page);
            expect(types.every(([type]) => persisted.some(b => b.type === type))).toBe(true);
            await page.screenshot({ path: info.outputPath(`${surface}-type-creation.png`) });
        });

        test(`${surface}: Unicode paragraphs and empty editing never duplicate placeholders`, async ({ page }, info) => {
            await prepare(page, surface, [block('paragraph', 'text')]);
            const text = 'مرحبا بتونس — café 中文 😀 ' + 'Readable long text '.repeat(24);
            await editable(page, 'paragraph').fill(text);
            await saved(page, b => b[0]?.content === text);
            await editable(page, 'paragraph').fill('');
            await saved(page, b => b.length === 1 && b[0].content === '');
            await editable(page, 'paragraph').fill(text);
            await reload(page);
            expect((await stored(page))[0].content).toBe(text);
            await page.screenshot({ path: info.outputPath(`${surface}-unicode-paragraph.png`) });
        });

        test(`${surface}: heading conversion keeps exact text and identity; toggle heading keeps its level`, async ({ page }, info) => {
            await prepare(page, surface, [block('heading', 'heading1', 'عنوان café 😀')]);
            await expect(item(page, 'heading').getByRole('heading', { level: 1 })).toBeVisible();
            for (const level of [2, 3]) {
                await turnInto(page, 'heading', `Heading ${level}`);
                await saved(page, b => b[0].id === 'heading' && b[0].type === `heading${level}` && b[0].content === 'عنوان café 😀');
                await expect(item(page, 'heading').getByRole('heading', { level })).toBeVisible();
            }
            await editable(page, 'heading').focus();
            await page.keyboard.press('Control+/');
            await page.locator('.block-menu').getByText('Toggle Header', { exact: true }).click();
            await saved(page, b => b[0].type === 'toggle' && b[0].metadata?.toggleHeaderLevel === 3);
            await expect(item(page, 'heading').getByRole('heading', { level: 3 })).toBeVisible();
            await reload(page);
            expect((await stored(page))[0]).toMatchObject({ id: 'heading', content: 'عنوان café 😀', metadata: { toggleHeaderLevel: 3 } });
            await expect(page.getByRole('heading', { name: 'عنوان café 😀', level: 3 })).toBeVisible();
            await page.screenshot({ path: info.outputPath(`${surface}-toggle-heading.png`) });
        });

        test(`${surface}: todo check and text remain independent through reopening and reload`, async ({ page }, info) => {
            const node = await prepare(page, surface, [block('task', 'todo', 'Acheter du lait — حليب')]);
            const check = item(page, 'task').getByRole('checkbox');
            await expect(check).toHaveAccessibleName(/.+/);
            await check.check();
            await editable(page, 'task').fill('Updated task — حليب');
            await saved(page, b => b[0].content === 'Updated task — حليب' && b[0].metadata?.checked === true);
            await check.uncheck();
            await check.check();
            await clickEmptyCanvas(page);
            await activate(node);
            await expect(item(page, 'task').getByRole('checkbox')).toBeChecked();
            await reload(page);
            expect((await stored(page))[0].metadata?.checked).toBe(true);
            await expect(page.getByRole('checkbox', { name: 'Updated task — حليب', exact: true })).toBeChecked();
            await page.screenshot({ path: info.outputPath(`${surface}-todo.png`) });
        });

        test(`${surface}: toggles own only their descendants and work from the keyboard`, async ({ page }, info) => {
            await prepare(page, surface, [
                block('toggle-a', 'toggle', 'Closed section', { metadata: { isCollapsed: true } }),
                block('child-a', 'text', 'First child', { indent: 1 }),
                block('toggle-b', 'toggle', 'Open sibling', { metadata: { isCollapsed: false } }),
                block('child-b', 'text', 'Sibling child', { indent: 1 }),
            ]);
            await expect(page.getByText('First child', { exact: true })).toHaveCount(0);
            await expect(page.getByText('Sibling child', { exact: true })).toBeVisible();
            const first = item(page, 'toggle-a').getByRole('button', { name: 'Expand toggle' });
            await first.focus();
            await expect(first).toBeFocused();
            await page.keyboard.press('Enter');
            await expect(page.getByText('First child', { exact: true })).toBeVisible();
            await expect(page.getByText('Sibling child', { exact: true })).toBeVisible();
            if (surface === 'canvas') await activate(nodeById(page, 's27-1'));
            const second = item(page, 'toggle-b').getByRole('button', { name: 'Collapse toggle' });
            await second.focus();
            await page.keyboard.press('Space');
            await expect(page.getByText('Sibling child', { exact: true })).toHaveCount(0);
            await expect(page.getByText('First child', { exact: true })).toBeVisible();
            await reload(page);
            expect((await stored(page)).find(b => b.id === 'toggle-b')?.metadata?.isCollapsed).toBe(true);
            await page.screenshot({ path: info.outputPath(`${surface}-toggle-siblings.png`) });
        });

        test(`${surface}: callout edits retain style and conversion retains text`, async ({ page }, info) => {
            await prepare(page, surface, [block('callout', 'callout', 'Important', { metadata: { icon: 'Lightbulb', backgroundColor: '#334455', textColor: '#ffffff' } })]);
            await expect(item(page, 'callout').getByRole('button', { name: 'Change callout icon' })).toBeVisible();
            await expect(item(page, 'callout').getByRole('button', { name: 'Change callout icon' }).locator('svg path').first()).toBeAttached();
            await editable(page, 'callout').fill('Important — مهم');
            await saved(page, b => b[0].content === 'Important — مهم' && b[0].metadata?.backgroundColor === '#334455');
            await page.screenshot({ path: info.outputPath(`${surface}-callout.png`) });
            await reload(page);
            expect((await stored(page))[0]).toMatchObject({ type: 'callout', content: 'Important — مهم', metadata: { icon: 'Lightbulb', backgroundColor: '#334455', textColor: '#ffffff' } });
            await activate(nodeById(page, 's27-0'));
            await expect(item(page, 'callout').locator('[class*="calloutWrapper"]')).toHaveCSS('background-color', 'rgb(51, 68, 85)');
            await turnInto(page, 'callout', 'Text');
            await reload(page);
            expect((await stored(page))[0]).toMatchObject({ id: 'callout', type: 'text', content: 'Important — مهم' });
        });

        test(`${surface}: code preserves literal spaces, symbols, newlines and line outdent`, async ({ page, context, browserName }, info) => {
            await prepare(page, surface, [block('code', 'code')]);
            await expect(editable(page, 'code')).toHaveCSS('text-align', 'left');
            const code = '  const html = "<script>window.__s27Executed = 1</script>";\n\t**literal** & <tag>\n';
            await editable(page, 'code').fill(code);
            console.info('[SCRUM-27 code DOM]', JSON.stringify(await editable(page, 'code').evaluate(el => ({ html: el.innerHTML, text: el.textContent, innerText: (el as HTMLElement).innerText }))));
            await expect.poll(async () => (await stored(page))[0].content).toBe(code);
            expect(await page.evaluate(() => (window as unknown as { __s27Executed?: unknown }).__s27Executed)).toBeUndefined();
            await reload(page);
            expect((await stored(page))[0].content).toBe(code);
            await activate(nodeById(page, 's27-0'));
            // Create the editable final line with a real Enter. Firefox Ctrl+End
            // after protocol fill stops before a terminal text-node newline.
            await editable(page, 'code').fill(code.slice(0, -1));
            await editable(page, 'code').press('Control+End');
            await page.keyboard.press('Enter');
            await expect.poll(async () => (await stored(page))[0].content).toBe(code);
            await page.keyboard.press('Tab');
            await page.keyboard.type('next');
            await page.keyboard.press('Shift+Tab');
            await expect.poll(async () => (await stored(page))[0].content).toBe(code + 'next');
            await item(page, 'code').getByRole('combobox', { name: 'Code language' }).selectOption('javascript');
            expect(await page.evaluate(() => (window as unknown as { __s27Executed?: unknown }).__s27Executed)).toBeUndefined();
            if (browserName === 'chromium') {
                await context.grantPermissions(['clipboard-read', 'clipboard-write']);
                await item(page, 'code').getByRole('button', { name: 'Copy code' }).click();
                expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(code + 'next');
            }
            await reload(page);
            expect((await stored(page))[0]).toMatchObject({ content: code + 'next', metadata: { language: 'javascript' } });
            expect(await page.evaluate(() => (window as unknown as { __s27Executed?: unknown }).__s27Executed)).toBeUndefined();
            await page.screenshot({ path: info.outputPath(`${surface}-literal-code.png`) });
        });

        test(`${surface}: quoted HTML paste remains inert and retains readable text`, async ({ page }, info) => {
            await prepare(page, surface, [block('quote', 'quote')]);
            await editable(page, 'quote').focus();
            await editable(page, 'quote').evaluate(el => {
                const event = new Event('paste', { bubbles: true, cancelable: true });
                Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html'
                    ? '<blockquote><p>Quoted café</p><p>عربي</p><img src=x onerror="window.__s27Executed=1"><script>window.__s27Executed=1</script></blockquote>' : 'Quoted café\nعربي' } });
                el.dispatchEvent(event);
            });
            await saved(page, b => b.some(b => b.content.includes('Quoted café')) && b.some(b => b.content.includes('عربي')));
            expect(await page.evaluate(() => (window as unknown as { __s27Executed?: unknown }).__s27Executed)).toBeUndefined();
            await reload(page);
            expect(JSON.stringify(await stored(page))).toContain('Quoted café');
            expect(await page.locator('[data-block-id] script, [data-block-id] [onerror]').count()).toBe(0);
            await page.screenshot({ path: info.outputPath(`${surface}-quote-paste.png`) });
        });

        test(`${surface}: color accepts a valid hex and rejects invalid input without losing the last value`, async ({ page }, info) => {
            const node = await prepare(page, surface, [block('color', 'color', '#336699', { metadata: { name: 'Original blue' } })]);
            const opener = surface === 'canvas' ? node.getByTitle('Edit color', { exact: true }) : item(page, 'color').getByTitle('Original blue');
            await expect(node.getByRole('button', { name: 'Edit color', exact: true })).toHaveCount(1);
            await opener.focus();
            await page.keyboard.press('Enter');
            const dialog = page.getByRole('dialog', { name: 'Edit color' });
            await expect(dialog).toBeVisible();
            const colorName = dialog.getByRole('textbox', { name: 'Color name', exact: true });
            await expect(colorName).toBeFocused();
            await page.keyboard.press('Shift+Tab');
            await expect(dialog.getByRole('button', { name: /^HSL/ })).toBeFocused();
            await page.keyboard.press('Tab');
            await expect(colorName).toBeFocused();
            const hex = dialog.getByRole('textbox', { name: 'HEX color' });
            await hex.fill('#abc');
            await saved(page, b => b[0].content === '#AABBCC');
            await hex.fill('#not-a-color');
            expect((await stored(page))[0].content).toBe('#AABBCC');
            await expect(hex).toHaveAttribute('aria-invalid', 'true');
            for (const label of ['HEX', 'RGBA', 'HSL']) {
                const icon = dialog.getByRole('button', { name: new RegExp(`^${label}`) }).locator('svg');
                expect(await icon.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(12);
            }
            await page.screenshot({ path: info.outputPath(`${surface}-color-invalid.png`) });
            await hex.fill('#112233');
            await dialog.getByRole('combobox', { name: 'Color format' }).selectOption('rgb');
            await dialog.getByRole('textbox', { name: 'Red', exact: true }).fill('12');
            await saved(page, b => b[0].content === '#0C2233');
            await dialog.getByRole('combobox', { name: 'Color format' }).selectOption('hsl');
            await dialog.getByRole('textbox', { name: 'Hue', exact: true }).fill('120');
            await dialog.getByRole('textbox', { name: 'Saturation', exact: true }).fill('100');
            await dialog.getByRole('textbox', { name: 'Lightness', exact: true }).fill('50');
            await saved(page, b => b[0].content === '#00FF00');
            await dialog.getByRole('combobox', { name: 'Color format' }).selectOption('hex');
            await hex.fill('#112233');
            await colorName.fill('Custom multilingual — لون');
            await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => Promise.reject(new Error('Denied for this fixture')) }));
            await dialog.getByRole('button', { name: /^HEX/ }).click();
            await expect(dialog.getByRole('status')).toContainText('Copy failed');
            await page.screenshot({ path: info.outputPath(`${surface}-color-permission-guidance.png`) });
            await page.keyboard.press('Escape');
            await expect(dialog).toHaveCount(0);
            await expect(page.getByRole('button', { name: 'Edit color', exact: true })).toBeFocused();
            await reload(page);
            expect((await stored(page))[0]).toMatchObject({ content: '#112233', metadata: { name: 'Custom multilingual — لون' } });
            await page.screenshot({ path: info.outputPath(`${surface}-color.png`) });
        });

        test(`${surface}: divider conversion gives the next typing a visible editable home`, async ({ page }, info) => {
            await prepare(page, surface, [block('divider-source', 'text')]);
            await editable(page, 'divider-source').focus();
            await page.keyboard.type('---');
            await saved(page, b => b.some(b => b.id === 'divider-source' && b.type === 'divider'));
            await expect(page.locator('[data-block-type="divider"]')).toBeVisible();
            await expect(page.locator('[contenteditable="true"]:focus')).toBeVisible();
            await page.keyboard.type('After divider — next');
            await saved(page, blocks => blocks.some(b => b.type === 'text' && b.content === 'After divider — next'));
            await reload(page);
            expect((await stored(page)).filter(b => b.type === 'divider')).toHaveLength(1);
            await page.screenshot({ path: info.outputPath(`${surface}-divider-continuation.png`) });
        });

        if (surface !== 'canvas') test(`${surface}: heading split/merge and nested bullet keyboard operations preserve all text`, async ({ page }, info) => {
            await prepare(page, surface, [block('split', 'heading1', 'HelloWorld')]);
            await editable(page, 'split').press('End');
            for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
            await page.keyboard.press('Enter');
            await saved(page, b => b.length === 2 && b[0].content === 'Hello' && b[1].content === 'World');
            await page.keyboard.press('Backspace');
            await saved(page, b => b.length === 1 && b[0].content === 'HelloWorld');
            await turnInto(page, 'split', 'Text');
            await editable(page, 'split').fill('');
            await page.keyboard.type('* Parent');
            await page.keyboard.press('Enter');
            await page.keyboard.type('Child');
            await page.keyboard.press('Tab');
            await page.keyboard.press('Enter');
            await page.keyboard.press('Shift+Tab');
            await page.keyboard.type('Sibling');
            await saved(page, b => b.length === 3 && b[1].indent === 1 && b[2].indent === 0);
            await page.keyboard.press('Control+Shift+ArrowUp');
            await saved(page, b => b.map(x => x.content).join('|') === 'Parent|Sibling|Child');
            const childId = (await stored(page)).find(b => b.content === 'Child')!.id;
            await editable(page, childId).press('Home');
            await page.keyboard.press('Backspace');
            await saved(page, b => b.length === 3 && b[2].content === 'Child' && b[2].indent === 0);
            await page.keyboard.press('Backspace');
            await saved(page, b => b.length === 2 && b[1].content === 'SiblingChild');
            await page.keyboard.press('Enter');
            await saved(page, b => b.map(x => x.content).join('|') === 'Parent|Sibling|Child');
            await reload(page);
            expect((await stored(page)).map(b => b.content)).toEqual(['Parent', 'Sibling', 'Child']);
            await page.screenshot({ path: info.outputPath(`${surface}-nested-list-reorder.png`) });
        });

        test(`${surface}: numbered ordinals survive unrelated edits`, async ({ page }, info) => {
            await prepare(page, surface, [block('one', 'numbered', 'One'), block('two', 'numbered', 'Two'), block('three', 'numbered', 'Three')]);
            await expect(page.locator('[class*="listNumber"]')).toHaveText(['1.', '2.', '3.']);
            await editable(page, 'one').fill('One edited');
            await expect(page.locator('[class*="listNumber"]')).toHaveText(['1.', '2.', '3.']);
            if (surface !== 'canvas') {
                await editable(page, 'three').focus();
                await page.keyboard.press('Control+Shift+ArrowUp');
                await saved(page, b => b.map(x => x.id).join('|') === 'one|three|two');
                await expect(page.locator('[class*="listNumber"]')).toHaveText(['1.', '2.', '3.']);
            }
            await reload(page);
            expect((await stored(page)).map(b => b.content)).toEqual(surface === 'canvas' ? ['One edited', 'Two', 'Three'] : ['One edited', 'Three', 'Two']);
            await page.screenshot({ path: info.outputPath(`${surface}-numbered-list.png`) });
        });
    }

    test('canvas: rich paste replaces selection without losing surrounding text and is one Undo gesture', async ({ page }, info) => {
        await prepare(page, 'canvas', [block('paste-source', 'text', 'Before SELECT After')]);
        await editable(page, 'paste-source').press('Home');
        for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
        for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
        expect(await page.evaluate(() => getSelection()?.toString())).toBe('SELECT');
        await editable(page, 'paste-source').evaluate(el => {
            const event = new Event('paste', { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html'
                ? '<h2>Inserted heading</h2><p>Inserted paragraph</p>' : 'Inserted heading\nInserted paragraph' } });
            el.dispatchEvent(event);
        });
        const expected = ['Before ', 'Inserted heading', 'Inserted paragraph', ' After'];
        await saved(page, b => b.length === 4 && b.map(x => x.content).join('|') === expected.join('|'));
        expect((await stored(page)).map(b => b.type)).toEqual(['text', 'heading2', 'text', 'text']);
        await clickEmptyCanvas(page);
        await page.keyboard.press('Control+z');
        await saved(page, b => b.length === 1 && b[0].id === 'paste-source' && b[0].content === 'Before SELECT After');
        await page.keyboard.press('Control+y');
        await saved(page, b => b.length === 4 && b.map(x => x.content).join('|') === expected.join('|'));
        await reload(page);
        expect((await stored(page)).map(b => b.content)).toEqual(expected);
        await fitView(page);
        await page.screenshot({ path: info.outputPath('canvas-selection-paste-history.png') });
    });

    for (const surface of ['card', 'fused-note'] as const) test(`${surface}: outline follows heading hierarchy and excludes divider text`, async ({ page }, info) => {
        await prepare(page, surface, [
            block('outline-one', 'heading1', 'Outline chapter'),
            block('outline-two', 'heading2', 'Outline section'),
            block('outline-three', 'heading3', 'Outline detail'),
            block('outline-toggle', 'toggle', 'Outline sibling section', { metadata: { toggleHeaderLevel: 2 } }),
            block('outline-after', 'heading3', 'Outline sibling detail'),
            block('outline-divider', 'divider', 'Hidden obsolete divider text'),
        ]);
        await page.getByRole('button', { name: 'Open Outline', exact: true }).click();
        const panel = page.locator('[class*="panelOpen"]').filter({ has: page.getByPlaceholder('Search outline...') });
        const row = (label: string) => panel.locator('[class*="nodeRow"]').filter({ has: page.getByText(label, { exact: true }) });
        for (const label of ['Outline chapter', 'Outline section', 'Outline detail', 'Outline sibling section', 'Outline sibling detail']) await expect(row(label)).toBeVisible();
        const depth = async (label: string) => row(label).evaluate(el => Number.parseFloat(getComputedStyle(el).paddingLeft));
        expect(await depth('Outline section')).toBeGreaterThan(await depth('Outline chapter'));
        expect(await depth('Outline detail')).toBeGreaterThan(await depth('Outline section'));
        expect(await depth('Outline sibling section')).toBe(await depth('Outline section'));
        expect(await depth('Outline sibling detail')).toBe(await depth('Outline detail'));
        await expect(panel.getByText('Hidden obsolete divider text', { exact: true })).toHaveCount(0);
        await page.screenshot({ path: info.outputPath(`${surface}-outline-hierarchy.png`) });
    });

    test('canvas: numbered lists ignore hidden nodes in another canvas', async ({ page }) => {
        await openCanvas(page);
        const make = (id: string, y: number, parentId?: string): CanvasStateNode => ({ id, type: 'block', parentId, position: { x: 100, y }, data: { content: [block(id + '-item', 'numbered', id)], isStandaloneBlock: true } });
        await seedCanvasState(page, [make('first', 200), make('second', 400),
            { id: 'parent', type: 'note', position: { x: 1600, y: 0 }, data: { label: 'Other canvas', content: [] } }, make('hidden', 0, 'parent')]);
        await fitView(page);
        await expect(nodeById(page, 'first').locator('[class*="listNumber"]')).toHaveText('1.');
        await expect(nodeById(page, 'second').locator('[class*="listNumber"]')).toHaveText('2.');
    });
});
