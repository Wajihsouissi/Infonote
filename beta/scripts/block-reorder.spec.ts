import assert from 'node:assert/strict';
import { blocksForDrag, blockDropPosition, reorderBlocks, transferWithinDocument, removeBlockIdsDeep, moveBlocksByOne } from '../src/features/editor/drag/blockReorder';
import type { Block } from '../src/features/editor/types';

const b = (id: string, extra: Partial<Block> = {}): Block => ({id,type:'text',content:`${id} — مرحبا café 😀`,...extra});
const ids = (blocks: Block[]) => blocks.map(block => block.id);
let checks = 0;
function check(name: string, body: () => void) { body(); checks++; console.log(`PASS ${name}`); }
const source = [b('a'),b('b'),b('c'),b('d')];

check('whole upper and lower halves resolve at arbitrary canvas zoom', () => {
    for (const scale of [0.35,0.8,1,1.75,2]) {
        const rect = {top:78,height:80*scale};
        assert.equal(blockDropPosition(rect.top+rect.height*0.25,rect),'top');
        assert.equal(blockDropPosition(rect.top+rect.height*0.75,rect),'bottom');
    }
});
check('edge and midpoint decisions remain deterministic', () => {
    const box={top:100,height:20};
    for (const y of [0,99,100,109.99]) assert.equal(blockDropPosition(y,box),'top');
    for (const y of [110,115,120,200]) assert.equal(blockDropPosition(y,box),'bottom');
});
check('only compatible media exposes the center merge zone', () => {
    const box={top:100,height:100};
    assert.equal(blockDropPosition(110,box,true),'top');
    assert.equal(blockDropPosition(120,box,true),'center');
    assert.equal(blockDropPosition(180,box,true),'center');
    assert.equal(blockDropPosition(190,box,true),'bottom');
    assert.equal(blockDropPosition(150,box,false),'bottom');
});
check('single move up preserves object identity, content and source input', () => {
    const next=reorderBlocks(source,[source[3]],'b','top');
    assert.deepEqual(ids(next),['a','d','b','c']); assert.equal(next[1],source[3]);
    assert.deepEqual(ids(source),['a','b','c','d']);
});
check('single move down accounts for removal before the target', () => {
    assert.deepEqual(ids(reorderBlocks(source,[source[0]],'c','bottom')),['b','c','a','d']);
});
check('contiguous multi-selection keeps document order', () => {
    const moving=blocksForDrag(source,new Set(['b','a']));
    assert.deepEqual(ids(moving),['a','b']);
    assert.deepEqual(ids(reorderBlocks(source,moving,'d','bottom')),['c','d','a','b']);
});
check('noncontiguous selection gathers in document order', () => {
    const moving=blocksForDrag(source,new Set(['d','b']));
    assert.deepEqual(ids(reorderBlocks(source,moving,'a','top')),['b','d','a','c']);
});
check('selected target, own target and missing target are no-ops', () => {
    assert.equal(reorderBlocks(source,[source[1]],'b','bottom'),source);
    assert.equal(reorderBlocks(source,source.slice(0,2),'b','top'),source);
    assert.equal(reorderBlocks(source,[source[1]],'missing','bottom'),source);
    assert.equal(reorderBlocks(source,[],'b','top'),source);
});
check('an already-adjacent insertion does not create a history write', () => {
    assert.equal(reorderBlocks(source,[source[0]],'b','top'),source);
    assert.equal(reorderBlocks(source,[source[2]],'b','bottom'),source);
});
const toggle = [b('a'),b('toggle',{type:'toggle',metadata:{isCollapsed:true}}),b('child',{indent:1}),
    b('nested',{type:'toggle',indent:1}),b('grandchild',{indent:2}),b('d')];
