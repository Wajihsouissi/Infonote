import assert from 'node:assert/strict';
import { mergePendingDocument, sameDocument } from '../src/features/editor/document/documentMerge';
import { buildRenderTree, createRenderTreeBuilder, isHiddenByCollapsedToggle, visibleBlockNeighbour } from '../src/features/editor/document/blockTree';
import { readTableRows, updateTableCell } from '../src/features/editor/document/tableRows';
import { normalizeTableRows } from '../src/features/editor/text/markdownTables';
import type { Block } from '../src/features/editor/types';
import { encodePayload, decodePayload, blocksToPlainText, blocksToHtml } from '../src/features/clipboard/clipboardPayload';
import { patchReadingBlock } from '../src/features/editor/document/patchReadingBlock';
import { normalizeBlockIds } from '../src/features/editor/document/blockIdentity';

const block = (id: string, content = id): Block => ({ id, content, type: 'text' });
const ids = (blocks: Block[]) => blocks.map(b => b.id);
let checks = 0;
function check(name: string, body: () => void) { body(); checks++; console.log(`PASS ${name}`); }

check('valid block identities retain the original arrays, blocks and metadata', () => {
    const source: Block[] = [{ ...block('parent'), metadata: { blocks: [block('child')], arbitrary: { untouched: true } } }, block('other')];
    assert.equal(normalizeBlockIds(source), source);
});
check('every duplicate occurrence survives with a unique identity and unchanged contents', () => {
    const source = Array.from({ length: 48 }, (_, i) => block('same', `Preserved ${i}`));
    const next = normalizeBlockIds(source);
    assert.equal(next[0], source[0]);
    assert.equal(new Set(ids(next)).size, source.length);
    assert.deepEqual(next.map(({ id: _id, ...rest }) => rest), source.map(({ id: _id, ...rest }) => rest));
    assert(source.every(item => item.id === 'same'));
    assert.equal(normalizeBlockIds(next), next);
    assert.equal(normalizeBlockIds(source), next, 'publishing and rendering the same immutable input share repaired identities');
});
check('nested galleries, containers, columns and legacy children repair collisions without losing metadata', () => {
    const source: Block[] = [{ ...block('same'), metadata: {
        blocks: [block('same', 'container')], content: [block('same', 'legacy content')],
        items: [{ ...block('same', 'asset:kept'), metadata: { width: 120, arbitrary: 'preserved' } }],
        columns: [{ id: 'column', content: [block('same', 'first column')] }, { id: 'column', content: [block('same', 'second column')] }],
    } }];
    const next = normalizeBlockIds(source), metadata = next[0].metadata!;
    const children = [next[0], ...metadata.blocks!, ...(metadata.content as Block[]), ...metadata.items!, ...metadata.columns!.flatMap(column => column.content)];
    assert.equal(new Set(ids(children)).size, children.length);
    assert.equal(new Set(metadata.columns!.map(column => column.id)).size, 2);
    assert.equal(metadata.items![0].content, 'asset:kept');
    assert.deepEqual(metadata.items![0].metadata, source[0].metadata!.items![0].metadata);
    assert.equal(normalizeBlockIds(next), next);
});
check('missing identities are assigned while unrelated sibling references remain unchanged', () => {
    const source = [{ ...block(''), metadata: { blocks: [block('')] } }, block('retained')];
    const next = normalizeBlockIds(source);
    assert.equal(next[1], source[1]); assert(next[0].id); assert(next[0].metadata!.blocks![0].id);
    assert.notEqual(next[0].id, next[0].metadata!.blocks![0].id);
});

check('a reading action updates nested content without replacing unrelated blocks or metadata', () => {
    const child: Block = { ...block('task'), type: 'todo', metadata: { checked: false } };
    const parent: Block = { ...block('columns'), type: 'columns', metadata: { columns: [{ id: 'column', content: [child] }] } };
    const sibling = block('untouched');
    const source = [parent, sibling];
    const next = patchReadingBlock(source, child.id, { metadata: { ...child.metadata, checked: true } });
    assert.equal(next[1], sibling);
    assert.equal(next[0].metadata?.columns?.[0].content[0].metadata?.checked, true);
    assert.equal(child.metadata?.checked, false);
    assert.equal(patchReadingBlock(source, 'removed', { content: 'stale action' }), source);
});

