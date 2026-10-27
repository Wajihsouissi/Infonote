import { test, expect } from '../../support/fixtures';
import type { Page } from '@playwright/test';
import { openCanvas, fitView, nodeById, reload, waitForLocalSave } from '../../support/canvas';
import { seedCanvasState, readCanvasState, type CanvasStateNode } from '../../support/canvasState';
import type { Block } from '../../../src/features/editor/types';

const initial: Block[] = [
    { id: 'alpha', type: 'text', content: 'Alpha — البداية café 😀' },
    { id: 'bravo', type: 'text', content: 'Bravo — move blocks without aiming at a tiny gap' },
    { id: 'charlie', type: 'heading2', content: 'Charlie heading' },
    { id: 'delta', type: 'text', content: 'Delta — final paragraph' },
];
async function prepare(page: Page, content = initial, type = 'note', extras: CanvasStateNode[] = []) {
    await openCanvas(page);
    await page.evaluate(() => {
        const events: unknown[]=[];
        (window as Window & {__reorderEvents?:unknown[]}).__reorderEvents=events;
        for(const name of ['dragstart','dragover','drop','dragend']) document.addEventListener(name,e=>{
            const event=e as DragEvent;
            if(events.length<250) events.push({name,id:(event.target as Element).closest('[data-block-id]')?.getAttribute('data-block-id'),y:event.clientY,
                indication:document.querySelector('[data-external-drop-target]')?.getAttribute('data-block-id')});
        },true);
    });
    await seedCanvasState(page, [{ id: 'selection-owner', type, position: { x: 100, y: 80 },
        style: { width: 680, height: 520 }, data: { label: 'Block selection & reorder', viewMode: 'expanded', content } },...extras]);
    const node = nodeById(page, 'selection-owner');
    await expect(node).toBeVisible();
    await fitView(page);
    await page.bringToFront();
    const shield = node.locator('.interaction-overlay');
    await expect(shield).toBeVisible();
    await shield.click();
    await expect(shield).toHaveCount(0);
    await node.locator('[contenteditable="true"], [data-reader-text]').first().click();
    await expect(node.locator('[contenteditable="true"]').first()).toBeVisible();
    return node;
}
const block = (page: Page, id: string) => page.locator(`[data-block-id="${id}"]`).first();
async function startDrag(page: Page, id: string) {
    const source = block(page, id);
    await source.hover();
    const handle = source.locator('[class*="dragHandle"]').first();
    const box = await handle.boundingBox();
    if (!box) throw new Error(`Missing drag handle for ${id}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 4, { steps: 8 });
    await page.waitForFunction(() => (window as Window & { chnkItBlockDragging?: boolean }).chnkItBlockDragging === true);
}
async function over(page: Page, id: string, fraction: number) {
    const box = await block(page, id).boundingBox();
    if (!box) throw new Error(`Missing block ${id}`);
    const point = { x: box.x + box.width * 0.6, y: box.y + box.height * fraction };
    await page.mouse.move(point.x, point.y, { steps: 12 });
    await page.mouse.move(point.x + 1, point.y);
}
async function ids(page: Page) {
    return ((await readCanvasState(page))!.nodes.find(n => n.id === 'selection-owner')!.data!.content as Block[]).map(b => b.id);
}
async function content(page: Page) {
    return (await readCanvasState(page))!.nodes.find(n => n.id === 'selection-owner')!.data!.content as Block[];
}
async function move(page: Page, from: string, to: string, fraction: number) {
    await startDrag(page, from); await over(page, to, fraction); await page.mouse.up();
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('chnk-it-block-dragging'))).toBe(false);
    await expect(page.locator('[data-external-drop-target]')).toHaveCount(0);
}
async function choose(page: Page, names: string[]) {
    const first = block(page, names[0]);
    // Start on the non-editable gutter, then Shift extends the block range.
    await first.getByRole('button',{name:'Move block or open menu',exact:true}).click();
    await expect(first).toHaveClass(/selected/);
    if (names.length > 1) await block(page, names[names.length - 1]).locator('[contenteditable="true"]').click({ modifiers: ['Shift'] });
    await expect(page.locator('[data-block-id][class*="selected"]')).toHaveCount(names.length);
}

test.describe('SCRUM-125 block selection, drag and reorder', () => {
    test.beforeAll(async ({ browser }, info) => console.info(`[SCRUM-125] ${info.project.name}: ${browser.version()}`));
    test.afterEach(async ({ page }, info) => {
        if(info.status!=='passed') await info.attach('native-drag-events',{body:JSON.stringify(await page.evaluate(()=>(window as Window & {__reorderEvents?:unknown[]}).__reorderEvents)),contentType:'application/json'});
        if (info.status === 'passed') {
            await page.screenshot({ path: info.outputPath('result.png') });
            await waitForLocalSave(page);
        }
    });
    test('upper half is a broad drop target with a thin insertion marker', async ({ page }, info) => {
        await prepare(page); await startDrag(page, 'delta'); await over(page, 'bravo', 0.25);
        await page.screenshot({ path: info.outputPath('upper-half-drag.png') });
        const marker = await block(page, 'bravo').evaluate(el => {
            const real = el.querySelector('[data-block-drop-marker]');
            const s = getComputedStyle(real ?? el, real ? undefined : '::before');
            return { height: parseFloat(s.height), pointerEvents: s.pointerEvents };
        });
        await page.mouse.up();
        await expect.poll(() => ids(page)).toEqual(['alpha', 'delta', 'bravo', 'charlie']);
        expect(marker.height).toBeLessThanOrEqual(4);
        expect(marker.pointerEvents).toBe('none');
    });
    for (const type of ['fused-note', 'block']) test(`${type}: broad upper/lower halves preserve IDs and text`, async ({ page }) => {
        await prepare(page, initial, type);
        await move(page, 'delta', 'bravo', 0.2);
        await expect.poll(() => ids(page)).toEqual(['alpha','delta','bravo','charlie']);
        await move(page, 'alpha', 'charlie', 0.8);
        await expect.poll(() => ids(page)).toEqual(['delta','bravo','charlie','alpha']);
        expect((await content(page)).map(b => b.content).sort()).toEqual(initial.map(b => b.content).sort());
    });
    test('lower half persists, Undo and Redo restore the exact order', async ({ page }) => {
        await prepare(page); await move(page, 'alpha', 'charlie', 0.75);
        await expect.poll(() => ids(page)).toEqual(['bravo','charlie','alpha','delta']);
        await page.keyboard.press('Control+z'); await expect.poll(() => ids(page)).toEqual(initial.map(b => b.id));
        await page.keyboard.press('Control+Shift+z'); await expect.poll(() => ids(page)).toEqual(['bravo','charlie','alpha','delta']);
        await reload(page); expect(await ids(page)).toEqual(['bravo','charlie','alpha','delta']);
    });
    test('the gap and the marker itself receive the same insertion', async ({ page }) => {
        await prepare(page); await startDrag(page, 'delta');
        const a = (await block(page, 'alpha').boundingBox())!, b = (await block(page, 'bravo').boundingBox())!;
        await page.mouse.move(b.x + b.width * 0.6, (a.y + a.height + b.y) / 2, { steps: 12 });
        await page.mouse.move(b.x + b.width * 0.6 + 1, (a.y + a.height + b.y) / 2);
        await expect(page.locator('[data-external-drop-target]')).toHaveCount(1);
        await page.mouse.up(); await expect.poll(() => ids(page)).toEqual(['alpha','delta','bravo','charlie']);
    });
    for (const edge of ['before first', 'after last']) test(`empty editor space ${edge} has a truthful target`, async ({ page }, info) => {
        await prepare(page); await startDrag(page, edge === 'before first' ? 'delta' : 'alpha');
        const target = (await block(page, edge === 'before first' ? 'alpha' : 'delta').boundingBox())!;
        const y = edge === 'before first' ? target.y - 5 : target.y + target.height + 50;
        await page.mouse.move(target.x + target.width * 0.7, y, { steps: 12 });
        await page.mouse.move(target.x + target.width * 0.7 + 1, y);
        await page.screenshot({ path: info.outputPath('edge-indicator.png') });
        await page.mouse.up();
        await expect.poll(() => ids(page)).toEqual(edge === 'before first' ? ['delta','alpha','bravo','charlie'] : ['bravo','charlie','delta','alpha']);
    });
    test('a selected range moves as one ordered group and drops onto itself safely', async ({ page }) => {
        await prepare(page); await choose(page, ['alpha','bravo']);
        await move(page, 'alpha', 'bravo', 0.75); expect(await ids(page)).toEqual(initial.map(b => b.id));
        await choose(page, ['alpha','bravo']); await move(page, 'bravo', 'delta', 0.8);
        await expect.poll(() => ids(page)).toEqual(['charlie','delta','alpha','bravo']);
        expect(await content(page)).toEqual([initial[2],initial[3],initial[0],initial[1]]);
    });
    test('Ctrl+A twice selects only this document, Delete and Undo preserve stable identities', async ({ page }) => {
        const node = await prepare(page);
        await node.locator('[contenteditable="true"]').first().click();
        await page.keyboard.press('Control+a'); await page.keyboard.press('Control+a');
        await expect(page.locator('[data-block-id][class*="selected"]')).toHaveCount(4);
        await page.keyboard.press('Delete'); await expect.poll(() => ids(page)).toEqual([]);
        await page.keyboard.press('Control+z'); await expect.poll(() => content(page)).toEqual(initial);
        await reload(page); expect(await content(page)).toEqual(initial);
    });
    test('range deletion and Escape clear selection without losing adjacent blocks', async ({ page }) => {
        await prepare(page); await choose(page, ['bravo','charlie']);
        await page.keyboard.press('Escape'); await expect(page.locator('[data-block-id][class*="selected"]')).toHaveCount(0);
        expect(await content(page)).toEqual(initial);
        await choose(page, ['bravo','charlie']); await page.keyboard.press('Delete');
        await expect.poll(() => ids(page)).toEqual(['alpha','delta']);
        await page.keyboard.press('Control+z'); await expect.poll(() => content(page)).toEqual(initial);
    });
    test('native Escape cancels and a second drag and typing still work', async ({ page }) => {
        await prepare(page); await startDrag(page, 'delta'); await over(page, 'bravo', 0.25);
        await page.keyboard.press('Escape'); await page.mouse.up();
        await expect(page.locator('[data-external-drop-target]')).toHaveCount(0);
        expect(await content(page)).toEqual(initial);
        await move(page, 'delta', 'alpha', 0.2); await expect.poll(() => ids(page)).toEqual(['delta','alpha','bravo','charlie']);
        await block(page, 'delta').locator('[contenteditable="true"]').click();
        await page.keyboard.press('End'); await page.keyboard.type(' typed');
        await expect.poll(async () => (await content(page))[0].content).toBe(initial[3].content + ' typed');
    });
    test('grip is named, keyboard focusable and Alt+arrows reorder without a mouse', async ({ page }) => {
        await prepare(page);
        const grip = block(page, 'bravo').getByRole('button', { name: 'Move block or open menu', exact: true });
        await grip.focus(); await expect(grip).toBeFocused(); await page.keyboard.press('Alt+ArrowUp');
        await expect.poll(() => ids(page)).toEqual(['bravo','alpha','charlie','delta']);
        await page.keyboard.press('Alt+ArrowDown'); await expect.poll(() => ids(page)).toEqual(initial.map(b => b.id));
    });
    for (const collapsed of [true, false]) test(`${collapsed ? 'collapsed' : 'open'} toggle travels with descendants`, async ({ page }) => {
        const fixture: Block[] = [initial[0], { id: 'toggle', type: 'toggle', content: 'Details', metadata: { isCollapsed: collapsed } },
            { id: 'child', type: 'text', content: 'Child محفوظ', indent: 1 }, { id: 'nested-toggle', type: 'toggle', content: 'Nested', indent: 1 },
            { id: 'grandchild', type: 'text', content: 'Grandchild', indent: 2 }, initial[3]];
        await prepare(page, fixture); await move(page, 'toggle', 'delta', 0.8);
        await expect.poll(() => ids(page)).toEqual(['alpha','delta','toggle','child','nested-toggle','grandchild']);
        expect((await content(page)).map(b => [b.id,b.indent ?? 0])).toEqual([['alpha',0],['delta',0],['toggle',0],['child',1],['nested-toggle',1],['grandchild',2]]);
        await reload(page); expect((await content(page)).map(b => b.id)).toEqual(['alpha','delta','toggle','child','nested-toggle','grandchild']);
    });
    test('moving into and out of an open toggle adjusts indentation without dropping text', async ({ page }) => {
        await prepare(page, [initial[0], { id:'toggle',type:'toggle',content:'Details',metadata:{isCollapsed:false} },
            { id:'child',type:'text',content:'Child',indent:1 }, initial[3]]);
        await move(page, 'delta', 'toggle', 0.8);
        await expect.poll(async () => (await content(page)).map(b=>[b.id,b.indent??0])).toEqual([['alpha',0],['toggle',0],['delta',1],['child',1]]);
        await move(page, 'delta', 'alpha', 0.2);
        await expect.poll(async () => (await content(page)).map(b=>[b.id,b.indent??0])).toEqual([['delta',0],['alpha',0],['toggle',0],['child',1]]);
    });
    test('nested editor reorders without activating its container drop target', async ({ page }) => {
        await prepare(page, [initial[0], { id: 'container', type: 'container', content: '', metadata: { blocks: [
            { id:'inner-a',type:'text',content:'Nested Alpha' }, { id:'inner-b',type:'text',content:'Nested Bravo' }] } }, initial[3]]);
        await move(page, 'inner-b', 'inner-a', 0.2);
        await expect.poll(async () => (await content(page))[1].metadata?.blocks?.map(b=>b.id)).toEqual(['inner-b','inner-a']);
        expect(await ids(page)).toEqual(['alpha','container','delta']);
        await reload(page); expect((await content(page))[1].metadata?.blocks?.map(b=>b.id)).toEqual(['inner-b','inner-a']);
    });
    test('nested editor to parent transfers exactly once and remains editable', async ({ page }) => {
        await prepare(page, [initial[0], { id:'container',type:'container',content:'',metadata:{blocks:[
            {id:'inner-a',type:'text',content:'Nested Alpha'}, {id:'inner-b',type:'text',content:'Nested Bravo'}]} }, initial[3]]);
        await move(page, 'inner-b', 'alpha', 0.2);
        await expect.poll(() => ids(page)).toEqual(['inner-b','alpha','container','delta']);
        expect((await content(page))[2].metadata?.blocks?.map(b=>b.id)).toEqual(['inner-a']);
        await block(page,'inner-b').locator('[contenteditable="true"]').click(); await page.keyboard.press('End'); await page.keyboard.type('!');
        await expect.poll(async () => (await content(page))[0].content).toBe('Nested Bravo!');
    });
    test('drag preview moves siblings gently while target geometry stays stable', async ({ page }, info) => {
        await prepare(page);
        const before = await block(page,'bravo').boundingBox(); await startDrag(page,'delta'); await over(page,'bravo',0.2);
        const target = await page.locator('[data-external-drop-target]').getAttribute('data-block-id');
        expect(target).toBe('bravo');
        const point = {x:before!.x+before!.width*0.6,y:before!.y+before!.height*0.2};
        for(let i=0;i<6;i++) await page.mouse.move(point.x+(i%2),point.y);
        await expect(page.locator('[data-external-drop-target]')).toHaveAttribute('data-block-id','bravo');
        expect(await ids(page)).toEqual(initial.map(b=>b.id)); // Preview never writes to storage.
        await expect.poll(()=>block(page,'bravo').evaluate(el=>parseFloat(getComputedStyle(el).translate.split(' ')[1]||'0'))).not.toBe(0);
        // The native ghost carries identity. The original must not paint under
        // an arriving neighbor, even after the later .dragging CSS is applied.
        expect(await block(page,'delta').evaluate(el=>({opacity:getComputedStyle(el).opacity,visibility:getComputedStyle(el).visibility,outline:getComputedStyle(el).outlineStyle})))
            .toEqual({opacity:'0',visibility:'hidden',outline:'none'});
        await page.waitForTimeout(220); // Capture the settled preview, not a transition frame.
        const bravo=await block(page,'bravo').boundingBox(), charlie=await block(page,'charlie').boundingBox();
        expect(charlie!.y).toBeGreaterThanOrEqual(bravo!.y+bravo!.height);
        await page.screenshot({path:info.outputPath('live-reorder-preview.png')});
        await page.mouse.up(); await expect.poll(() => ids(page)).toEqual(['alpha','delta','bravo','charlie']);
        await expect(page.locator('[data-reorder-source]')).toHaveCount(0);
        await expect(page.locator('[data-reorder-preview-item]')).toHaveCount(0);
    });
    test('hover keeps the block and text fixed while the grip fades in', async ({ page }) => {
        await prepare(page);
        const host=block(page,'bravo'), text=host.locator('[contenteditable="true"]');
        await page.mouse.move(12,12);
        const before={block:await host.boundingBox(),text:await text.boundingBox()};
        await host.hover();
        const after={block:await host.boundingBox(),text:await text.boundingBox()};
        expect(after).toEqual(before);
        expect(await host.getByRole('button',{name:'Move block or open menu',exact:true}).evaluate(el=>getComputedStyle(el).transform)).toBe('none');
    });
    test('the opened gap has one centered line and both edges mean the same insertion', async ({ page },info) => {
        await prepare(page); await startDrag(page,'delta'); await over(page,'bravo',0.2);
        const line=page.locator('[data-reorder-insertion-line]');
        await expect(line).toBeVisible();
        await page.waitForTimeout(350); // Let the intent delay and peer slide settle.
        const a=(await block(page,'alpha').boundingBox())!, b=(await block(page,'bravo').boundingBox())!;
        const middle=(a.y+a.height+b.y)/2;
        for (const y of [a.y+a.height+2,b.y-2]) {
            await page.mouse.move(b.x+b.width*0.6,y,{steps:2});
            await page.mouse.move(b.x+b.width*0.6+1,y);
            await expect(page.locator('[data-external-drop-target]')).toHaveCount(1);
            await expect(page.locator('[data-block-drop-marker]:visible')).toHaveCount(0);
            await expect(line).toHaveCount(1);
            const box=(await line.boundingBox())!;
            expect(Math.abs(box.y+box.height/2-middle)).toBeLessThan(2);
            expect(await ids(page)).toEqual(initial.map(item=>item.id));
        }
        await page.screenshot({path:info.outputPath('one-centered-gap-line.png')});
        await page.mouse.up(); await expect.poll(()=>ids(page)).toEqual(['alpha','delta','bravo','charlie']);
        await expect(line).toHaveCount(0);
    });
    test('the actual formatted block follows the pointer without a caption or shadow panel', async ({ page },info) => {
        await prepare(page);
        const source=block(page,'charlie'), before=(await source.boundingBox())!;
        const font=await source.locator('[contenteditable="true"]').evaluate(el=>getComputedStyle(el).fontSize);
        await startDrag(page,'charlie');
        const carried=page.locator('[data-carried-block]');
        await expect(carried).toBeVisible();
        await expect(carried).toHaveText('Charlie heading');
        expect((await carried.boundingBox())!.width).toBeLessThan(before.width);
        expect(await carried.locator('[contenteditable="false"]').first().evaluate(el=>getComputedStyle(el).fontSize)).toBe(font);
        expect(await carried.locator('[data-block-id], [id],button[class*="dragHandle"]').count()).toBe(0);
        expect(await carried.locator(':scope > div').evaluate(el=>({opacity:getComputedStyle(el).opacity,shadow:getComputedStyle(el).boxShadow})))
            .toEqual({opacity:'1',shadow:'none'});
        expect(await carried.locator(':scope > div').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
        const box=(await carried.boundingBox())!;
        await page.mouse.move(before.x+16,before.y-50,{steps:6});
        await expect.poll(async()=>Math.abs((await carried.boundingBox())!.y-box.y)).toBeGreaterThan(20);
        await page.screenshot({path:info.outputPath('actual-block-in-flight.png')});
        await page.keyboard.press('Escape'); await page.mouse.up();
        await expect(carried).toHaveCount(0); expect(await ids(page)).toEqual(initial.map(item=>item.id));
        await startDrag(page,'charlie'); await over(page,'alpha',0.2); await page.mouse.up();
        await expect.poll(()=>ids(page)).toEqual(['charlie','alpha','bravo','delta']);
        await expect(carried).toHaveCount(0);
    });
    test('light theme and reduced motion keep a simple marker and immediate preview', async ({ page },info) => {
        await page.emulateMedia({reducedMotion:'reduce'}); await prepare(page);
        await page.evaluate(()=>document.documentElement.dataset.theme='light');
        await startDrag(page,'delta'); await over(page,'bravo',0.2);
        await expect(page.locator('[data-external-drop-target]')).toHaveCount(1);
        expect(await block(page,'bravo').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
        const marker=block(page,'bravo').locator('[data-block-drop-marker]');
        expect(await marker.evaluate(el=>getComputedStyle(el,'::before').content)).toBe('none');
        await page.screenshot({path:info.outputPath('light-reduced-motion.png')});
        await page.mouse.up(); await expect.poll(()=>ids(page)).toEqual(['alpha','delta','bravo','charlie']);
        expect(await page.locator('[data-reorder-preview-item]').count()).toBe(0);
    });
    test('Ctrl marquee selects a range and shrinks back to an empty selection', async ({ page }) => {
        await prepare(page);
        const first=(await block(page,'alpha').boundingBox())!, third=(await block(page,'charlie').boundingBox())!;
        await page.keyboard.down('Control'); await page.mouse.move(first.x+1,first.y+1); await page.mouse.down();
        await page.mouse.move(third.x+third.width-2,third.y+third.height-2,{steps:14});
        await expect(page.locator('[data-block-id][class*="selected"]')).toHaveCount(3);
        await page.mouse.move(first.x+1,first.y+1,{steps:14});
        await expect(page.locator('[data-block-id][class*="selected"]')).toHaveCount(0);
        await page.mouse.up(); await page.keyboard.up('Control'); expect(await content(page)).toEqual(initial);
    });
    test('parent to nested transfer is one Undo step without duplicate IDs', async ({ page }) => {
        const fixture:Block[]=[initial[0],{id:'container',type:'container',content:'',metadata:{blocks:[{id:'inner-a',type:'text',content:'Nested Alpha'}]}},initial[3]];
        await prepare(page,fixture); await move(page,'delta','inner-a',0.2);
        await expect.poll(()=>ids(page)).toEqual(['alpha','container']);
        expect((await content(page))[1].metadata?.blocks?.map(b=>b.id)).toEqual(['delta','inner-a']);
        await page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true}).click();
        await expect.poll(()=>content(page)).toEqual(fixture);
    });
    test('an ancestor drop into its own nested editor is rejected without data loss', async ({ page }) => {
        const fixture:Block[]=[initial[0],{id:'container',type:'container',content:'',metadata:{blocks:[{id:'inner-a',type:'text',content:'Nested Alpha'}]}},initial[3]];
        await prepare(page,fixture); await move(page,'container','inner-a',0.2);
        expect(await content(page)).toEqual(fixture);
    });
    test('between columns transfers once and preserves both column identities', async ({ page }) => {
        await prepare(page,[{id:'columns',type:'columns',content:'',metadata:{columns:[
            {id:'left',content:[{id:'left-a',type:'text',content:'Left Alpha'},{id:'left-b',type:'text',content:'Left Bravo'}]},
            {id:'right',content:[{id:'right-a',type:'text',content:'Right Alpha'}]},
        ]}}]);
        await move(page,'left-b','right-a',0.2);
        await expect.poll(async()=>(await content(page))[0].metadata?.columns?.map(column=>[column.id,column.content.map(b=>b.id)])).toEqual([
            ['left',['left-a']],['right',['left-b','right-a']],
        ]);
        await reload(page); expect((await content(page))[0].metadata?.columns?.[1].content.map(b=>b.id)).toEqual(['left-b','right-a']);
    });
    test('long mixed document preserves all identities and metadata after a local reorder', async ({ page }) => {
        const fixture:Block[]=Array.from({length:100},(_,i)=>({id:`long-${i}`,type:i%8===0?'heading2':'text',
            content:i%7===0?'':`Paragraph ${i} — مرحبا café 😀 **formatted**`,metadata:{name:`kept-${i}`}}));
        await prepare(page,fixture); await move(page,'long-3','long-1',0.2);
        await expect.poll(async()=>(await ids(page)).slice(0,5)).toEqual(['long-0','long-3','long-1','long-2','long-4']);
        expect((await content(page)).length).toBe(100);
        expect([...await content(page)].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...fixture].sort((a,b)=>a.id.localeCompare(b.id)));
        await reload(page); expect((await content(page)).length).toBe(100);
    });
    test('cross-card native drop targets a reader paragraph without activating its editor', async ({ page }) => {
        await prepare(page,initial,'note',[{id:'reader-target',type:'note',position:{x:900,y:80},style:{width:600,height:520},
            data:{label:'Reader destination',viewMode:'expanded',content:[{id:'reader-a',type:'text',content:'Reader Alpha'},{id:'reader-b',type:'text',content:'Reader Bravo'}]}}]);
        const target=nodeById(page,'reader-target');
        await expect(target.locator('[contenteditable="true"]')).toHaveCount(0);
        await move(page,'delta','reader-b',0.25);
        await expect.poll(()=>ids(page)).toEqual(['alpha','bravo','charlie']);
        await expect.poll(async()=>((await readCanvasState(page))!.nodes.find(n=>n.id==='reader-target')!.data!.content as Block[]).map(b=>b.id)).toEqual(['reader-a','delta','reader-b']);
        await reload(page); expect((await content(page)).length).toBe(3);
    });
    test('keyboard toggle movement and selected deletion carry the hidden branch', async ({ page }) => {
        const fixture:Block[]=[initial[0],{id:'toggle',type:'toggle',content:'Details',metadata:{isCollapsed:true}},
            {id:'child',type:'text',content:'Hidden retained text',indent:1},initial[3]];
        await prepare(page,fixture); await block(page,'toggle').locator('[contenteditable="true"]').click();
        await page.keyboard.press('Control+Shift+ArrowDown');
        await expect.poll(()=>ids(page)).toEqual(['alpha','delta','toggle','child']);
        await block(page,'toggle').getByRole('button',{name:'Move block or open menu',exact:true}).click();
        await page.keyboard.press('Delete'); await expect.poll(()=>ids(page)).toEqual(['alpha','delta']);
        await page.keyboard.press('Control+z'); await expect.poll(()=>ids(page)).toEqual(['alpha','delta','toggle','child']);
    });
});
