import {test,expect} from '../../support/fixtures';
import type {Page,BrowserContext} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {openCanvas,waitForLocalSave,nodeById,focusEditor,selectNode,deleteNode} from '../../support/canvas';
import {seedCanvasState} from '../../support/canvasState';
const fixture=[{id:'shared',type:'note',position:{x:100,y:100},style:{width:560,height:400},data:{label:'Shared draft',viewMode:'expanded',content:[{id:'body',type:'text',content:'Original body العربية café 😀'}]}}];
async function seed(page:Page){await openCanvas(page);await seedCanvasState(page,fixture);await waitForLocalSave(page);await expect.poll(async()=>(await durable(page)).nodes[0]?.data.label).toBe('Shared draft');}
/** Raw durable oracle: never calls the writer's load/adoption API. */
async function durable(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('infonote-local-workspaces');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{const tx=db.transaction(['workspaces','workspace-nodes','workspace-edges'],'readonly');const get=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const [header,rows,edges]=await Promise.all([get(tx.objectStore('workspaces').get('anonymous')),get(tx.objectStore('workspace-nodes').getAll()),get(tx.objectStore('workspace-edges').getAll())]);
 const nodesById=new Map(rows.filter(row=>row.workspace==='anonymous').map(row=>[row.id,row.value])),edgesById=new Map(edges.filter(row=>row.workspace==='anonymous').map(row=>[row.id,row.value]));
 return {header,nodes:(header?.nodeIds??[]).map((id:string)=>nodesById.get(id)),edges:(header?.edgeIds??[]).map((id:string)=>edgesById.get(id))};
 }finally{db.close();}
 });}
async function rename(page:Page,value:string){await page.bringToFront();await selectNode(nodeById(page,'shared'));const title=nodeById(page,'shared').locator('input').first();await title.fill(value);await expect(title).toHaveValue(value);await title.press('Enter');await expect.poll(()=>page.evaluate(()=>(window as unknown as {__appStore:{getState:()=>{nodes:{id:string;data:{label:string}}[]}}}).__appStore.getState().nodes.find(n=>n.id==='shared')?.data.label)).toBe(value);}
async function editBody(page:Page,value:string){await page.bringToFront();await focusEditor(page,nodeById(page,'shared'));await page.keyboard.press('End');await page.keyboard.type(value);}
const observed=new Map<Page,string[]>();
async function second(context:BrowserContext){const page=await context.newPage(),errors:string[]=[];observed.set(page,errors);page.on('pageerror',e=>{if(!/ResizeObserver loop/.test(e.message))errors.push(e.message);});page.on('console',m=>{if(m.type()==='error'&&!/404|favicon|ResizeObserver loop|downloadable font.*2152398850/.test(m.text()))errors.push(m.text());});await openCanvas(page);return page;}
const recovery=(page:Page)=>page.getByRole('button',{name:'Not saved. Open save recovery',exact:true});
async function saveFault(page:Page,kind:'quota'|'abort'){await page.evaluate(kind=>{
 const state={enabled:true,kind};(window as unknown as {__saveFault:typeof state}).__saveFault=state;
 const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
  if(state.enabled&&this.transaction.db.name==='infonote-local-workspaces'&&this.name==='workspaces'&&(args[0] as {key?:string}).key==='anonymous'){
   if(state.kind==='quota')throw new DOMException('Test storage is full','QuotaExceededError');
   const request=put.apply(this,args);this.transaction.abort();return request;
  }return put.apply(this,args);
 };
 },kind);}
