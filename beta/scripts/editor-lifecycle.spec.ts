import assert from 'node:assert/strict';
import { cloneBlocks, decodePayload, encodePayload, payloadBlocks, blocksToHtml, blocksToPlainText, PAYLOAD_ATTR } from '../src/features/clipboard/clipboardPayload';
import { blocksForDrag } from '../src/features/editor/drag/blockReorder';
import { considerAutoFormat, emptyAutoFormatMemory, rememberRevert, revertableConversion } from '../src/features/editor/text/autoFormat';
import { historyEquality } from '../src/store/historyConfig';
import type { Block } from '../src/features/editor/types';
import type { AppNode } from '../src/types';
import { rebasePastedBlocks } from '../src/features/editor/document/pasteBlocks';

let passed=0,failed=0;
function check(name:string,run:()=>void){try{run();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}: ${error instanceof Error?error.message:error}`);}}
const text=(id:string,content=id):Block=>({id,type:'text',content});
const carrier=(value:unknown)=>`<span ${PAYLOAD_ATTR}="${btoa(JSON.stringify(value))}"></span>`;
check('pasted toggle branches inherit the destination depth without changing IDs or metadata',()=>{
    const source:Block[]=[{id:'header',type:'toggle',content:'Header',indent:2,metadata:{isCollapsed:true}},{...text('child'),indent:3}];
    const result=rebasePastedBlocks(source,1);assert.deepEqual(result.map(b=>b.indent),[1,2]);assert.deepEqual(result.map(b=>b.id),['header','child']);
    assert.equal(result[0].metadata,source[0].metadata);assert.deepEqual(source.map(b=>b.indent),[2,3]);assert.equal(rebasePastedBlocks(source,2),source);
});
check('structured clipboard preserves all nested data while replacing every block and column identity',()=>{
    const source:Block[]=[{id:'root',type:'columns',content:'',metadata:{columns:[{id:'column',content:[{id:'container',type:'container',content:'',metadata:{blocks:[{...text('child','**café 😀**'),metadata:{checked:true,arbitrary:{keep:'yes'}}}]}}]}]}}];
    const before=JSON.stringify(source),copy=cloneBlocks(source);
    assert.equal(JSON.stringify(source),before);
    const oldColumn=source[0].metadata!.columns![0],newColumn=copy[0].metadata!.columns![0];
    assert.notEqual(copy[0].id,'root');assert.notEqual(newColumn.id,oldColumn.id);assert.notEqual(newColumn.content[0].id,'container');
    const child=newColumn.content[0].metadata!.blocks![0];assert.notEqual(child.id,'child');assert.equal(child.content,'**café 😀**');assert.deepEqual(child.metadata,{checked:true,arbitrary:{keep:'yes'}});
});
check('collapsed toggle clipboard selection contains its complete branch in document order',()=>{
    const blocks:Block[]=[text('before'),{id:'toggle',type:'toggle',content:'Folded',metadata:{isCollapsed:true}},
        {...text('child'),indent:1},{id:'inner',type:'toggle',content:'Nested',indent:1,metadata:{isCollapsed:true}},{...text('deep'),indent:2},text('after')];
    assert.deepEqual(blocksForDrag(blocks,new Set(['toggle'])).map(b=>b.id),['toggle','child','inner','deep']);
});
check('multi-megabyte multilingual clipboard round-trips without spread argument limits',()=>{
    const source=[text('huge','العربية café 😀 漢字 '.repeat(100000))];
    const encoded=encodePayload({v:1,kind:'blocks',blocks:source},blocksToPlainText(source),blocksToHtml(source));
    const decoded=decodePayload(encoded.html);assert(decoded);const copied=payloadBlocks(decoded)!;
    assert.equal(copied[0].content,source[0].content);assert.notEqual(copied[0].id,'huge');
});
check('fresh paste identities are independent across repeated pastes',()=>{
    const payload={v:1 as const,kind:'blocks' as const,blocks:[text('same')]};
    const first=payloadBlocks(payload)!,second=payloadBlocks(payload)!;assert.notEqual(first[0].id,second[0].id);assert.equal(payload.blocks[0].id,'same');
});
check('non-app HTML, corrupt base64 and unsupported payload versions fall back safely',()=>{
    for(const value of ['',null,'<p>Outside</p>',`<span ${PAYLOAD_ATTR}="%%broken"></span>`,carrier({v:2,kind:'blocks',blocks:[]})])assert.equal(decodePayload(value),null);
});
check('forged internal carriers containing invalid block members are refused before cloning',()=>{
    for(const blocks of [[null],[42],[{}],[{id:'x',type:'text',content:{bad:true}}],[{id:'x',type:'text',content:'valid',metadata:[]}],
        [{id:'x',type:'container',content:'',metadata:{blocks:[null]}}],
        [{id:'x',type:'columns',content:'',metadata:{columns:[null]}}]]) {
        assert.equal(decodePayload(carrier({v:1,kind:'blocks',blocks})),null,JSON.stringify(blocks));
    }
});
check('pathological nested carriers are refused rather than overflowing a recursive clone',()=>{
    let block:Block=text('leaf');for(let i=0;i<256;i++)block={id:`nest-${i}`,type:'container',content:'',metadata:{blocks:[block]}};
    assert.equal(decodePayload(carrier({v:1,kind:'blocks',blocks:[block]})),null);
});
check('normal nested clipboard payloads still retain metadata and remain accepted',()=>{
    let block:Block=text('leaf');for(let i=0;i<32;i++)block={id:`nest-${i}`,type:'container',content:'',metadata:{blocks:[block]}};
    assert(decodePayload(carrier({v:1,kind:'blocks',blocks:[block]})));
});
check('selection, measurement and drag flags alone do not add history steps',()=>{
    const node={id:'n',type:'note',position:{x:0,y:0},data:{content:[text('a')]}} as AppNode;
    const base={nodes:[node],edges:[]};
    assert(historyEquality(base,{nodes:[{...node,selected:true,measured:{width:100,height:80},dragging:true,resizing:true}],edges:[]}));
    assert(!historyEquality(base,{nodes:[{...node,data:{...node.data,content:[text('a','edited')]}}],edges:[]}));
});
check('a completed marker conversion can be reverted once and kept literal while typing',()=>{
    const memory=emptyAutoFormatMemory(),block=text('a');
    assert.equal(considerAutoFormat(memory,block,'# ','insertText').action,'convert');
    const pending=revertableConversion(memory,'a','',0);assert(pending);assert.equal(rememberRevert(memory,pending),'# ');
    assert.equal(considerAutoFormat(memory,block,'# literal','insertText').action,'none');
});
check('history restoration cannot retrigger markdown conversion',()=>{
    assert.equal(considerAutoFormat(emptyAutoFormatMemory(),text('a'),'# ','historyUndo').action,'none');
});
console.log(`Editor lifecycle contracts: ${passed} passed, ${failed} failed`);
if(failed)process.exitCode=1;
