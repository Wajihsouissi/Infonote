import {test,expect} from '../../support/fixtures';
import type {Page} from '@playwright/test';
import type {Block} from '../../../src/features/editor/types';
import {openCanvas,fitView,nodeById,waitForLocalSave} from '../../support/canvas';
import {seedCanvasState,readCanvasState} from '../../support/canvasState';

const original:Block[]=[{id:'a',type:'text',content:'First café'},
    {id:'toggle',type:'toggle',content:'Folded',metadata:{isCollapsed:true}},
    {id:'hidden',type:'text',content:'Hidden 😀',indent:1},{id:'last',type:'text',content:'Keep last'}];
type Probe={allowed:boolean;done:boolean;attempts:number;text:string;html:string;release?:()=>void};
async function setup(page:Page,allowed:boolean,hold=false,blocks=original,kind='note'){
    await page.addInitScript(({allowed,hold})=>{
        const state:Probe={allowed,done:false,attempts:0,text:'',html:''};
        (window as Window&{__clipboardSafety?:Probe}).__clipboardSafety=state;
        class TestItem {
            items:Record<string,Blob>;
            constructor(items:Record<string,Blob>){this.items=items;}
            getType(type:string){return Promise.resolve(this.items[type]);}
        }
        Object.defineProperty(window,'ClipboardItem',{configurable:true,value:TestItem});
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
            write:async(items:TestItem[])=>{state.attempts++;if(hold)await new Promise<void>(resolve=>{state.release=resolve;});if(!state.allowed)throw new DOMException('Denied for this synthetic permission case','NotAllowedError');
                state.text=await(await items[0].getType('text/plain')).text();state.html=await(await items[0].getType('text/html')).text();state.done=true;},
            writeText:async()=>{state.done=true;throw new DOMException('Denied for this synthetic permission case','NotAllowedError');},
        }});
    },{allowed,hold});
    await openCanvas(page);await seedCanvasState(page,[{id:'owner',type:kind,position:{x:100,y:80},style:{width:720,height:500},data:{label:'Clipboard permission safety',viewMode:'expanded',content:blocks}}]);
    const node=nodeById(page,'owner');await expect(node).toBeVisible();
    await fitView(page);await page.bringToFront();await node.locator('.interaction-overlay').click();await node.locator('[contenteditable="true"],[data-reader-text]').first().click();
    await page.locator('[data-block-id="a"]').getByRole('button',{name:'Move block or open menu',exact:true}).click();
    await page.locator('[data-block-id="toggle"] [contenteditable="true"]').click({modifiers:['Shift']});
    const controls=page.getByRole('toolbar',{name:'Selected blocks',exact:true});await expect(controls).toBeInViewport();await controls.hover();
    return controls.getByTitle('Cut',{exact:true});
}
async function content(page:Page){return(await readCanvasState(page))!.nodes.find(node=>node.id==='owner')!.data!.content as Block[];}
const probe=(page:Page)=>page.evaluate(()=>{const {allowed,done,attempts,text,html}=(window as unknown as {__clipboardSafety:Probe}).__clipboardSafety;return{allowed,done,attempts,text,html};});

test.describe('SCRUM-29 clipboard permission safety',()=>{
    test.afterEach(async({page},info)=>{if(info.status==='passed'){await page.screenshot({path:info.outputPath('result.png')});await waitForLocalSave(page);}});
    test('SCRUM-126 denied toolbar clipboard write keeps the selected branch and all text',async({page})=>{
        const cut=await setup(page,false);await cut.click();await expect.poll(async()=>(await probe(page)).done).toBe(true);
        await page.waitForTimeout(100);expect(await content(page)).toEqual(original);await expect(page.getByText('2 Blocks Selected',{exact:true})).toBeVisible();
    });
    test('SCRUM-126 accepted toolbar cut writes rich branch content and Undo restores exact identities',async({page})=>{
        const cut=await setup(page,true);await cut.click();await expect.poll(async()=>(await content(page)).map(block=>block.id)).toEqual(['last']);
        const copied=await probe(page);expect(copied.text).toContain('Hidden 😀');expect(copied.html).toContain('data-chnkit-clipboard');
        await page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true}).click();await expect.poll(()=>content(page)).toEqual(original);
    });
    test('SCRUM-126 a refused toolbar cut can be retried after clipboard access becomes available',async({page})=>{
        const cut=await setup(page,false);await cut.click();await expect.poll(async()=>(await probe(page)).done).toBe(true);
        await page.waitForTimeout(100);expect(await content(page)).toEqual(original);
        await page.evaluate(()=>{const state=(window as unknown as {__clipboardSafety:Probe}).__clipboardSafety;state.allowed=true;state.done=false;});
        await cut.click();await expect.poll(async()=>(await content(page)).map(block=>block.id)).toEqual(['last']);
        expect((await probe(page)).attempts).toBe(2);
    });
    test('SCRUM-126 typing while the clipboard write is pending cannot erase newer text',async({page})=>{
        const cut=await setup(page,true,true);await cut.click();await expect.poll(async()=>(await probe(page)).attempts).toBe(1);
        await page.locator('[data-block-id="a"] [contenteditable="true"]').click();await page.keyboard.press('End');await page.keyboard.type(' newer edit');
        await expect.poll(async()=>(await content(page))[0].content).toBe('First café newer edit');
        await page.evaluate(()=>(window as unknown as {__clipboardSafety:Probe}).__clipboardSafety.release?.());
        await expect.poll(async()=>(await probe(page)).done).toBe(true);await page.waitForTimeout(100);
        expect((await content(page)).map(block=>block.id)).toEqual(original.map(block=>block.id));
        expect((await content(page))[0].content).toBe('First café newer edit');
    });
    for(const kind of ['note','fused-note'])test(`SCRUM-126 ${kind}: selection controls stay reachable in a long document without hover movement`,async({page})=>{
        const long=[...original.slice(0,3),...Array.from({length:80},(_,i)=>({id:`extra-${i}`,type:'text' as const,content:`Long document paragraph ${i}`})),original[3]];
        await setup(page,false,false,long,kind);
        const toolbar=page.getByRole('toolbar',{name:'Selected blocks',exact:true});const before=await toolbar.boundingBox();
        await toolbar.getByTitle('Copy',{exact:true}).hover();expect(await toolbar.boundingBox()).toEqual(before);
        await expect(toolbar.getByTitle('Cut',{exact:true})).toBeVisible();await expect(toolbar.getByTitle('Delete',{exact:true})).toBeVisible();
    });
});