check('large multilingual clipboard payloads round trip beyond engine argument limits', () => {
    const blocks = Array.from({ length: 2000 }, (_, i) => block(String(i), `Evidence ${i}: ملاحظة بحث — données vérifiées. `.repeat(5)));
    const payload = { v: 1 as const, kind: 'blocks' as const, blocks };
    const encoded = encodePayload(payload, blocksToPlainText(blocks), blocksToHtml(blocks));
    assert.deepEqual(decodePayload(encoded.html), payload);
    assert.ok(encoded.text.includes('Evidence 1999: ملاحظة بحث'));
});
check('canonical delimiter-looking table content survives external clipboard formats', () => {
    const table: Block = { id: 'canonical', type: 'table', content: '', metadata: {
        tableRowsVersion: 1, rows: [['Name', 'Value'], ['---', '---']],
    } };
    assert.ok(blocksToPlainText([table]).includes('---\t---'));
    assert.match(blocksToHtml([table]), /---<\/td>/);
});

check('typing retains unrelated render branches without changing older snapshots', () => {
    const build = createRenderTreeBuilder();
    const blocks: Block[] = [{ ...block('toggle'), type: 'toggle' }, { ...block('child'), indent: 1 }, block('sibling')];
    const old = build(blocks);
    const next = build([blocks[0], { ...blocks[1], content: 'edited' }, blocks[2]]);
    assert.equal(next[1], old[1]);
    assert.equal(next[0].block, old[0].block);
    assert.equal(old[0].children[0].block.content, 'child');
    assert.equal(next[0].children[0].block.content, 'edited');
    assert.notEqual(next[0], old[0]);
});
check('structural edits and revisited snapshots produce the complete current tree', () => {
    const build = createRenderTreeBuilder();
    const a: Block[] = [{ ...block('a'), type: 'numbered' }, { ...block('b'), type: 'numbered' }];
    assert.deepEqual(build(a, 4).map(n => n.listIndex), [4, 5]);
    const next = [{ ...a[0], type: 'toggle' as const }, { ...a[1], indent: 1 }, block('c')];
    assert.deepEqual(build(next), buildRenderTree(next));
    assert.deepEqual(build(a, 9), buildRenderTree(a, 9));
    assert.deepEqual(build([a[1]]), buildRenderTree([a[1]]));
});
check('cell updates retain untouched rows, accept literal delimiter text and repair external tables', () => {
    const external = [['Name', 'Value'], ['legacy'], ['---', '---']];
    const rows = readTableRows(external);
    assert.deepEqual(rows, [['Name', 'Value'], ['legacy', '']]);
    const next = updateTableCell(rows, 1, 0, '---');
    const final = updateTableCell(next, 1, 1, '---');
    assert.equal(final[0], rows[0]);
    assert.deepEqual(readTableRows(final)[1], ['---', '---']);
    assert.deepEqual(readTableRows(JSON.parse(JSON.stringify(final)), true), final);
    assert.equal(updateTableCell(final, 1, 1, '---'), final);
    assert.equal(rows[1][0], 'legacy');
});

