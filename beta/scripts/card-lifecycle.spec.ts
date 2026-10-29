import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateNoteLayout, ICON_SIZE, MAX_HEIGHT, MAX_WIDTH, MEDIUM_SIZE, MIN_EXPANDED_SIZE } from '../src/config/layout.ts';
import { collectNodeBranch, remapBlockNodeReferences } from '../src/store/graphHelpers.ts';
import type { AppNode } from '../src/types.ts';
import type { Block } from '../src/features/editor/types.ts';

test('card resize snaps at mode boundaries and clamps expanded dimensions', () => {
    assert.deepEqual(calculateNoteLayout(80, 80), { width: ICON_SIZE, height: ICON_SIZE, mode: 'icon' });
    assert.deepEqual(calculateNoteLayout(151, 151), { width: ICON_SIZE, height: ICON_SIZE, mode: 'icon' });
    assert.deepEqual(calculateNoteLayout(152, 152), { width: MEDIUM_SIZE, height: MEDIUM_SIZE, mode: 'medium' });
    assert.deepEqual(calculateNoteLayout(375, 375), { width: MEDIUM_SIZE, height: MEDIUM_SIZE, mode: 'medium' });
    assert.deepEqual(calculateNoteLayout(376, 376), { width: MIN_EXPANDED_SIZE, height: MIN_EXPANDED_SIZE, mode: 'expanded' });
    assert.deepEqual(calculateNoteLayout(100_000, 100_000), { width: MAX_WIDTH, height: MAX_HEIGHT, mode: 'expanded' });
});

test('branch deletion gathers descendants once while leaving adjacent cards alone', () => {
    const nodes = [
        { id: 'root' }, { id: 'child', parentId: 'root' }, { id: 'sibling' },
        { id: 'grandchild', parentId: 'child' }, { id: 'other-child', parentId: 'root' },
    ] as AppNode[];
    assert.deepEqual(collectNodeBranch(nodes, ['root', 'child']).map((node) => node.id), [
        'root', 'child', 'grandchild', 'other-child',
    ]);
    assert.deepEqual(collectNodeBranch(nodes, ['sibling']).map((node) => node.id), ['sibling']);
});

test('duplicated page metadata remaps nested node links without changing the source', () => {
    const original = [{ id: 'block', type: 'text', content: 'Body', metadata: {
        destination: { nodeId: 'child' }, nested: [{ nodeId: 'outside' }, { nodeId: 'grandchild' }],
    } }] as Block[];
    const copy = remapBlockNodeReferences(original, new Map([
        ['child', 'copy-child'], ['grandchild', 'copy-grandchild'],
    ]));
    assert.deepEqual(copy[0].metadata, {
        destination: { nodeId: 'copy-child' }, nested: [{ nodeId: 'outside' }, { nodeId: 'copy-grandchild' }],
    });
    assert.equal((original[0].metadata as { destination: { nodeId: string } }).destination.nodeId, 'child');
});
