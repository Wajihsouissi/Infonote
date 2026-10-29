import assert from 'node:assert/strict';
import { computeParentContentUpdate } from '../src/store/contentSync';
import type { AppNode } from '../src/types';
import type { Block } from '../src/features/editor/types';
import { recoverRepeatedContent } from '../src/services/storage/workspace/repeatedContentRecovery';
import { normalizeBlockIds } from '../src/features/editor/document/blockIdentity';

let checks = 0;
function check(name: string, body: () => void) { body(); checks++; console.log(`PASS ${name}`); }
const text: Block = { id: 'text', type: 'text', content: 'Keep this work' };
const blank: Block = { id: 'blank', type: 'text', content: '' };
const parent = (content: Block[]) => ({ id: 'parent', type: 'note', position: { x: 0, y: 0 }, data: { label: 'Saved card', content } }) as AppNode;
const child = (content: Block[]) => ({ id: 'child', type: 'fused-note', parentId: 'parent', position: { x: 0, y: 0 }, data: { content } }) as AppNode;

check('a blank already represented in a child is not appended again during parent sync', () => {
    let nodes = [parent([text, blank]), child([text, blank])];
    for (let i = 0; i < 30; i++) {
        const result = computeParentContentUpdate('parent', nodes)!;
        assert.deepEqual(result.parentContent, [text, blank], `sync ${i} grew a represented blank`);
        assert.equal(result.shouldUpdate, false);
        nodes = [parent(result.parentContent), nodes[1]];
    }
});
check('unrepresented dividers and blanks retain their position and contents', () => {
    const divider: Block = { id: 'divider', type: 'divider', content: '' };
    const tail: Block = { id: 'tail', type: 'text', content: 'Last paragraph' };
    const result = computeParentContentUpdate('parent', [parent([blank, text, divider, tail]), child([text, tail])])!;
    assert.deepEqual(result.parentContent, [blank, text, divider, tail]);
    assert.equal(result.shouldUpdate, false);
});
check('normal repeated objects and distinct equal-valued objects are not compacted', () => {
    assert.equal(recoverRepeatedContent(Array(9999).fill(blank)), null);
    assert.equal(recoverRepeatedContent(Array.from({ length: 10001 }, () => ({ ...blank }))), null);
});
check('the exact reported 33,558,852-entry shape recovers all 4,422 distinct occurrences', () => {
    const source: Block[] = Array(33_558_852).fill(blank);
    for (let i = 0; i < 4421; i++) source[i] = { ...text, id: `paragraph-${i}`, content: `Preserved paragraph ${i}` };
    const result = recoverRepeatedContent(source)!;
    assert.equal(result.content.length, 4422);
    assert.equal(result.recovery.originalLength, source.length);
    assert.equal(result.recovery.runs.length, 4422);
    assert.equal(result.recovery.runs.at(-1)!.count, 33_554_431);
    assert.equal(result.recovery.runs.reduce((sum, run) => sum + run.count, 0), source.length);
    assert.equal(result.content.at(-1), blank);
    assert.equal(source.length, 33_558_852);
    assert.equal(source.at(-1), blank);
    assert.equal(normalizeBlockIds(result.content), result.content);
    assert.equal(recoverRepeatedContent(result.content), null);
});
check('recovery is a lossless portable sequence and preserves small intentional repeats and distinct ID collisions', () => {
    const variant = { ...text, content: 'Different work with the same old ID', metadata: { arbitrary: 'kept' } };
    const source = [text, text, ...Array<Block>(10000).fill(blank), variant];
    const result = recoverRepeatedContent(source)!;
    assert.deepEqual(result.content, [text, text, blank, variant]);
    const portable = JSON.parse(JSON.stringify(result.recovery)) as typeof result.recovery;
    const expanded = portable.runs.flatMap(run => Array<Block>(run.count).fill(run.block));
    assert.deepEqual(expanded, source);
    const normalized = normalizeBlockIds(result.content);
    assert.equal(new Set(normalized.map(block => block.id)).size, 4);
    assert.equal(normalized.at(-1)!.content, variant.content);
    assert.deepEqual(normalized.at(-1)!.metadata, variant.metadata);
});
console.log(`${checks} workspace startup checks passed.`);
