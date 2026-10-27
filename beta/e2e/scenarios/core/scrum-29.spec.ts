import { test, expect } from '../../support/fixtures';
import type { Page } from '@playwright/test';
import type { Block } from '../../../src/features/editor/types';
import { openCanvas, fitView, nodeById, reload, waitForLocalSave } from '../../support/canvas';
import { readCanvasState, seedCanvasState, type CanvasStateNode } from '../../support/canvasState';

const base: Block[] = [{id:'first',type:'text',content:'Alpha café البداية 😀'}, {id:'last',type:'text',content:'Last paragraph'}];
async function prepare(page: Page, blocks: Block[] = base, kind = 'note', extras: CanvasStateNode[] = []) {
    await openCanvas(page);
    await seedCanvasState(page,[{id:'owner',type:kind,position:{x:100,y:80},style:{width:720,height:500},
        data:{label:'SCRUM-29 editor lifecycle',viewMode:'expanded',content:blocks}},...extras]);
    await fitView(page);
    const node=nodeById(page,'owner');
    const shield=node.locator('.interaction-overlay'); if(await shield.count()) await shield.click();
    await node.locator('[contenteditable="true"], [data-reader-text]').first().click();
    await expect(node.locator('[contenteditable="true"]').first()).toBeVisible();
    return node;
}
const frame=(page: Page,id: string)=>page.locator(`[data-block-id="${id}"]`).first();
const editable=(page: Page,id: string)=>frame(page,id).locator('[contenteditable="true"]').first();
async function content(page: Page,id='owner') {return (await readCanvasState(page))!.nodes.find(node=>node.id===id)!.data!.content as Block[];}
async function focusAt(page: Page,id: string,offset: number) {
    await editable(page,id).click(); await page.keyboard.press('Control+Home');
    for(let i=0;i<offset;i++) await page.keyboard.press('ArrowRight');
}
async function selectBlocks(page: Page,first: string,last=first) {
    await frame(page,first).getByRole('button',{name:'Move block or open menu',exact:true}).first().click();
    if(last!==first) await editable(page,last).click({modifiers:['Shift']});
    await expect(frame(page,first)).toHaveClass(/selected/);
}
// Explicit clipboard adapter contracts. Native Ctrl+C/V is covered separately;
// these deterministic events allow exact hostile HTML and rich-payload inputs.
async function clipboardCopy(page: Page,cut=false) {
    return page.evaluate(cut=>{
        const data=new DataTransfer(); const event=new ClipboardEvent(cut?'cut':'copy',{bubbles:true,cancelable:true});
        // Firefox deliberately empties constructor-supplied synthetic clipboard
        // data. This explicit adapter input is not an OS clipboard assertion.
        Object.defineProperty(event,'clipboardData',{value:data});
        document.activeElement?.dispatchEvent(event);
        return {html:data.getData('text/html'),text:data.getData('text/plain')};
    },cut);
}
async function paste(page: Page,id: string|null,flavours: {html?: string;text?: string}) {
    const target=id?editable(page,id):nodeById(page,'owner').locator('[data-chnk-it-block-editor]').first();
    await target.evaluate((element,flavours)=>{
        const data=new DataTransfer(); data.setData('text/plain',flavours.text??''); data.setData('text/html',flavours.html??'');
        const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true});
        Object.defineProperty(event,'clipboardData',{value:data});
        element.dispatchEvent(event);
    },flavours);
}

