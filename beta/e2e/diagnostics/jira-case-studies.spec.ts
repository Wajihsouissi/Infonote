import { test, expect } from '../support/fixtures';
import { addNote, clickEmptyCanvas, deleteNode, fitView, focusEditor, focusNode, nodeId, nodeById, openCanvas, reload, setTitle, typeBlock, waitForLocalSave } from '../support/canvas';
import { cards, nodeByLabel, nodeText, readCanvasState, seedCanvasState, waitForCanvasState } from '../support/canvasState';
import type { Page } from '@playwright/test';
async function durable(page: Page) {
 return page.evaluate(async()=>{
  const modulePath='/src/services/storage/workspace/LocalWorkspaceStore.ts';
  const module=await import(modulePath);
  return (await module.loadLocalWorkspace('anonymous'))?.nodes ?? [];
 });
}
test('CS1 project handover: create rich notes, Unicode, todo, rename twice and recover after reload',async({page},info)=>{
 await openCanvas(page);const note=await addNote(page,'Orion handover');const id=await nodeId(note);
 await focusEditor(page,note);await typeBlock(page,'# Delivery decisions');
 await page.keyboard.insertText('Échéance 19 janvier — العربية 中文 👩🏽‍💻; budget €840, paid €275, remaining €565.');
 await page.keyboard.press('Enter');await page.waitForTimeout(120);
 await page.keyboard.type('[] Verify portable backup');await page.waitForTimeout(300);
 const todo=note.locator('input[type=checkbox]').first();await expect(todo).toBeVisible();await todo.check();
 await clickEmptyCanvas(page);await setTitle(note,'Orion revised');await setTitle(note,'Orion final');
 await expect.poll(async()=>JSON.stringify((await durable(page)).find((n:{id:string})=>n.id===id))).toContain('Orion final');
 await reload(page);
 const snapshot=await waitForCanvasState(page,s=>Boolean(nodeByLabel(s,'Orion final')),'handover recovered');
 const restored=nodeByLabel(snapshot,'Orion final')!;expect(nodeText(restored)).toContain('العربية 中文');expect(nodeText(restored)).toContain('€565');
 expect(JSON.stringify(restored.data?.content)).toContain('heading1');expect(JSON.stringify(restored.data?.content)).toContain('"checked":true');
 await info.attach('handover-state',{body:JSON.stringify(restored),contentType:'application/json'});await page.screenshot({path:info.outputPath('handover.png')});
});
test('CS2 research room: 40 related notes, UI editing, protected deletion and exact durable recovery',async({page},info)=>{
 await openCanvas(page);const nodes=Array.from({length:40},(_,i)=>({id:'research-'+i,type:'note',position:{x:(i%8)*500,y:Math.floor(i/8)*500},style:{width:432,height:432},data:{label:'Research '+i,viewMode:'expanded',content:[{id:'p-'+i,type:'text',content:('Evidence '+i+' — field observations, uncertainty and follow-up. ').repeat(12)}]}}));
 const edges=nodes.slice(1).map((n,i)=>({id:'link-'+i,source:nodes[i].id,target:n.id,type:'centered',data:{parentId:null}}));await seedCanvasState(page,nodes,edges);await fitView(page);
 const target=nodeById(page,'research-0');await focusNode(page,target);await focusEditor(page,target);await page.keyboard.press('End');await page.keyboard.insertText(' VERIFIED-RESEARCH-927');
 await clickEmptyCanvas(page);await expect.poll(async()=>JSON.stringify(await durable(page))).toContain('VERIFIED-RESEARCH-927');
 const before=await readCanvasState(page);expect(before?.nodes).toHaveLength(40);expect(before?.edges).toHaveLength(39);
 await reload(page);const after=await waitForCanvasState(page,s=>s.nodes.length===40,'research recovery');
 expect(after.nodes.map(n=>n.id).sort()).toEqual(before!.nodes.map(n=>n.id).sort());expect(after.edges).toEqual(before!.edges);expect(nodeText(after.nodes.find(n=>n.id==='research-0')!)).toContain('VERIFIED-RESEARCH-927');
 await fitView(page);const extra=await addNote(page,'Disposable appendix');await deleteNode(page,extra);
 const remaining=await waitForCanvasState(page,s=>!nodeByLabel(s,'Disposable appendix'),'appendix deletion');expect(remaining.nodes).toHaveLength(40);
 await info.attach('research-summary',{body:JSON.stringify({nodes:remaining.nodes.length,edges:remaining.edges.length}),contentType:'application/json'});await page.screenshot({path:info.outputPath('research.png')});
});
test('CS3 editorial session: literal code-like text cannot execute, survives typing, split/merge and reload',async({page},info)=>{
 await openCanvas(page);const note=await addNote(page,'Editorial draft');await focusEditor(page,note);
 const text='Literal <img src=x onerror="window.__jiraProbe=1"> — café العربية.';
 await page.keyboard.insertText(text);await page.keyboard.press('Home');await page.keyboard.press('Enter');await page.waitForTimeout(150);await page.keyboard.press('Backspace');
 await clickEmptyCanvas(page);await expect.poll(async()=>JSON.stringify(await durable(page))).toContain('café');
 await reload(page);const s=await waitForCanvasState(page,x=>Boolean(nodeByLabel(x,'Editorial draft')),'draft recovery');
 expect(nodeText(nodeByLabel(s,'Editorial draft')!)).toContain(text);expect(await page.evaluate(()=>Reflect.get(window,'__jiraProbe'))).toBeUndefined();
 expect(cards(s)).toHaveLength(1);await page.screenshot({path:info.outputPath('editorial.png')});
});
test('CS4 two-tab handover: a stale writer cannot silently erase an acknowledged rename',async({page,context},info)=>{
 await openCanvas(page);const note=await addNote(page,'Shared draft');const id=await nodeId(note);await focusEditor(page,note);await page.keyboard.insertText('Original text');await clickEmptyCanvas(page);await waitForLocalSave(page);
 await expect.poll(async()=>JSON.stringify(await durable(page))).toContain('Original text');
 const second=await context.newPage();await openCanvas(second);await expect.poll(async()=>JSON.stringify(await readCanvasState(second))).toContain('Shared draft');
 await setTitle(note,'ACKNOWLEDGED latest title');await expect.poll(async()=>JSON.stringify(await durable(page))).toContain('ACKNOWLEDGED latest title');
 await focusEditor(second,nodeById(second,id));await second.keyboard.press('End');await second.keyboard.insertText(' SECOND-WRITER-927');await clickEmptyCanvas(second);
 await expect.poll(async()=>JSON.stringify(await durable(second))).toContain('SECOND-WRITER-927');
 const result=(await durable(second)).find((n:{id:string})=>n.id===id);await info.attach('concurrent-durable-record',{body:JSON.stringify(result),contentType:'application/json'});
 expect(result.data.label,'The second tab erased an already acknowledged title; needs a documented writer/conflict policy.').toBe('ACKNOWLEDGED latest title');
 await second.close();
});
