import {test,expect} from '../../support/fixtures';
import {writeFile} from 'node:fs/promises';
import type {Page} from '@playwright/test';
import type {Block} from '../../../src/features/editor/types';
import {openCanvas,fitView,nodeById,waitForLocalSave,reload} from '../../support/canvas';
import {readCanvasState,seedCanvasState} from '../../support/canvasState';

const moved:Block={id:'moving',type:'heading2',content:'Moved **café العربية 😀**',metadata:{name:'Keep this metadata'}};
const sourceBlocks:Block[]=[moved,{id:'keep',type:'text',content:'Source remains'}];
const targetBlocks:Block[]=[{id:'before',type:'text',content:'Before destination'},{id:'after',type:'text',content:'After destination'}];
async function setup(page:Page,sourceKind='note',targetKind='note',source=sourceBlocks,target=targetBlocks){
 await openCanvas(page);
 await seedCanvasState(page,[{id:'source',type:sourceKind,position:{x:100,y:100},style:{width:560,height:400},data:{label:'Source document',content:source,viewMode:'expanded',isStandaloneBlock:sourceKind!=='note'}},
 {id:'target',type:targetKind,position:{x:850,y:100},style:{width:560,height:400},data:{label:'Destination document',content:target,viewMode:'expanded',isStandaloneBlock:targetKind!=='note'}}]);
 await expect(nodeById(page,'source')).toBeVisible();await fitView(page);await page.bringToFront();
 await page.evaluate(()=>{
  type Graph={nodes:Array<{id:string;type?:string;position:{x:number;y:number};data:{content?:Array<{id:string}>}}>;interactionState:unknown};
  const store=(window as unknown as {__appStore:{getState:()=>Graph;subscribe:(fn:()=>void)=>void;temporal:{getState:()=>{pastStates:Graph[];isTracking:boolean}}}}).__appStore;
  const events:unknown[]=[];(window as unknown as {__transferQA:unknown[]}).__transferQA=events;
  const graph=(state:Graph)=>state.nodes.map(n=>({id:n.id,type:n.type,ids:n.data.content?.map(b=>b.id),position:n.position}));
  const push=(phase:string,event?:Event)=>{const state=store.getState(),history=store.temporal.getState();events.push({phase,target:event?.target instanceof Element?event.target.closest('.react-flow__node')?.getAttribute('data-id'):null,nodes:graph(state),interaction:state.interactionState,tracking:history.isTracking,past:history.pastStates.slice(-3).map(graph)});if(events.length>120)events.shift();};
  store.subscribe(()=>push('state'));for(const type of ['dragstart','drop','dragend','pointerup','mouseup'])document.addEventListener(type,event=>push(type,event),true);
 });
}
const frame=(page:Page,id:string)=>page.locator(`[data-block-id="${id}"]`).first();
async function blocks(page:Page,id:string){return(await readCanvasState(page))!.nodes.find(n=>n.id===id)?.data?.content as Block[]|undefined;}
async function edit(page:Page,id='source'){
 const node=nodeById(page,id),shield=node.locator('.interaction-overlay');
 if(await shield.count()){await expect(shield).toBeVisible();await shield.click();await expect(shield).toHaveCount(0);}
 await node.locator('[data-reader-text],[contenteditable="true"]').first().click();await expect(node.locator('[contenteditable="true"]').first()).toBeVisible();
}
async function nativeStart(page:Page,id='moving'){
 await frame(page,id).hover();const handle=frame(page,id).getByRole('button',{name:'Move block or open menu',exact:true});const box=(await handle.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+14,box.y+box.height/2+4,{steps:8});
 await expect(page.locator('[data-carried-block]')).toBeVisible();
}
async function over(page:Page,id='after',fraction=.2){const box=(await frame(page,id).boundingBox())!;await page.mouse.move(box.x+box.width*.62,box.y+box.height*fraction,{steps:20});await page.mouse.move(box.x+box.width*.62+1,box.y+box.height*fraction);await page.waitForTimeout(220);}
async function nodeStart(page:Page){const box=(await nodeById(page,'source').boundingBox())!;await page.mouse.move(box.x+box.width*.5,box.y+4);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+18,box.y+6,{steps:6});await expect(page.locator('body')).toHaveClass(/chnk-it-node-dragging/);}
async function undo(page:Page){await page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true}).click();}
async function redo(page:Page){await page.getByRole('button',{name:'Redo (Ctrl+Y/Shift+Ctrl+Z)',exact:true}).click();}
test.describe('SCRUM-243 cross-surface block transfer',()=>{
 test.beforeAll(async({browser},info)=>console.info(`[SCRUM-243] ${info.project.name}: ${browser.version()}`));
 test.afterEach(async({page},info)=>{const path=info.outputPath('transfer-state-trace.json');await writeFile(path,JSON.stringify(await page.evaluate(()=>(window as unknown as {__transferQA?:unknown[]}).__transferQA??[])));await info.attach('transfer-state-trace',{path,contentType:'application/json'});await page.keyboard.press('Escape');await page.mouse.up();if(info.status==='passed'){await waitForLocalSave(page);await page.screenshot({path:info.outputPath('result.png')});}});
 for(const kind of ['note','fused-note'])test(`${kind} editor to canvas preserves the rendered block, metadata and one-step Undo`,async({page})=>{
  await setup(page,kind);await edit(page);await nativeStart(page);await expect(page.locator('[data-carried-block] strong')).toHaveText('café العربية 😀');
  const pane=(await page.locator('.react-flow__pane').boundingBox())!;await page.mouse.move(pane.x+70,pane.y+96,{steps:24});await page.mouse.up();
  await expect.poll(async()=>(await blocks(page,'source'))?.map(b=>b.id)).toEqual(['keep']);
  await expect.poll(async()=>(await readCanvasState(page))!.nodes.filter(n=>!['source','target'].includes(n.id)).length).toBe(1);
  const created=(await readCanvasState(page))!.nodes.find(n=>!['source','target'].includes(n.id))!;expect(created.data!.content).toEqual([moved]);
  await undo(page);await expect.poll(()=>blocks(page,'source')).toEqual(sourceBlocks);await expect.poll(async()=>(await readCanvasState(page))!.nodes.length).toBe(2);
  await redo(page);await expect.poll(async()=>(await blocks(page,'source'))?.map(b=>b.id)).toEqual(['keep']);await reload(page);expect(await blocks(page,created.id)).toEqual([moved]);
 });
 for(const targetKind of ['note','fused-note'])test(`canvas block into ${targetKind}: actual block stays visible and insertion is previewed between peers`,async({page})=>{
  await setup(page,'block',targetKind,[moved]);await nodeStart(page);await over(page);
  await expect(nodeById(page,'source')).toBeVisible();await expect(page.locator('[class*="dragChipContainer"]')).toHaveCount(0);
  // A visible descendant can still paint behind a sibling stacking context.
  // Compare the moving React Flow wrapper, not its inner block's z-index.
  const layers=await page.evaluate(()=>Object.fromEntries(['source','target'].map(id=>[id,Number(getComputedStyle(document.querySelector(`.react-flow__node[data-id="${id}"]`)!).zIndex)])));
  expect(layers.source,'the actual moving node must paint above the destination').toBeGreaterThan(layers.target);
  await expect(nodeById(page,'target').locator('[data-block-insertion-line]')).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(async()=>(await blocks(page,'target'))?.map(b=>b.id)).toEqual(['before','moving','after']);expect((await blocks(page,'target'))![1]).toEqual(moved);
  await expect.poll(async()=>(await readCanvasState(page))!.nodes.some(n=>n.id==='source')).toBe(false);
  await undo(page);await expect.poll(()=>blocks(page,'source')).toEqual([moved]);expect(await blocks(page,'target')).toEqual(targetBlocks);
  await redo(page);await expect.poll(async()=>(await blocks(page,'target'))?.map(b=>b.id)).toEqual(['before','moving','after']);await reload(page);expect((await blocks(page,'target'))![1]).toEqual(moved);
 });
 for(const sourceKind of ['note','fused-note'])test(`${sourceKind} editor to passive ${sourceKind==='note'?'fused-note':'note'} previews a real slot and transfers once`,async({page})=>{
  await setup(page,sourceKind,sourceKind==='note'?'fused-note':'note');await edit(page);await nativeStart(page);await over(page);
  await expect(nodeById(page,'target').locator('[data-block-insertion-line]')).toHaveCount(1);await expect(page.locator('[data-carried-block] strong')).toHaveText('café العربية 😀');
  await page.mouse.up();
  await expect.poll(async()=>(await blocks(page,'target'))?.map(b=>b.id)).toEqual(['before','moving','after']);expect(await blocks(page,'source')).toEqual([sourceBlocks[1]]);
  await undo(page);await expect.poll(()=>blocks(page,'source')).toEqual(sourceBlocks);expect(await blocks(page,'target')).toEqual(targetBlocks);
 });
 test('a complete collapsed toggle branch moves to canvas without orphaning hidden children',async({page})=>{
  const branch:Block[]=[{id:'fold',type:'toggle',content:'Collapsed branch',metadata:{isCollapsed:true}},{id:'child',type:'text',content:'Hidden text',indent:1},sourceBlocks[1]];
  await setup(page,'note','note',branch);await edit(page);await nativeStart(page,'fold');const pane=(await page.locator('.react-flow__pane').boundingBox())!;await page.mouse.move(pane.x+24,pane.y+96,{steps:20});await page.mouse.up();
  await expect.poll(async()=>(await blocks(page,'source'))?.map(b=>b.id)).toEqual(['keep']);const created=(await readCanvasState(page))!.nodes.find(n=>!['source','target'].includes(n.id))!;
  expect(created.type).toBe('fused-note');expect(created.data!.content).toEqual(branch.slice(0,2));await undo(page);await expect.poll(()=>blocks(page,'source')).toEqual(branch);
 });
 test('an empty passive card receives the block once with an explicit insertion preview',async({page})=>{
  await setup(page,'note','note',sourceBlocks,[]);await edit(page);await nativeStart(page);const target=(await nodeById(page,'target').boundingBox())!;await page.mouse.move(target.x+target.width*.5,target.y+target.height*.5,{steps:20});
  await expect(nodeById(page,'target').locator('[data-block-insertion-line]')).toHaveCount(1);await page.mouse.up();await expect.poll(()=>blocks(page,'target')).toEqual([moved]);
 });
 for(const sourceKind of ['note','fused-note'])for(const targetKind of ['note','fused-note'])test(`live ${sourceKind} editor to live ${targetKind} editor transfers selected content once`,async({page})=>{
  await setup(page,sourceKind,targetKind);await edit(page,'target');await edit(page,'source');await nativeStart(page);await over(page);
  await expect(nodeById(page,'target').locator('[data-block-insertion-line]')).toHaveCount(1);await page.mouse.up();
  await expect.poll(async()=>(await blocks(page,'target'))?.map(b=>b.id)).toEqual(['before','moving','after']);expect(await blocks(page,'source')).toEqual([sourceBlocks[1]]);
  await undo(page);await expect.poll(()=>blocks(page,'source')).toEqual(sourceBlocks);expect(await blocks(page,'target')).toEqual(targetBlocks);
 });
 test('two selected blocks travel as real content between two live card editors',async({page})=>{
  const second={id:'second',type:'text',content:'Second selected block'} as Block;
  await setup(page,'note','note',[moved,second,sourceBlocks[1]]);await edit(page,'target');await edit(page,'source');
  await frame(page,'moving').getByRole('button',{name:'Move block or open menu',exact:true}).click();
  const secondEditor=frame(page,'second').locator('[contenteditable="true"]'),secondBox=(await secondEditor.boundingBox())!;
  // The grip opens its menu. Extend the range in the unobscured end of the
  // next text row, as a user can, without forcing a click through the menu.
  await secondEditor.click({position:{x:secondBox.width*.85,y:secondBox.height*.5},modifiers:['Shift']});
  await expect(page.locator('[data-block-id][class*="selected"]')).toHaveCount(2);await nativeStart(page);
  await expect(page.locator('[data-carried-block]')).toHaveAttribute('data-carried-block-count','2');await expect(page.locator('[data-carried-block]')).toContainText('Second selected block');
  await over(page);await page.mouse.up();await expect.poll(async()=>(await blocks(page,'target'))?.map(b=>b.id)).toEqual(['before','moving','second','after']);expect(await blocks(page,'source')).toEqual([sourceBlocks[1]]);
  await undo(page);await expect.poll(async()=>(await blocks(page,'source'))?.map(b=>b.id)).toEqual(['moving','second','keep']);expect(await blocks(page,'target')).toEqual(targetBlocks);
 });
 test('short rendered text has no editor-width background during drag and Escape leaves both cards intact',async({page},info)=>{
  const short={...moved,content:'**Short**'};await setup(page,'note','note',[short,sourceBlocks[1]]);await edit(page,'target');await edit(page,'source');
  const original=(await frame(page,'moving').boundingBox())!;await nativeStart(page);await over(page);
  const carried=page.locator('[data-carried-block]'),box=(await carried.boundingBox())!;
  expect(box.width).toBeLessThan(original.width*.7);await expect(carried.locator('strong')).toHaveText('Short');
  expect(await carried.locator(':scope > *').first().evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  // Visual-only gesture: capture then cancel, keeping screenshot side effects
  // out of accepted native-drop paths on Windows.
  await page.screenshot({path:info.outputPath('compact-real-block-insertion.png')});await page.keyboard.press('Escape');await page.mouse.up();
  await expect(carried).toHaveCount(0);await expect(page.locator('[data-block-insertion-line]')).toHaveCount(0);expect(await blocks(page,'source')).toEqual([short,sourceBlocks[1]]);expect(await blocks(page,'target')).toEqual(targetBlocks);
 });
 for(const sourceKind of ['fused-note','note'])for(const targetKind of ['note','fused-note'])test(`canvas ${sourceKind} stays above ${targetKind} while targeting its editor`,async({page})=>{
  await setup(page,sourceKind,targetKind);await edit(page,'target');await nodeStart(page);await over(page);
  const layers=await page.evaluate(()=>Object.fromEntries(['source','target'].map(id=>[id,Number(getComputedStyle(document.querySelector(`.react-flow__node[data-id="${id}"]`)!).zIndex)])));
  expect(layers.source).toBeGreaterThan(layers.target);await expect(nodeById(page,'target').locator('[data-block-insertion-line]')).toHaveCount(1);
  await expect(nodeById(page,'source')).toContainText('café العربية 😀');
  await page.mouse.up();await expect(page.locator('body')).not.toHaveClass(/chnk-it-node-dragging/);await expect(page.locator('[data-block-insertion-line]')).toHaveCount(0);
  if(sourceKind==='fused-note'){
   await expect.poll(async()=>(await blocks(page,'target'))?.map(b=>b.id)).toEqual(['before','moving','keep','after']);await expect(nodeById(page,'source')).toHaveCount(0);
  }else{
   await expect.poll(async()=>(await readCanvasState(page))!.nodes.find(n=>n.id==='source')?.parentId).toBe('target');
   const content=(await blocks(page,'target'))!;expect(content.map(b=>b.type)).toEqual(['text','page','text']);expect(content[1].metadata?.nodeId).toBe('source');
  }
  await undo(page);await expect.poll(()=>blocks(page,'target')).toEqual(targetBlocks);expect(await blocks(page,'source')).toEqual(sourceBlocks);
 });
 for(const reduced of [false,true])test(`arrival moves only the incoming block briefly; reduced motion=${reduced}`,async({page})=>{
  await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await setup(page,'note','fused-note');await edit(page,'target');await edit(page,'source');
  await page.evaluate(()=>{
   const records:{blockId:string|null;duration:unknown;frames:unknown}[]=[];const sizes:number[]=[];const css:string[]=[];
   (window as unknown as {__motionQA:unknown}).__motionQA={records,sizes,css};
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){
    if(this.closest('.react-flow__node')?.getAttribute('data-id')==='target')records.push({blockId:this.closest('[data-block-id]')?.getAttribute('data-block-id')??null,duration:typeof options==='number'?options:options?.duration,frames});
    return animate.call(this,frames,options);
   };
   document.addEventListener('animationstart',event=>css.push(event.animationName));
   const until=performance.now()+2500;const sample=()=>{const surface=document.querySelector('.react-flow__node[data-id="target"] [class*="fusedNoteNode"]');if(surface)sizes.push(surface.getBoundingClientRect().width);if(performance.now()<until)requestAnimationFrame(sample);};sample();
  });
  await nativeStart(page);await over(page);await page.mouse.up();await expect.poll(async()=>(await blocks(page,'target'))?.map(b=>b.id)).toEqual(['before','moving','after']);
  await page.waitForTimeout(240);
  const motion=await page.evaluate(()=>(window as unknown as {__motionQA:{records:{blockId:string|null;duration:number;frames:unknown}[];sizes:number[];css:string[]}}).__motionQA);
  expect(motion.css.some(name=>/fusionEffect|fusionPulse|targetPulse/.test(name))).toBe(false);expect(Math.max(...motion.sizes)-Math.min(...motion.sizes)).toBeLessThan(1);
  if(reduced)expect(motion.records).toEqual([]);else{expect(motion.records.length).toBeGreaterThan(0);for(const cue of motion.records){expect(cue.blockId).toBe('moving');expect(cue.duration).toBeLessThanOrEqual(180);expect(JSON.stringify(cue.frames)).not.toContain('scale');}}
 });
});
