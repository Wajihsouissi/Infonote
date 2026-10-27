import {test,expect} from '../support/fixtures';
import {openCanvas} from '../support/canvas';
import {seedCanvasState,readCanvasState,waitForCanvasState} from '../support/canvasState';
import type {CanvasStateNode} from '../support/canvasState';
const note=(id:string,label:string,text:string,parentId?:string):CanvasStateNode=>({id,type:'note',parentId,position:{x:100,y:100},style:{width:432,height:432},data:{label,content:[{id:'p-'+id,type:'text',content:text}]}});
test('TC-FE18-01/02 search uses body text and type filters, escapes malicious text and opens the intended result',async({page})=>{
 await openCanvas(page);await seedCanvasState(page,[note('target','Safe <img src=x onerror=alert(1)>','المعلومة café evidence'),{...note('other','Other','irrelevant'),position:{x:700,y:100}}]);
 await page.getByTitle('Search (Ctrl+F)',{exact:true}).click();const input=page.getByPlaceholder('Search your notes');await input.fill('is:note café');
 const result=page.locator('[data-index="0"]');await expect(result).toContainText('café');await expect(result).toContainText('Safe <img');await expect(result.locator('img')).toHaveCount(0);await expect(page.locator('[data-index]')).toHaveCount(1);
 await input.fill('is:block café');await expect(page.getByText('No results found',{exact:true})).toBeVisible();
 await input.fill('is:note café');await expect(page.locator('[data-index]')).toHaveCount(1);await input.press('Enter');await expect(input).not.toBeVisible();
 expect((await readCanvasState(page))?.nodes.find(n=>n.id==='target')?.data?.content).toEqual([{id:'p-target',type:'text',content:'المعلومة café evidence'}]);
 await expect.poll(()=>page.locator('.react-flow__node[data-id="target"]').count()).toBe(1);
});
test('TC-FE18-03 newest query wins and search result limit remains ten',async({page})=>{
 await openCanvas(page);const nodes: CanvasStateNode[]=Array.from({length:24},(_,i)=>({...note('n'+i,'Needle '+i,'shared-match '+i),position:{x:i*450,y:100}}));nodes.push(note('final','Unique final','FINAL-927'));
 await seedCanvasState(page,nodes);await page.getByTitle('Search (Ctrl+F)',{exact:true}).click();const input=page.getByPlaceholder('Search your notes');
 await input.fill('shared-match');await expect(page.locator('[data-index]')).toHaveCount(10);
 await input.fill('Needle');await input.fill('nonexistent');await input.fill('FINAL-927');await expect(page.locator('[data-index]')).toHaveCount(1);await expect(page.locator('[data-index="0"]')).toContainText('Unique final');
 await page.waitForTimeout(500);await expect(page.locator('[data-index]')).toHaveCount(1);await input.press('Escape');await expect(input).not.toBeVisible();expect((await readCanvasState(page))?.nodes).toHaveLength(25);
});
test('TC-FE19-01/02 outline collapse, filtering, focus and duplicate preserve source identity and text',async({page})=>{
 await openCanvas(page);const parent=note('root','Root card','Root evidence');parent.data!.content=[{id:'h1',type:'heading1',content:'Main heading'},{id:'h2',type:'heading2',content:'Detail heading'},{id:'task',type:'todo',content:'Verify evidence',metadata:{checked:false}}];
 await seedCanvasState(page,[parent,note('child','Child card','Child evidence','root')]);await page.keyboard.press('t');await expect(page.getByPlaceholder('Search outline...')).toBeVisible();
 const tree=page.locator('[class*="treeWrapper"]');await expect(tree.getByText('Detail heading',{exact:true})).toBeVisible();
 await page.getByTitle('Collapse all',{exact:true}).click();await expect(tree.getByText('Detail heading',{exact:true})).not.toBeVisible();await page.getByTitle('Expand all',{exact:true}).click();await expect(tree.getByText('Detail heading',{exact:true})).toBeVisible();
 await page.getByPlaceholder('Search outline...').fill('Child card');await expect(tree.getByText('Child card',{exact:true})).toBeVisible();await expect(tree.getByText('Detail heading',{exact:true})).not.toBeVisible();await page.getByTitle('Clear search',{exact:true}).click();
 await tree.getByText('Root card',{exact:true}).click();await expect(page.locator('.react-flow__node[data-id="root"]')).toHaveClass(/selected/);
 await tree.getByText('Root card',{exact:true}).click({button:'right'});await page.getByText('Duplicate',{exact:true}).click();
 const s=await waitForCanvasState(page,s=>s.nodes.length>2,'outline duplication');expect(s.nodes.find(n=>n.id==='root')?.data?.content).toEqual(parent.data?.content);expect(s.nodes.find(n=>n.id==='child')?.parentId).toBe('root');expect(new Set(s.nodes.map(n=>n.id)).size).toBe(s.nodes.length);
});
test('TC-FE01-04 keyboard theme switching and shortcut help preserve graph and viewport',async({page})=>{
 await openCanvas(page);await seedCanvasState(page,[note('stable','Theme evidence','Do not lose this document')]);const before=await readCanvasState(page);const transform=await page.locator('.react-flow__viewport').getAttribute('style');
 const button=page.getByRole('button',{name:/Switch to (light|dark) mode/});const oldLabel=await button.getAttribute('aria-label');await button.focus();await page.keyboard.press('Enter');await expect(button).not.toHaveAttribute('aria-label',oldLabel!);
 await page.keyboard.press('k');await expect(page.getByTitle('Close Shortcuts',{exact:true})).toBeVisible();await page.getByTitle('Close Shortcuts',{exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByTitle('Close Shortcuts',{exact:true})).not.toBeVisible();
 expect((await readCanvasState(page))?.nodes).toEqual(before?.nodes);expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(transform);
});