check('collapsed toggle drag includes every descendant once', () => {
    assert.deepEqual(ids(blocksForDrag(toggle,new Set(['toggle','child']))),['toggle','child','nested','grandchild']);
});
check('moving an entire branch preserves descendants and indentation', () => {
    const next=reorderBlocks(toggle,blocksForDrag(toggle,new Set(['toggle'])),'d','bottom');
    assert.deepEqual(ids(next),['a','d','toggle','child','nested','grandchild']);
    assert.deepEqual(next.slice(2).map(block=>block.indent??0),[0,1,1,2]);
});
check('drop after a closed toggle skips its hidden descendants', () => {
    assert.deepEqual(ids(reorderBlocks(toggle,[toggle[5]],'toggle','bottom')),['a','toggle','child','nested','grandchild','d']);
    assert.equal(reorderBlocks(toggle,[toggle[5]],'toggle','bottom'),toggle);
});
check('drop after open toggle enters its body', () => {
    const open=toggle.map(block=>block.id==='toggle'?{...block,metadata:{isCollapsed:false}}:block);
    const next=reorderBlocks(open,[open[5]],'toggle','bottom');
    assert.deepEqual(ids(next),['a','toggle','d','child','nested','grandchild']);
    assert.equal(next[2].indent,1);
});
check('moving out of a toggle follows the destination depth', () => {
    const next=reorderBlocks(toggle,[toggle[2]],'a','top');
    assert.equal(next[0].id,'child'); assert.equal(next[0].indent,0); assert.equal(toggle[2].indent,1);
});
check('moving a nested branch rebases relative indentation', () => {
    const moving=blocksForDrag(toggle,new Set(['nested']));
    const next=reorderBlocks(toggle,moving,'a','top');
    assert.deepEqual(next.slice(0,2).map(block=>[block.id,block.indent??0]),[['nested',0],['grandchild',1]]);
});
check('external insertion preserves target and incoming content without duplicate loss', () => {
    const incoming=b('external',{metadata:{blocks:[b('inside')]}});
    const next=reorderBlocks(source,[incoming],'b','top');
    assert.deepEqual(ids(next),['a','external','b','c','d']); assert.equal(next[1],incoming);
});
check('nested source to parent is atomic and retains its original ID exactly once', () => {
    const child=b('child'), root=[b('a'),b('box',{type:'container',metadata:{blocks:[child,b('kept')]}}),b('d')];
    const next=transferWithinDocument(root,[child],'a','top');
    assert.deepEqual(ids(next),['child','a','box','d']);
    assert.deepEqual(ids(next[2].metadata!.blocks!),['kept']); assert.equal(next[0],child);
    assert.equal(root[1].metadata!.blocks!.length,2);
});
check('parent source to nested destination never publishes duplicate IDs', () => {
    const root=[b('a'),b('box',{type:'container',metadata:{blocks:[b('inside')]}}),b('d')];
    const next=transferWithinDocument(root,[root[0]],'inside','bottom');
    assert.deepEqual(ids(next),['box','d']); assert.deepEqual(ids(next[0].metadata!.blocks!),['inside','a']);
});
check('transfer between columns keeps both column IDs and untouched metadata', () => {
    const moved=b('move'), root=[b('columns',{type:'columns',metadata:{columns:[
        {id:'left',content:[moved,b('left-kept')]},{id:'right',content:[b('right-kept')]}],name:'preserve'}})];
    const next=transferWithinDocument(root,[moved],'right-kept','top');
    assert.deepEqual(next[0].metadata!.columns!.map(column=>[column.id,ids(column.content)]),[['left',['left-kept']],['right',['move','right-kept']]]);
    assert.equal(next[0].metadata!.name,'preserve');
});
check('an ancestor cannot be dropped into its own descendant', () => {
    const root=[b('box',{type:'container',metadata:{blocks:[b('inside')]}}),b('d')];
    assert.equal(transferWithinDocument(root,[root[0]],'inside','top'),root);
    assert.equal(transferWithinDocument(root,[root[0]],'missing','top'),root);
});
check('keyboard movement carries toggle descendants and selection together', () => {
    assert.deepEqual(ids(moveBlocksByOne(toggle,'toggle',new Set(),1)),['a','d','toggle','child','nested','grandchild']);
    assert.deepEqual(ids(moveBlocksByOne(source,'a',new Set(['a','b']),1)),['c','a','b','d']);
    assert.equal(moveBlocksByOne(source,'missing',new Set(),1),source);
    assert.equal(moveBlocksByOne(source,'a',new Set(),-1),source);
});
check('deep removal preserves unrelated branches by reference', () => {
    const root=[b('a'),b('box',{metadata:{blocks:[b('inside')]}})];
    assert.equal(removeBlockIdsDeep(root,new Set(['absent'])),root);
    const next=removeBlockIdsDeep(root,new Set(['inside']));
    assert.equal(next[0],root[0]); assert.deepEqual(next[1].metadata!.blocks,[]);
});
check('all nonempty selection subsets and targets preserve unique identities and text', () => {
    let variants=0;
    for(let mask=1;mask<16;mask++) for(const target of source) for(const position of ['top','bottom'] as const) {
        const selected=source.filter((_,index)=>mask&(1<<index));
        const next=reorderBlocks(source,blocksForDrag(source,new Set(ids(selected))),target.id,position);
        assert.equal(next.length,source.length); assert.equal(new Set(ids(next)).size,source.length);
        assert.deepEqual([...next].sort((a,b)=>a.id.localeCompare(b.id)),source);
        assert.deepEqual(next.filter(block=>selected.includes(block)),selected); variants++;
    }
    assert.equal(variants,120);
});
console.log(`${checks}/${checks} block reorder checks passed`);