test.describe('SCRUM-37 browser autosave and integrity',()=>{
 test.beforeAll(async({browser},info)=>console.info(`[SCRUM-37] ${info.project.name}: ${browser.version()}`));
 test.afterEach(async({page},info)=>{const errors=[...observed.values()];observed.clear();for(const list of errors)expect(list,'Unexpected error in another tab').toEqual([]);await page.mouse.up();if(info.status==='passed')await page.screenshot({path:info.outputPath('result.png')});});
 test('SCRUM-163 stale second tab cannot overwrite an acknowledged title',async({page,context},info)=>{
  await seed(page);const other=await second(context);await expect(nodeById(other,'shared')).toContainText('Original body');
  await rename(page,'ACKNOWLEDGED latest title');await waitForLocalSave(page);await expect.poll(async()=>(await durable(page)).nodes[0].data.label).toBe('ACKNOWLEDGED latest title');
  await editBody(other,' — stale tab edit');await other.waitForTimeout(850);
  expect((await durable(page)).nodes[0].data.label).toBe('ACKNOWLEDGED latest title');
  await expect(recovery(other)).toBeVisible();await recovery(other).click();await expect(other.getByRole('dialog',{name:'Keep your changes safe'})).toContainText('Another tab');
  await other.screenshot({path:info.outputPath('stale-tab-recovery.png')});
  const downloadPromise=other.waitForEvent('download');await other.getByRole('button',{name:'Download this tab’s backup',exact:true}).click();const download=await downloadPromise;
  const copyPath=info.outputPath('stale-tab-copy.json');await download.saveAs(copyPath);const copy=JSON.parse(await readFile(copyPath,'utf8'));
  expect(copy.nodes[0].data.label).toBe('Shared draft');expect(copy.nodes[0].data.content[0].content).toContain('stale tab edit');
  await other.getByRole('button',{name:'Retry saving',exact:true}).click();await expect(other.getByRole('dialog')).toContainText('Another tab');expect((await durable(page)).nodes[0].data.label).toBe('ACKNOWLEDGED latest title');
  other.on('dialog',dialog=>void dialog.accept());await other.getByRole('button',{name:'Reopen saved workspace',exact:true}).click();await expect(other.locator('.react-flow__pane')).toBeVisible();
  await expect(nodeById(other,'shared').locator('input').first()).toHaveValue('ACKNOWLEDGED latest title');await waitForLocalSave(other);
  await other.close({runBeforeUnload:false});
 });
 test('SCRUM-163 a stale tab cannot resurrect a deleted card',async({page,context})=>{
  await seed(page);const other=await second(context);await page.bringToFront();await deleteNode(page,nodeById(page,'shared'));await waitForLocalSave(page);await expect.poll(async()=>(await durable(page)).nodes.length).toBe(0);
  await editBody(other,' stale resurrection attempt');await expect(recovery(other)).toBeVisible();await other.waitForTimeout(500);expect((await durable(page)).nodes).toEqual([]);await other.close({runBeforeUnload:false});
 });
 test('SCRUM-163 refusal still protects data when BroadcastChannel is unavailable',async({page,context})=>{
  await context.addInitScript(()=>Object.defineProperty(window,'BroadcastChannel',{value:undefined,configurable:true}));await seed(page);const other=await second(context);
  await rename(page,'Saved without notifications');await waitForLocalSave(page);await expect.poll(async()=>(await durable(page)).nodes[0].data.label).toBe('Saved without notifications');
  await editBody(other,' offline notification fallback');await expect(recovery(other)).toBeVisible();expect((await durable(page)).nodes[0].data.label).toBe('Saved without notifications');await other.close({runBeforeUnload:false});
 });
 test('SCRUM-59 simultaneous real IndexedDB writers have exactly one winner',async({page,context},info)=>{
  await seed(page);const other=await second(context);
  const commit=(tab:Page,label:string)=>tab.evaluate(async label=>{
   const path='/src/services/storage/workspace/LocalWorkspaceStore.ts',local=await import(path);
   const store=(window as unknown as {__appStore:{getState:()=>{nodes:{id:string;data:Record<string,unknown>}[];edges:unknown[]}}}).__appStore.getState();
   try{await local.saveLocalWorkspace({key:'anonymous',nodes:store.nodes.map(node=>({...node,data:{...node.data,label}})),edges:store.edges,updatedAt:Date.now()});return {saved:true,label};}
   catch(error){return {saved:false,name:(error as Error).name,label};}
  },label);
  const results=await Promise.all([commit(page,'Writer A'),commit(other,'Writer B')]);expect(results.filter(r=>r.saved)).toHaveLength(1);expect(results.find(r=>!r.saved)?.name).toBe('LocalWorkspaceConflictError');expect((await durable(page)).nodes[0].data.label).toBe(results.find(r=>r.saved)!.label);
  await info.attach('transaction-race',{body:JSON.stringify(results),contentType:'application/json'});await other.close({runBeforeUnload:false});
 });
 test('SCRUM-160 unchanged semantic graphs preserve the durable commit and write no rows',async({page})=>{
  await seed(page);const result=await page.evaluate(async()=>{
   const path='/src/services/storage/workspace/LocalWorkspaceStore.ts';const local=await import(path);const record=await local.loadLocalWorkspace('anonymous');
   const writes:string[]=[];const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(this.transaction.db.name==='infonote-local-workspaces')writes.push(this.name);return put.apply(this,args);};
   try{await local.saveLocalWorkspace({...record,updatedAt:Date.now()+1,nodes:record.nodes.map((node:object)=>({...node,selected:true}))});}finally{IDBObjectStore.prototype.put=put;}return writes;
  });expect(result).toEqual([]);
 });
 test('SCRUM-159 hydration finishes before the canvas becomes editable',async({page})=>{
  await seed(page);await page.addInitScript(()=>{
   const get=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(...args:Parameters<IDBObjectStore['get']>){const request=get.apply(this,args);if(this.transaction.db.name==='infonote-local-workspaces'&&this.name==='workspaces'&&this.transaction.mode==='readonly'){
    const descriptor=Object.getOwnPropertyDescriptor(IDBRequest.prototype,'onsuccess')!;Object.defineProperty(request,'onsuccess',{set(handler){descriptor.set!.call(request,(event:Event)=>window.setTimeout(()=>handler.call(request,event),1400));},configurable:true});
   }return request;};
  });await page.reload();await expect(page.getByRole('heading',{name:'Opening your workspace',exact:true})).toBeVisible();await expect(page.locator('.react-flow__pane')).toHaveCount(0);
  await expect(nodeById(page,'shared')).toContainText('Original body');await expect(nodeById(page,'shared').locator('input')).toHaveValue('Shared draft');
 });
 test('SCRUM-161 continuous real typing becomes durable before typing stops',async({page})=>{
  await seed(page);await focusEditor(page,nodeById(page,'shared'));await page.keyboard.press('End');const text=' continuous typing remains safe for every user';
  const typing=page.keyboard.type(text,{delay:90});await expect.poll(async()=>(await durable(page)).nodes[0].data.content[0].content.includes(' continuous'),{timeout:2800}).toBe(true);await typing;await waitForLocalSave(page);expect((await durable(page)).nodes[0].data.content[0].content).toContain(text);
 });
 test('SCRUM-161 native visibility change flushes pending editor text',async({page,context})=>{
  await seed(page);const blank=await context.newPage();await blank.goto('about:blank');await page.bringToFront();await editBody(page,' immediately before hiding');await blank.bringToFront();
  await expect.poll(async()=>(await durable(page)).nodes[0].data.content[0].content).toContain('immediately before hiding');await blank.close();
 });
 test('SCRUM-161 a completed real drag saves its final position',async({page})=>{
  await seed(page);await page.bringToFront();const before=(await durable(page)).nodes[0].position,box=(await nodeById(page,'shared').boundingBox())!;
  await page.mouse.move(box.x+box.width*.5,box.y+4);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+60,box.y+44,{steps:12});await expect(page.locator('body')).toHaveClass(/chnk-it-node-dragging/);
  await page.waitForTimeout(1700);expect((await durable(page)).nodes[0].position).toEqual(before);await expect(page.getByRole('status',{name:'Saving changes on this device'})).toBeVisible();
  await page.mouse.up();await waitForLocalSave(page);expect((await durable(page)).nodes[0].position).not.toEqual(before);const saved=(await durable(page)).nodes[0].position;await page.reload();await expect(nodeById(page,'shared')).toBeVisible();expect((await durable(page)).nodes[0].position).toEqual(saved);
 });
 test('SCRUM-163 the account page documents shared-browser storage and no cloud backup',async({page})=>{
  await seed(page);await page.getByRole('button',{name:'Backup and sign-in',exact:true}).click();await expect(page.getByText('This browser workspace is shared across its tabs and accounts.',{exact:false})).toBeVisible();await expect(page.getByText('Signing in or out does not separate it or create a cloud backup.',{exact:false})).toBeVisible();
 });
 test('SCRUM-159 existing v3 data upgrades intact and old v3 writers are refused',async({page})=>{
  await page.route('**/qa-storage-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated storage fixture</title>'}));await page.goto('/qa-storage-fixture');
  await page.evaluate(async nodes=>{
   const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('infonote-local-workspaces',3);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('workspaces',{keyPath:'key'});for(const name of ['workspace-nodes','workspace-edges'])db.createObjectStore(name,{keyPath:['workspace','id']}).createIndex('workspace','workspace');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['workspaces','workspace-nodes','workspace-edges'],'readwrite');tx.objectStore('workspaces').put({key:'anonymous',format:3,commit:'legacy-commit',nodeIds:nodes.map(n=>n.id),edgeIds:[],updatedAt:12345});for(const node of nodes)tx.objectStore('workspace-nodes').put({workspace:'anonymous',id:node.id,value:node});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
  },fixture);await openCanvas(page);await expect(nodeById(page,'shared')).toContainText('Original body');const before=await durable(page);
  const legacy=await page.evaluate(()=>new Promise<{name:string;version?:number}>(resolve=>{const request=indexedDB.open('infonote-local-workspaces',3);request.onerror=event=>{event.preventDefault();resolve({name:request.error!.name});};request.onsuccess=()=>{const db=request.result;resolve({name:'unexpected success',version:db.version});db.close();};}));
  expect(legacy.name).toBe('VersionError');expect(await durable(page)).toEqual(before);expect(before.header.commit).toBe('legacy-commit');
 });
 test('SCRUM-159 saved recovery exports exact graph, connections and referenced file bytes',async({page},info)=>{
  await seed(page);await page.evaluate(async()=>{
   const path='/src/services/assets/assetStore.ts',assets=await import(path);const bytes=new TextEncoder().encode('Recovery file العربية café');
   await assets.putAssetRecord({id:'recovery-file',name:'recovery.txt',mime:'text/plain',size:bytes.byteLength,hash:'qa-recovery-file',createdAt:12345,bytes:bytes.buffer});
  });
  const graph=[fixture[0],{id:'file-card',type:'block',position:{x:750,y:100},data:{content:[{id:'file-block',type:'file',content:'asset:recovery-file',metadata:{name:'recovery.txt',mimeType:'text/plain'}}],isStandaloneBlock:true}}];
  const edges=[{id:'recovery-edge',source:'shared',target:'file-card',label:'Keep connection metadata',data:{custom:'preserved'}}];await seedCanvasState(page,graph,edges);await waitForLocalSave(page);const before=await durable(page);
  await page.goto('/recovery');await expect(page.getByRole('heading',{name:'Workspace recovery',exact:true})).toBeVisible();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download saved backup',exact:true}).click();const download=await pending,path=info.outputPath('saved-recovery.json');await download.saveAs(path);const copy=JSON.parse(await readFile(path,'utf8'));
  expect(copy.nodes.map((node:{id:string})=>node.id)).toEqual(before.nodes.map((node:{id:string})=>node.id));expect(copy.edges).toEqual(before.edges);expect(copy.assets).toHaveLength(1);expect(Buffer.from(copy.assets[0].data,'base64').toString('utf8')).toBe('Recovery file العربية café');expect(await durable(page)).toEqual(before);
 });
 test.describe('injected storage faults',()=>{
 test.use({allowConsoleErrors:true});
 test('SCRUM-159 an unsupported durable header cannot become an empty saved graph',async({page,consoleErrors})=>{
  await seed(page);await page.evaluate(async()=>{
   const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('infonote-local-workspaces');r.onsuccess=()=>resolve(r.result);});
   await new Promise<void>((resolve,reject)=>{const tx=db.transaction('workspaces','readwrite'),store=tx.objectStore('workspaces'),r=store.get('anonymous');r.onsuccess=()=>store.put({...r.result,format:99});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
  });await page.reload();await page.waitForTimeout(1500);
  const stored=await durable(page);expect(stored.header.format).toBe(99);expect(stored.nodes[0].data.label).toBe('Shared draft');await expect(page.getByRole('heading',{name:'Your workspace could not open'})).toBeVisible();
  expect(consoleErrors.every(message=>message.includes('[localPersistence] Load failed:'))).toBe(true);
 });
 for(const kind of ['quota','abort'] as const)test(`SCRUM-162 ${kind} failure rolls back and visible retry saves the newest text`,async({page,consoleErrors},info)=>{
  await seed(page);const before=await durable(page);await saveFault(page,kind);await editBody(page,' unsaved change');await expect(recovery(page)).toBeVisible();expect(await durable(page)).toEqual(before);
  await editBody(page,' newest retry text');await recovery(page).click();await expect(page.getByRole('dialog',{name:'Keep your changes safe'})).toBeVisible();await page.screenshot({path:info.outputPath(`${kind}-save-recovery.png`)});
  const retry=page.getByRole('button',{name:'Retry saving',exact:true});await retry.evaluate(button=>button.addEventListener('click',()=>{(window as unknown as {__saveFault:{enabled:boolean}}).__saveFault.enabled=false;},{capture:true,once:true}));await retry.click();await waitForLocalSave(page);await expect(page.getByRole('status',{name:'Saved on this device',exact:true})).toBeVisible();
  expect((await durable(page)).nodes[0].data.content[0].content).toContain('unsaved change newest retry text');expect(consoleErrors.every(message=>message.includes('[localPersistence] Save failed:'))).toBe(true);
 });
 test('SCRUM-162 a slow acknowledgement cannot mark a newer editor generation saved',async({page,consoleErrors})=>{
  await seed(page);await page.evaluate(()=>{
   const held:(()=>void)[]=[];(window as unknown as {__heldSaveAcks:(()=>void)[]}).__heldSaveAcks=held;
   const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args:Parameters<IDBDatabase['transaction']>){const tx=transaction.apply(this,args);if(this.name==='infonote-local-workspaces'&&tx.mode==='readwrite'){
    const descriptor=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete')!;Object.defineProperty(tx,'oncomplete',{set(handler){descriptor.set!.call(tx,(event:Event)=>held.push(()=>handler.call(tx,event)));},configurable:true});
   }return tx;};
  });
  await editBody(page,' first generation');await expect.poll(async()=>(await durable(page)).nodes[0].data.content[0].content).toContain('first generation');await editBody(page,' newer generation');
  await page.evaluate(()=>(window as unknown as {__heldSaveAcks:(()=>void)[]}).__heldSaveAcks.shift()!());await expect(page.getByRole('status',{name:'Saving changes on this device'})).toBeVisible();
  await expect.poll(async()=>(await durable(page)).nodes[0].data.content[0].content).toContain('newer generation');await expect(page.getByRole('status',{name:'Saving changes on this device'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__heldSaveAcks:(()=>void)[]}).__heldSaveAcks.length)).toBeGreaterThan(0);await page.evaluate(()=>(window as unknown as {__heldSaveAcks:(()=>void)[]}).__heldSaveAcks.shift()!());await waitForLocalSave(page);expect(consoleErrors).toEqual([]);
 });
 test('SCRUM-162 narrow recovery is keyboard accessible and remains inside the viewport',async({page,consoleErrors},info)=>{
  await page.setViewportSize({width:390,height:700});await seed(page);await saveFault(page,'quota');await editBody(page,' narrow-screen draft');await expect(recovery(page)).toBeVisible();await recovery(page).focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Keep your changes safe'});await expect(dialog).toBeVisible();const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(15);expect(box.x+box.width).toBeLessThanOrEqual(375);expect(box.y+box.height).toBeLessThanOrEqual(700);
  await page.screenshot({path:info.outputPath('narrow-save-recovery.png')});await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(recovery(page)).toBeFocused();expect(consoleErrors.every(message=>message.includes('[localPersistence] Save failed:'))).toBe(true);
 });
 });
});