test.describe('SCRUM-29 remaining editor contracts',()=>{
    test.beforeAll(async({browser},info)=>console.info(`[SCRUM-29] ${info.project.name}: ${browser.version()}`));
    test.afterEach(async({page},info)=>{
        if(info.status==='passed') {await page.screenshot({path:info.outputPath('result.png')}); await waitForLocalSave(page);}
    });
    for(const kind of ['note','fused-note']) test(`SCRUM-122 ${kind}: formatted selected text splits without duplication and merges at the caret`,async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:'Before **boldword** after'}],kind);
        await focusAt(page,'first',9); // Before bo|ldword
        for(let i=0;i<2;i++) await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Enter');
        const node=nodeById(page,'owner'), editors=node.locator('[contenteditable="true"]');
        await expect(editors).toHaveCount(2); await expect(editors.nth(0)).toHaveText('Before bo'); await expect(editors.nth(1)).toHaveText('word after');
        await page.keyboard.press('Backspace'); await expect(editors).toHaveCount(1);
        await page.keyboard.type('X'); await expect(editors.first()).toHaveText('Before boXword after');
        await expect(editors.first().locator('strong,b').first()).toBeVisible();
        await expect.poll(async()=>(await content(page))[0].content.replaceAll('**','')).toBe('Before boXword after');
    });
    test('SCRUM-122 first/last boundaries, empty heading and forward merge preserve content',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:'A'},{id:'second',type:'text',content:'B'},{id:'empty',type:'heading2',content:''}]);
        await focusAt(page,'first',0); await page.keyboard.press('Backspace'); await expect(editable(page,'first')).toHaveText('A');
        await page.keyboard.press('End'); await page.keyboard.press('Delete'); await expect(editable(page,'first')).toHaveText('AB');
        await focusAt(page,'empty',0); await page.keyboard.press('Backspace'); await expect(frame(page,'empty')).toHaveAttribute('data-block-type','text');
        await page.keyboard.press('Delete'); await page.keyboard.type('C');
        await expect.poll(async()=>(await content(page)).map(block=>block.content)).toEqual(['AB','C']);
    });
    test('SCRUM-123 arrows preserve the visual caret column and skip collapsed descendants',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:'abcdefghij'},
            {id:'toggle',type:'toggle',content:'abcdefghij',metadata:{isCollapsed:true}},
            {id:'hidden',type:'text',content:'Must stay hidden',indent:1}, {id:'last',type:'text',content:'abcdefghij'}]);
        await focusAt(page,'first',4); await page.keyboard.press('ArrowDown'); await page.keyboard.type('X');
        await expect(editable(page,'toggle')).toHaveText('abcdXefghij');
        const desiredX=await page.evaluate(()=>getSelection()!.getRangeAt(0).getBoundingClientRect().x);
        const endX=await editable(page,'last').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect().right;});
        await page.keyboard.press('ArrowDown');
        expect(await editable(page,'last').evaluate(el=>document.activeElement===el)).toBe(true);
        const actualX=await page.evaluate(()=>getSelection()!.getRangeAt(0).getBoundingClientRect().x);
        expect(Math.abs(actualX-Math.min(desiredX,endX))).toBeLessThan(14);
        await page.keyboard.type('Y'); await expect(editable(page,'last')).toContainText('Y');
        expect((await content(page)).find(block=>block.id==='hidden')!.content).toBe('Must stay hidden');
        await page.keyboard.press('ArrowUp'); await page.keyboard.type('Z');
        await expect(editable(page,'toggle')).toContainText('Z');
    });
    test('SCRUM-123 wrapped lines retain native movement before crossing a block boundary',async({page})=>{
        const long='A long line with repeated words '.repeat(12);
        await prepare(page,[{id:'first',type:'text',content:long},{id:'last',type:'text',content:'Next line'}]);
        await editable(page,'first').click(); await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.type('X');
        await expect(editable(page,'first')).toContainText('X'); await expect(editable(page,'last')).toHaveText('Next line');
        await page.keyboard.press('Control+End'); await page.keyboard.press('ArrowDown'); await page.keyboard.type('Y');
        await expect(editable(page,'last')).toContainText('Y');
    });
    for(const [marker,type] of [['# ','heading1'],['## ','heading2'],['### ','heading3'],['- ','bullet'],['1. ','numbered'],['[] ','todo'],['> ','quote'],['>> ','toggle']]) {
        test(`SCRUM-124 marker ${JSON.stringify(marker)} converts and Backspace restores the literal marker`,async({page})=>{
            await prepare(page,[{id:'first',type:'text',content:''}]); await page.keyboard.type(marker);
            await expect(frame(page,'first')).toHaveAttribute('data-block-type',type);
            await page.keyboard.press('Backspace'); await expect(frame(page,'first')).toHaveAttribute('data-block-type','text');
            await page.keyboard.type('literal'); await expect(editable(page,'first')).toHaveText(marker+'literal');
        });
    }
    test('SCRUM-124 slash search cancellation and keyboard selection preserve subsequent typing',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:''}]); await page.keyboard.type('/unfindable-type');
        const menu=page.locator('[class*="slashMenu"]').first(); await expect(menu).toBeVisible();
        const original=await editable(page,'first').innerText();
        await page.keyboard.press('Escape'); await expect(menu).toBeHidden(); await expect(editable(page,'first')).toHaveText(original);
        await page.keyboard.press('Control+a'); await page.keyboard.type('/heading'); await expect(menu).toBeVisible();
        await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
        await expect(frame(page,'first')).toHaveAttribute('data-block-type',/^heading/); await page.keyboard.type('A real heading');
        await expect(editable(page,'first')).toHaveText('A real heading');
    });
    test('SCRUM-126 copying and cutting a collapsed toggle includes its hidden branch',async({page})=>{
        await prepare(page,[{id:'first',type:'toggle',content:'Folded',metadata:{isCollapsed:true}},
            {id:'hidden',type:'text',content:'Hidden café 😀',indent:1},base[1]]);
        await selectBlocks(page,'first'); const copied=await clipboardCopy(page);
        expect(copied.text).toContain('Hidden café 😀');
        const cut=await clipboardCopy(page,true); expect(cut.html).toBeTruthy();
        await expect.poll(async()=>(await content(page)).map(block=>block.id)).toEqual(['last']);
        await editable(page,'last').click(); await page.keyboard.press('End'); await paste(page,'last',cut);
        await expect.poll(async()=>JSON.stringify(await content(page))).toContain('Hidden café 😀');
        const restored=await content(page); expect(restored.filter(block=>block.content==='Hidden café 😀')).toHaveLength(1);
        expect(new Set(restored.map(block=>block.id)).size).toBe(restored.length);
    });
    test('SCRUM-126 document paste after a selected toggle keeps both branches attached to their headers',async({page})=>{
        await prepare(page,[{id:'first',type:'toggle',content:'Folded',metadata:{isCollapsed:true}},{id:'hidden',type:'text',content:'Hidden child',indent:1},base[1]]);
        await selectBlocks(page,'first'); const copied=await clipboardCopy(page); await paste(page,null,copied);
        await expect.poll(async()=>(await content(page)).length).toBe(5);
        const blocks=await content(page);
        expect(blocks.map(block=>[block.type,block.content,block.indent??0])).toEqual([
            ['toggle','Folded',0],['text','Hidden child',1],['toggle','Folded',0],['text','Hidden child',1],['text','Last paragraph',0]]);
        expect(blocks.slice(0,2).map(block=>block.id)).toEqual(['first','hidden']);
    });
    test('SCRUM-127 structured paste inside a toggle body preserves the destination hierarchy',async({page})=>{
        await prepare(page,[{id:'first',type:'toggle',content:'Open'},{id:'body',type:'text',content:'BeforeAfter',indent:1},base[1]]);
        await focusAt(page,'body',6); await paste(page,'body',{html:'<h2>Inserted</h2><p>Body</p>'});
        await expect.poll(async()=>(await content(page)).length).toBe(6);
        expect((await content(page)).map(block=>[block.content,block.indent??0])).toEqual([
            ['Open',0],['Before',1],['Inserted',1],['Body',1],['After',1],['Last paragraph',0]]);
    });
    test('SCRUM-126 nested containers and columns round-trip with independent identities',async({page})=>{
        const fixture:Block[]=[{id:'first',type:'columns',content:'',metadata:{columns:[{id:'col-a',content:[{id:'nested',type:'text',content:'**Nested café 😀**'}]},{id:'col-b',content:[{id:'container',type:'container',content:'',metadata:{blocks:[{id:'deep',type:'todo',content:'Deep',metadata:{checked:true}}]}}]}]}},base[1]];
        await prepare(page,fixture); await selectBlocks(page,'first'); const copied=await clipboardCopy(page);
        await editable(page,'last').click(); await page.keyboard.press('End'); await paste(page,'last',copied);
        await expect.poll(async()=>(await content(page)).filter(block=>block.type==='columns').length).toBe(2);
        const columns=(await content(page)).filter(block=>block.type==='columns');
        expect(columns[1].id).not.toBe(columns[0].id);
        expect(columns[1].metadata!.columns![0].id).not.toBe('col-a');
        expect(columns[1].metadata!.columns![0].content[0].id).not.toBe('nested');
        expect(columns[1].metadata!.columns![0].content[0].content).toBe('**Nested café 😀**');
        expect(columns[1].metadata!.columns![1].content[0].metadata!.blocks![0].metadata!.checked).toBe(true);
        await reload(page); expect((await content(page)).filter(block=>block.type==='columns')).toHaveLength(2);
    });
    test('SCRUM-126 large multilingual structured clipboard survives encoding, decoding and paste',async({page})=>{
        const text='العربية café 😀 漢字 '.repeat(12000);
        await prepare(page,[{id:'first',type:'code',content:text},base[1]]);
        await selectBlocks(page,'first'); const copied=await clipboardCopy(page); expect(copied.text).toContain('漢字');
        await editable(page,'last').click(); await page.keyboard.press('End'); await paste(page,'last',copied);
        await expect.poll(async()=>(await content(page)).filter(block=>block.type==='code').length).toBe(2);
        expect((await content(page)).filter(block=>block.type==='code').map(block=>block.content)).toEqual([text,text]);
    });
    test('SCRUM-126 native Ctrl+C/V copies selected formatted blocks @native-clipboard',async({page,browserName})=>{
        test.skip(browserName==='webkit'&&process.platform==='win32','Windows WebKit 26.5 drops custom native clipboard data; isolated engine probe and real Safari manual validation are required.');
        await prepare(page,[{id:'first',type:'heading2',content:'Native café 😀'},{id:'last',type:'text',content:''}]);
        await selectBlocks(page,'first'); await page.keyboard.press('Control+c');
        await editable(page,'last').click(); await page.keyboard.press('Control+v');
        await expect.poll(async()=>(await content(page)).filter(block=>block.type==='heading2'&&block.content==='Native café 😀').length).toBe(2);
    });
    test('SCRUM-126 a single formatted paragraph pastes as formatting rather than literal markers',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:'**Bold café** and [reference](https://example.test)'},{id:'last',type:'text',content:'BeforeAfter'}]);
        await selectBlocks(page,'first'); const copied=await clipboardCopy(page);
        await focusAt(page,'last',6); await paste(page,'last',copied);
        await expect(editable(page,'last').locator('strong,b')).toHaveText('Bold café');
        await expect(editable(page,'last').locator('a')).toHaveText('reference');
        await expect(editable(page,'last')).toHaveText('BeforeBold café and referenceAfter');
    });
    test('SCRUM-126 nested clipboard selection is owned by its closest editor',async({page})=>{
        await prepare(page,[{id:'first',type:'container',content:'',metadata:{blocks:[{id:'nested',type:'text',content:'Nested only'},{id:'sibling',type:'text',content:'Do not copy sibling'}]}},base[1]]);
        await selectBlocks(page,'first'); await selectBlocks(page,'nested'); const copied=await clipboardCopy(page);
        expect(copied.text).toBe('Nested only');
        await editable(page,'last').click(); await page.keyboard.press('End'); await paste(page,'last',copied);
        await expect(editable(page,'last')).toHaveText('Last paragraphNested only');
    });
    test('SCRUM-127 malformed internal carrier falls back to its visible external text',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:''}]);
        const invalid=btoa(JSON.stringify({v:1,kind:'blocks',blocks:[null]}));
        await paste(page,'first',{html:`<span data-chnkit-clipboard="${invalid}"></span><p>Visible fallback café</p>`});
        await expect(editable(page,'first')).toHaveText('Visible fallback café');
        await expect.poll(async()=>(await content(page))[0].content).toBe('Visible fallback café');
    });
    test('SCRUM-127 external inline formatting remains formatting at the caret',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:'BeforeAfter'}]); await focusAt(page,'first',6);
        await paste(page,'first',{html:'<p><strong>Bold</strong> <em>italic</em> <a href="https://example.test">reference</a></p>'});
        await expect(editable(page,'first').locator('strong,b')).toHaveText('Bold');
        await expect(editable(page,'first').locator('em,i')).toHaveText('italic');
        await expect(editable(page,'first').locator('a')).toHaveText('reference');
        await expect(editable(page,'first')).toHaveText('BeforeBold italic referenceAfter');
    });
    test('SCRUM-127 external HTML headings, nested lists, code, tables and links remain editable',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:''}]);
        await paste(page,'first',{html:'<h2>Title café</h2><ul><li>Outer<ul><li>Inner</li></ul></li></ul><pre><code>const n = 1;\nreturn n;</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>literal | pipe</td><td>\\n</td></tr></table><p><a href="https://example.test">Reference</a></p>'});
        await expect.poll(async()=>(await content(page)).some(block=>block.type==='table')).toBe(true);
        const blocks=await content(page); for(const type of ['heading2','bullet','code','table','link']) expect(blocks.some(block=>block.type===type),type).toBe(true);
        expect(blocks.find(block=>block.content==='Inner')?.indent).toBe(1);
        expect(blocks.find(block=>block.type==='table')?.metadata?.rows).toEqual([['A','B'],['literal | pipe','\\n']]);
        const heading=blocks.find(block=>block.type==='heading2')!; await editable(page,heading.id).click(); await page.keyboard.press('End'); await page.keyboard.type('!');
        await expect.poll(async()=>(await content(page)).find(block=>block.id===heading.id)?.content).toBe('Title café!');
    });
    test('SCRUM-127 hostile HTML stays inert and no executable markup reaches the document',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:''}]);
        await paste(page,'first',{html:'<h2 onclick="window.__pasteExecuted=1">Safe title</h2><script data-paste-probe>window.__pasteExecuted=1</script><iframe srcdoc="<script>parent.__pasteExecuted=1</script>"></iframe><p>Keep <a href="javascript:window.__pasteExecuted=1">label</a></p>'});
        await expect.poll(async()=>JSON.stringify(await content(page))).toContain('Safe title');
        expect(await page.evaluate(()=>(window as Window & {__pasteExecuted?:number}).__pasteExecuted)).toBeUndefined();
        await expect(nodeById(page,'owner').locator('[onclick],script[data-paste-probe],iframe[srcdoc]')).toHaveCount(0);
    });
    test('SCRUM-127 rich paste over formatted selected text preserves both formatted tails',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:'Before **boldword** after'}]);
        await focusAt(page,'first',9); for(let i=0;i<2;i++) await page.keyboard.press('Shift+ArrowRight');
        await paste(page,'first',{html:'<h2>Inserted</h2><p>Body</p>'});
        await expect.poll(async()=>(await content(page)).some(block=>block.type==='heading2')).toBe(true);
        const result=await content(page); expect(result.map(block=>block.content)).toEqual(['Before **bo**','Inserted','Body','**word** after']);
    });
    test('SCRUM-127 markdown blocks and code-area paste retain literal newlines',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:''},{id:'last',type:'code',content:'abcXYZ'}]);
        await paste(page,'first',{text:'# Title\n\n- First\n- Second\n\n```js\nconst x = 1;\n```'});
        await expect.poll(async()=>(await content(page)).some(block=>block.type==='heading1')).toBe(true);
        await focusAt(page,'last',3); for(let i=0;i<3;i++) await page.keyboard.press('Shift+ArrowRight');
        await paste(page,'last',{text:'\n# literal\n- code'});
        await expect.poll(async()=>(await content(page)).find(block=>block.id==='last')?.content).toBe('abc\n# literal\n- code');
        expect((await content(page)).find(block=>block.id==='last')?.type).toBe('code');
    });
    test('SCRUM-128 rich paste is one Undo gesture and selection does not pollute history',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:'BeforeAfter'}]); await focusAt(page,'first',6);
        await paste(page,'first',{html:'<h2>Inserted</h2><p>Body</p>'});
        await expect.poll(async()=>(await content(page)).length).toBe(4);
        await selectBlocks(page,'first'); await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true}).click();
        await expect.poll(async()=>(await content(page)).map(block=>block.content)).toEqual(['BeforeAfter']);
        await page.getByTitle(/^Redo/).first().click();
        await expect.poll(async()=>(await content(page)).map(block=>block.content)).toEqual(['Before','Inserted','Body','After']);
    });
    test('SCRUM-129 immediate editor handoff and reload retain both cards latest edits',async({page})=>{
        await prepare(page,[{id:'first',type:'text',content:'First'}],'note',[{id:'other',type:'note',position:{x:900,y:80},style:{width:620,height:500},data:{label:'Other editor',viewMode:'expanded',content:[{id:'other-text',type:'text',content:'Second'}]}}]);
        await editable(page,'first').click(); await page.keyboard.press('End'); await page.keyboard.type(' latest');
        const other=nodeById(page,'other'),shield=other.locator('.interaction-overlay'); if(await shield.count()) await shield.click();
        await other.locator('[contenteditable="true"],[data-reader-text]').first().click();
        await editable(page,'other-text').click(); await page.keyboard.press('End'); await page.keyboard.type(' latest');
        await reload(page);
        expect((await content(page))[0].content).toBe('First latest'); expect((await content(page,'other'))[0].content).toBe('Second latest');
    });
    test('SCRUM-130 browser composition keeps the host and commits confirmed text once',async({page,browserName})=>{
        test.skip(browserName!=='chromium','Native browser IME injection uses Chromium CDP; OS IME requires separate manual evidence.');
        await prepare(page,[{id:'first',type:'text',content:'Before '}]); await editable(page,'first').click(); await page.keyboard.press('End');
        await editable(page,'first').evaluate(el=>el.setAttribute('data-host-proof','original'));
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.imeSetComposition',{text:'にほん',selectionStart:3,selectionEnd:3});
        await editable(page,'first').dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true});
        await expect(nodeById(page,'owner').locator('[data-block-id]')).toHaveCount(1);
        await expect(editable(page,'first')).toHaveAttribute('data-host-proof','original');
        await cdp.send('Input.insertText',{text:'日本語'});
        await expect.poll(async()=>(await content(page))[0].content).toBe('Before 日本語');
        await expect(editable(page,'first')).toHaveAttribute('data-host-proof','original');
        await cdp.detach();
    });
    test('SCRUM-130 confirmed browser composition survives immediate cross-card handoff and reload',async({page,browserName})=>{
        test.skip(browserName!=='chromium','CDP browser composition; real OS IME and assistive technology are separate manual gates.');
        await prepare(page,[{id:'first',type:'text',content:'Before '}],'note',[{id:'other',type:'note',position:{x:900,y:80},style:{width:620,height:500},data:{label:'Composition handoff',viewMode:'expanded',content:[{id:'other-text',type:'text',content:'Other'}]}}]);
        await editable(page,'first').click(); await page.keyboard.press('End');
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.imeSetComposition',{text:'にほん',selectionStart:3,selectionEnd:3});
        await cdp.send('Input.insertText',{text:'日本語'});
        const other=nodeById(page,'other'); await other.locator('.interaction-overlay').click();
        await other.locator('[contenteditable="true"],[data-reader-text]').first().click();
        await editable(page,'other-text').click(); await page.keyboard.press('End'); await page.keyboard.type(' next');
        await reload(page); expect((await content(page))[0].content).toBe('Before 日本語');
        expect((await content(page,'other'))[0].content).toBe('Other next'); await cdp.detach();
    });
});
