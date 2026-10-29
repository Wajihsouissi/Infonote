import assert from 'node:assert/strict';
import { buildRenderTree, createRenderTreeBuilder, isHiddenByCollapsedToggle, visibleBlockNeighbour } from '../src/features/editor/document/blockTree';
import { buildTOCTree } from '../src/services/tocService';
import { parsePlainText } from '../src/features/editor/text/parsePlainText';
import { normalizeHex, hexToRgb, rgbToHex } from '../src/features/editor/blocks/color/colorUtils';
import { buildGraphClipboard, materializeGraphClipboard } from '../src/features/clipboard/graphClipboard';
import type { Block } from '../src/features/editor/types';
import type { AppNode } from '../src/types';
import { codeOutdent } from '../src/features/editor/blocks/code/codeOutdent';
import { groupCanvasRoots } from '../src/features/editor/document/canvasBlockGroups';
import { serializeInline } from '../src/features/editor/text/inlineFormat';

let passed = 0, failed = 0;
function check(name: string, run: () => void) {
    try { run(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`); }
}
const b = (id: string, type: Block['type'], content = id, indent = 0, metadata?: Block['metadata']): Block => ({ id, type, content, indent, metadata });
const owner = (blocks: Block[]): AppNode => ({ id: 'owner', type: 'note', position: { x: 0, y: 0 }, data: { label: 'Document', content: blocks } } as AppNode);

// Minimal DOM shapes captured from the headed code-editor probe. No layout API is involved.
type DomShape = { nodeType: number; nodeValue?: string; tagName?: string; childNodes: DomShape[]; lastChild?: DomShape; getAttribute: () => null };
const textNode = (nodeValue: string): DomShape => ({ nodeType: 3, nodeValue, childNodes: [], getAttribute: () => null });
const element = (tagName: string, ...childNodes: DomShape[]): DomShape => ({ nodeType: 1, tagName, childNodes, lastChild: childNodes.at(-1), getAttribute: () => null });
function domContract(run: () => void) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'Node');
    Object.defineProperty(globalThis, 'Node', { configurable: true, value: { TEXT_NODE: 3, ELEMENT_NODE: 1 } });
    try { run(); } finally { if (previous) Object.defineProperty(globalThis, 'Node', previous); else Reflect.deleteProperty(globalThis, 'Node'); }
}
check('literal code retains Firefox text-node trailing newlines exactly', () => domContract(() => {
    const code = '  const value = "<script>literal</script>";\n\t**raw**\n\n';
    assert.equal(serializeInline(element('div', textNode(code)) as unknown as HTMLElement, true), code);
}));
check('literal code removes Chromium block caret filler without losing its final line', () => domContract(() => {
    const root = element('div', textNode('  first'), element('div', textNode('\tsecond')), element('div', element('br')));
    assert.equal(serializeInline(root as unknown as HTMLElement, true), '  first\n\tsecond\n');
}));
check('rich paragraphs keep their existing trailing-placeholder normalization', () => domContract(() => {
    assert.equal(serializeInline(element('div', textNode('Paragraph\n')) as unknown as HTMLElement), 'Paragraph');
}));

check('nested numbering keeps the outer run and restarts the inner run', () => {
    assert.deepEqual(buildRenderTree([b('a', 'numbered'), b('b', 'numbered', '', 1), b('c', 'numbered', '', 1), b('d', 'numbered')]).map(n => n.listIndex), [1, 1, 2, 2]);
});
check('a paragraph breaks only the numbered run at its own depth', () => {
    assert.deepEqual(buildRenderTree([b('a', 'numbered'), b('b', 'text', '', 1), b('c', 'numbered'), b('d', 'text'), b('e', 'numbered')]).map(n => n.listIndex), [1, undefined, 2, undefined, 1]);
});
check('a canvas continuation starts from its supplied ordinal', () => {
    assert.deepEqual(buildRenderTree([b('a', 'numbered'), b('b', 'numbered')], 7).map(n => n.listIndex), [7, 8]);
});
check('sibling toggles keep separate descendants', () => {
    const tree = buildRenderTree([b('a', 'toggle'), b('a1', 'text', '', 1), b('b', 'toggle'), b('b1', 'text', '', 1)]);
    assert.deepEqual(tree.map(n => [n.block.id, n.children.map(c => c.block.id)]), [['a', ['a1']], ['b', ['b1']]]);
});
check('a collapsed toggle never hides the next open sibling', () => {
    const blocks = [b('a', 'toggle', '', 0, { isCollapsed: true }), b('a1', 'text', '', 1), b('b', 'toggle'), b('b1', 'text', '', 1)];
    assert.deepEqual(blocks.map((_, i) => isHiddenByCollapsedToggle(blocks, i)), [false, true, false, false]);
    assert.equal(visibleBlockNeighbour(blocks, 0, 'next'), 2);
    assert.equal(visibleBlockNeighbour(blocks, 2, 'previous'), 0);
});
check('nested collapse hides only the nested branch', () => {
    const blocks = [b('a', 'toggle'), b('inner', 'toggle', '', 1, { isCollapsed: true }), b('hidden', 'text', '', 2), b('visible', 'text', '', 1)];
    assert.deepEqual(blocks.map((_, i) => isHiddenByCollapsedToggle(blocks, i)), [false, false, true, false]);
});
check('render memo retains old snapshots and untouched branches', () => {
    const build = createRenderTreeBuilder();
    const initial = [b('a', 'toggle'), b('a1', 'text', 'Old', 1), b('b', 'text', 'Unchanged')];
    const first = build(initial), second = build([initial[0], { ...initial[1], content: 'New' }, initial[2]]);
    assert.equal(first[0].children[0].block.content, 'Old');
    assert.equal(second[0].children[0].block.content, 'New');
    assert.equal(first[1], second[1]);
});
check('outline nests H2 under H1 and H3 under H2 without losing body text', () => {
    const node = owner([b('h1', 'heading1'), b('h2', 'heading2'), b('h3', 'heading3'), b('body', 'text', 'عربي café')]);
    const h1 = buildTOCTree(null, [node])[0].children[0];
    assert.equal(h1.headingLevel, 1);
    assert.equal(h1.children[0].headingLevel, 2);
    assert.equal(h1.children[0].children[0].headingLevel, 3);
    assert.equal(h1.children[0].children[0].children[0].label, 'عربي café');
});
check('toggle headings retain their heading level in the generated outline', () => {
    const node = owner([b('h1', 'heading1'), b('toggle-h2', 'toggle', 'Section', 0, { toggleHeaderLevel: 2 }), b('child', 'text', 'Inside', 1), b('h3', 'heading3')]);
    const toggle = buildTOCTree(null, [node])[0].children[0].children[0];
    assert.equal(toggle.headingLevel, 2);
    assert.equal(toggle.children.find(c => c.id === 'h3')?.headingLevel, 3);
});
check('dividers never create outline ideas even if conversion retained hidden text', () => {
    const tree = buildTOCTree(null, [owner([b('line', 'divider', 'Old invisible text'), b('body', 'text', 'Visible')])]);
    assert.deepEqual(tree[0].children.map(c => c.id), ['body']);
});
check('plain-text import preserves literal fenced code whitespace and symbols', () => {
    const text = '  <script>x()</script>\n\t**literal**\n';
    const parsed = parsePlainText('```javascript\n' + text + '```');
    assert.equal(parsed[0].type, 'code');
    assert.equal(parsed[0].content, text.slice(0, -1));
});
check('plain-text import recognizes heading levels and structural markers', () => {
    const parsed = parsePlainText('# One\n## Two\n### Three\n* Item\n1. First\n1. Second\n[] Task\n> Quote\n---');
    assert.deepEqual(parsed.map(x => x.type), ['heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'numbered', 'todo', 'quote', 'divider']);
    assert.equal(parsed[5].metadata?.listNumber, 2);
});
check('hex normalization and RGB round trips preserve supported colors', () => {
    assert.equal(normalizeHex(' abc '), '#AABBCC');
    for (const hex of ['#000000', '#FFFFFF', '#112233', '#FF8800']) {
        const { r, g, b } = hexToRgb(hex); assert.equal(rgbToHex(r, g, b), hex);
    }
});
check('canvas graph copy keeps structural metadata and independent block identities', () => {
    const content = [b('toggle', 'toggle', 'Title', 0, { isCollapsed: true, toggleHeaderLevel: 2 }), b('task', 'todo', 'Task', 1, { checked: true }), b('code', 'code', '  literal\n', 1, { language: 'javascript' })];
    const source = owner(content), original = structuredClone(source);
    const payload = buildGraphClipboard([source], [], new Set(['owner']))!;
    const pasted = materializeGraphClipboard(payload.payload, { x: 100, y: 200 }, null)!;
    const copied = pasted.nodes[0].data.content as Block[];
    assert.deepEqual(copied.map(x => [x.type, x.content, x.metadata]), content.map(x => [x.type, x.content, x.metadata]));
    assert.ok(copied.every((x, i) => x.id !== content[i].id));
    assert.deepEqual(source, original);
});
check('code outdent removes leading spaces when the caret is after a word', () => {
    assert.deepEqual(codeOutdent('  next', 6), { start: 0, end: 2, caret: 4 });
    assert.deepEqual(codeOutdent('first\n  next', 12), { start: 6, end: 8, caret: 10 });
});
check('code outdent handles tabs, browser nonbreaking spaces and a caret inside indent', () => {
    assert.deepEqual(codeOutdent('\tnext', 5), { start: 0, end: 1, caret: 4 });
    assert.deepEqual(codeOutdent('\u00a0\u00a0next', 6), { start: 0, end: 2, caret: 4 });
    assert.deepEqual(codeOutdent('  next', 1), { start: 0, end: 2, caret: 0 });
    assert.equal(codeOutdent('next  word', 10), null);
});
check('canvas paste groups root blocks without splitting toggle descendants or mutating input', () => {
    const blocks = [b('t', 'toggle', 'Toggle', 2), b('c', 'text', 'Child', 3), b('q', 'quote', 'Quote', 2)];
    const initial = structuredClone(blocks), groups = groupCanvasRoots(blocks);
    assert.deepEqual(groups.map(g => g.map(x => [x.id, x.indent])), [[['t', 0], ['c', 1]], [['q', 0]]]);
    assert.deepEqual(blocks, initial);
});
console.log(`${passed} structural block contracts passed; ${failed} failed.`);
if (failed) process.exitCode = 1;