check('an incoming deletion is not restored by pending typing', () => {
    const base = [block('a'), block('b'), block('c')];
    const next = mergePendingDocument(base, [{ ...base[0], content: 'typed' }, ...base.slice(1)], [base[0], base[2]]);
    assert.deepEqual(ids(next), ['a', 'c']);
    assert.equal(next[0].content, 'typed');
});
check('an incoming deletion of the edited block still wins', () => {
    const base = [block('a'), block('b')];
    assert.deepEqual(ids(mergePendingDocument(base, [{ ...base[0], content: 'typing' }, base[1]], [base[1]])), ['b']);
});
check('local insertion stays between its neighbours when unrelated content changes', () => {
    const base = [block('a'), block('b'), block('c')];
    const next = mergePendingDocument(base, [base[0], block('new'), base[1], base[2]], [base[0], base[1], { ...base[2], content: 'remote' }]);
    assert.deepEqual(ids(next), ['a', 'new', 'b', 'c']);
    assert.equal(next[3].content, 'remote');
});
check('multiple insertions retain order when their immediate neighbour is deleted', () => {
    const base = [block('a'), block('b'), block('c')];
    assert.deepEqual(ids(mergePendingDocument(base, [base[0], block('x'), block('y'), base[1], base[2]], [base[0], base[2]])), ['a', 'x', 'y', 'c']);
});
check('a local deletion survives a stale incoming snapshot', () => {
    const base = [block('a'), block('b')];
    assert.deepEqual(ids(mergePendingDocument(base, [base[0]], base)), ['a']);
});
check('independent text, type, and metadata changes combine', () => {
    const base: Block[] = [{ ...block('a'), metadata: { textColor: 'red', checked: false } }];
    const local: Block[] = [{ ...base[0], content: 'typed', metadata: { ...base[0].metadata, checked: true } }];
    const incoming: Block[] = [{ ...base[0], type: 'todo', metadata: { ...base[0].metadata, textColor: 'blue' } }];
    assert.deepEqual(mergePendingDocument(base, local, incoming)[0], { ...local[0], type: 'todo', metadata: { textColor: 'blue', checked: true } });
});
check('a same-field conflict preserves the pending local text', () => {
    const base = [block('a')];
    assert.equal(mergePendingDocument(base, [block('a', 'local')], [block('a', 'incoming')])[0].content, 'local');
});
check('incoming order wins when there is no local reorder', () => {
    const base = [block('a'), block('b'), block('c')];
    assert.deepEqual(ids(mergePendingDocument(base, [{ ...base[0], content: 'typed' }, ...base.slice(1)], [base[2], base[0], base[1]])), ['c', 'a', 'b']);
});
check('a local reorder preserves a concurrent incoming insertion', () => {
    const base = [block('a'), block('b'), block('c')];
    assert.deepEqual(ids(mergePendingDocument(base, [base[2], base[0], base[1]], [base[0], block('new'), base[1], base[2]])), ['c', 'a', 'new', 'b']);
});
check('empty incoming documents do not restore old blocks', () => {
    const base = [block('a')];
    assert.deepEqual(mergePendingDocument(base, [block('a', 'typing')], []), []);
});
check('a large merge keeps unchanged blocks by reference', () => {
    const base = Array.from({ length: 10000 }, (_, i) => block(String(i)));
    const local = [...base]; local[5000] = { ...local[5000], content: 'typed' };
    const incoming = [...base]; incoming[7000] = { ...incoming[7000], content: 'incoming' };
    const result = mergePendingDocument(base, local, incoming);
    assert.equal(result.length, 10000);
    assert.equal(result[0], base[0]);
    assert.equal(result[5000], local[5000]);
    assert.equal(result[7000], incoming[7000]);
    assert.ok(sameDocument(result, result.map(b => ({ ...b }))));
});
check('a closed toggle does not hide the next open toggle’s children', () => {
    const blocks: Block[] = [
        { ...block('closed'), type: 'toggle', metadata: { isCollapsed: true } },
        { ...block('hidden'), indent: 1 },
        { ...block('open'), type: 'toggle' },
        { ...block('visible'), indent: 1 },
    ];
    assert.ok(isHiddenByCollapsedToggle(blocks, 1));
    assert.ok(!isHiddenByCollapsedToggle(blocks, 3));
    assert.equal(buildRenderTree(blocks)[1].children[0].block.id, 'visible');
    assert.equal(visibleBlockNeighbour(blocks, 0, 'next'), 2);
    assert.equal(visibleBlockNeighbour(blocks, 3, 'previous'), 2);
});
check('nested closed toggles end at the correct ancestor boundary', () => {
    const blocks: Block[] = [
        { ...block('outer'), type: 'toggle' },
        { ...block('inner'), type: 'toggle', indent: 1, metadata: { isCollapsed: true } },
        { ...block('hidden'), indent: 2 },
        { ...block('sibling'), indent: 1 },
        block('end'),
    ];
    assert.ok(isHiddenByCollapsedToggle(blocks, 2));
    assert.ok(!isHiddenByCollapsedToggle(blocks, 3));
    assert.equal(visibleBlockNeighbour(blocks, 1, 'next'), 3);
});
check('keyboard visibility skips a large closed body without hiding following content', () => {
    const blocks: Block[] = [{ ...block('toggle'), type: 'toggle', metadata: { isCollapsed: true } },
        ...Array.from({ length: 10000 }, (_, i) => ({ ...block(String(i)), indent: 1 })), block('after')];
    assert.equal(visibleBlockNeighbour(blocks, 0, 'next'), blocks.length - 1);
    assert.equal(visibleBlockNeighbour(blocks, blocks.length - 1, 'previous'), 0);
});
check('table normalization preserves unchanged row objects', () => {
    const rows = [['Heading', 'Other'], ['One', 'Two']];
    const next = normalizeTableRows(rows);
    assert.equal(next[0], rows[0]); assert.equal(next[1], rows[1]);
    assert.deepEqual(normalizeTableRows([['A'], ['B', 'C']]), [['A', ''], ['B', 'C']]);
});
console.log(`${checks} editor core checks passed.`);
