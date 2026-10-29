import assert from 'node:assert/strict';
import type {AppNode} from '../src/types';
import type {Block} from '../src/features/editor/types';
import {insertionTarget} from '../src/features/editor/drag/insertionTarget';
import {canTransferNodeInto,insertTransferredBlocks,planCanvasBlockTransfer} from '../src/features/editor/drag/blockTransferPlan';
import {resolveBlockDragPayload} from '../src/features/editor/drag/blockDragPayload';
import {reorderBlocks} from '../src/features/editor/drag/blockReorder';
let passed=0,failed=0;
function check(name:string,run:()=>void){try{run();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}`,error);}}
const text=(id:string,content=id):Block=>({id,type:'text',content});
const node=(id:string,type='note',content:Block[]=[]):AppNode=>({id,type,position:{x:0,y:0},data:{label:id,content}} as AppNode);
const moving:Block={id:'moving',type:'heading2',content:'**café العربية 😀**',metadata:{name:'Keep metadata'}};
const destination=[text('before'),text('after')];
const nodes=()=>[node('source','block',[moving]),node('target','note',destination)];
const payload=(blocks:Block[],sourceNodeId:unknown='source')=>JSON.stringify({blocks,sourceNodeId});
const units=[{id:'a',top:10,bottom:40},{id:'b',top:60,bottom:90}];
check('the complete gap has exactly one canonical insertion',()=>{
 for(const y of [25,39,40,45,50,59,60,74])assert.deepEqual(insertionTarget(units,y),{blockId:'b',position:'top',index:1,boundary:50});
});
check('first and final boundaries, empty document and immutable geometry',()=>{
 const original=JSON.stringify(units);assert.equal(insertionTarget([],0),null);
 assert.deepEqual(insertionTarget(units,-100),{blockId:'a',position:'top',index:0,boundary:10});
 assert.deepEqual(insertionTarget(units,1000),{blockId:'b',position:'bottom',index:2,boundary:90});assert.equal(JSON.stringify(units),original);
});
check('canvas transfer consumes source once, preserves formatting, IDs and metadata',()=>{
 const input=nodes(),original=JSON.stringify(input),result=planCanvasBlockTransfer(input,[],'source','target','after','top')!;
 assert.deepEqual(result.nodes.map(n=>n.id),['target']);assert.deepEqual(result.nodes[0].data.content,[destination[0],moving,destination[1]]);assert.equal(JSON.stringify(input),original);
});
check('existing fused dimensions survive and a single-block target promotes once',()=>{
 for(const kind of ['block','fused-note']){const target={...node('target',kind,destination),style:{width:610,height:391}};
 const result=planCanvasBlockTransfer([nodes()[0],target],[],'source','target',null,'bottom')!;
 assert.equal(result.nodes[0].type,'fused-note');assert.deepEqual(result.nodes[0].style,kind==='block'?{width:432,height:208}:target.style);}
});
check('whole fused documents retain block order',()=>{
 const result=planCanvasBlockTransfer([node('source','fused-note',[moving,text('second')]),nodes()[1]],[],'source','target','before','top')!;
 assert.deepEqual((result.nodes[0].data.content as Block[]).map(b=>b.id),['moving','second','before','after']);
});
check('empty, missing, stale-slot, unsupported and duplicate-ID moves are refused',()=>{
 assert.equal(planCanvasBlockTransfer(nodes(),[],'source','target','deleted','top'),null);
 assert.equal(planCanvasBlockTransfer([node('source','block'),nodes()[1]],[],'source','target',null,'bottom'),null);
 assert.equal(planCanvasBlockTransfer(nodes(),[],'gone','target',null,'bottom'),null);
 assert.equal(planCanvasBlockTransfer([node('source','note',[moving]),nodes()[1]],[],'source','target',null,'bottom'),null);
 assert.equal(planCanvasBlockTransfer([nodes()[0],node('target','note',[moving])],[],'source','target',null,'bottom'),null);
});
check('self, descendant and malformed ancestor cycles never accept a drop',()=>{
 const parent=node('parent'),child={...node('child'),parentId:'parent'};
 assert(!canTransferNodeInto([parent,child],'parent','parent'));assert(!canTransferNodeInto([parent,child],'parent','child'));
 assert(!canTransferNodeInto([{...parent,parentId:'child'},child,node('other')],'other','child'));
});
check('page children follow the new owner and parents precede children',()=>{
 const child={...node('child'),parentId:'source',extent:'parent' as const};
 const result=planCanvasBlockTransfer([child,...nodes()],[],'source','target',null,'bottom')!;
 assert.deepEqual(result.nodes.map(n=>[n.id,n.parentId]),[['target',undefined],['child','target']]);assert.equal(result.nodes[1].extent,'parent');
});
check('connections follow moved content without self-loops or metadata loss',()=>{
 const edges=[{id:'external',source:'source',target:'other',label:'Keep label',data:{keep:1}},{id:'self',source:'source',target:'target'}];
 const result=planCanvasBlockTransfer([...nodes(),node('other')],edges,'source','target',null,'bottom')!;
 assert.deepEqual(result.edges,[{...edges[0],source:'target'}]);assert.equal(edges[0].source,'source');
});
check('collapsed target insertion stays after its complete hidden branch',()=>{
 const target:Block[]=[{id:'fold',type:'toggle',content:'Folded',metadata:{isCollapsed:true}},{...text('hidden'),indent:1},text('tail')];
 assert.deepEqual(insertTransferredBlocks(target,[moving],'fold','bottom').map(b=>b.id),['fold','hidden','moving','tail']);
});
check('nested editor targets receive content inside the correct container',()=>{
 const target:Block[]=[{id:'container',type:'container',content:'',metadata:{blocks:destination}}];
 const result=insertTransferredBlocks(target,[moving],'after','top');assert.deepEqual(result[0].metadata!.blocks,[destination[0],moving,destination[1]]);assert.equal(target[0].metadata!.blocks,destination);
});
check('deep identity collisions are refused',()=>{
 const target=node('target','note',[{id:'container',type:'container',content:'',metadata:{blocks:[moving]}}]);
 assert.equal(planCanvasBlockTransfer([nodes()[0],target],[],'source','target',null,'bottom'),null);
});
check('payload reads current text and metadata rather than dragstart snapshot',()=>{
 const current={...moving,content:'Latest edit',metadata:{name:'Latest'}};
 assert.deepEqual(resolveBlockDragPayload(payload([moving]),[node('source','note',[current])])!.blocks,[current]);
});
check('selected blocks resolve in document order, including hidden toggle descendants',()=>{
 const branch:Block[]=[{id:'fold',type:'toggle',content:'Fold',metadata:{isCollapsed:true}},{...text('hidden'),indent:1},moving];
 assert.deepEqual(resolveBlockDragPayload(payload([moving,branch[0]]),[node('source','note',branch)])!.blocks,branch);
});
check('nested column selection resolves to its live child list',()=>{
 const root:Block[]=[{id:'columns',type:'columns',content:'',metadata:{columns:[{id:'column',content:[moving]}]}}];
 assert.deepEqual(resolveBlockDragPayload(payload([moving]),[node('source','note',root)])!.blocks,[moving]);
});
check('malformed, duplicate, deleted and stale owner payloads are refused',()=>{
 for(const raw of ['','null','[]','{','{}',payload([]),payload([moving],42),payload([moving,moving]),payload([text('deleted')])])assert.equal(resolveBlockDragPayload(raw,nodes()),null,raw);
 assert.equal(resolveBlockDragPayload(payload([moving]),[]),null);
 assert.equal(resolveBlockDragPayload(JSON.stringify({blocks:[{id:'bad',type:'container',content:'',metadata:{blocks:[null]}}]}),[]),null);
});
check('unowned but well-formed external payloads remain supported',()=>{
 assert.deepEqual(resolveBlockDragPayload(payload([moving],null),[])!.blocks,[moving]);
});
check('large ordered selections avoid JavaScript spread argument limits',()=>{
 const many=Array.from({length:140000},(_,i)=>text(`b${i}`)),target=text('target');
 const result=reorderBlocks([target,...many],many,'target','top');assert.equal(result.length,140001);assert.equal(result[0],many[0]);assert.equal(result[result.length-1],target);
});
console.log(`Block transfer contracts: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
