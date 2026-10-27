import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppNode } from '../src/types';
import type { NodesPayload } from '../src/features/clipboard/clipboardPayload';
import { decodePayload } from '../src/features/clipboard/clipboardPayload';
import { buildGraphClipboard, isValidGraphPayload, materializeGraphClipboard } from '../src/features/clipboard/graphClipboard';
import { createStore } from 'zustand';
import { beginHistoryGesture, bindTemporal, endHistoryGesture } from '../src/store/temporalControl';
import { createCoalescingHandleSet, resetHistoryCoalescing, selectionAfterHistory } from '../src/store/historyConfig';
import { createNodeBulkSlice } from '../src/store/slices/nodeBulkSlice';
import type { AppState } from '../src/store/types';

function fixture() {
    return [
        { id: 'parent', type: 'note', position: { x: 100, y: 200 }, data: { label: 'أمّ', content: [{ id: 'page', type: 'page', content: 'Child', metadata: { nodeId: 'child' } }] } },
        { id: 'peer', type: 'note', position: { x: 600, y: 300 }, data: { label: 'Peer', content: [{ id: 'body', type: 'text', content: 'Keep me' }] } },
        { id: 'child', parentId: 'parent', type: 'note', position: { x: 56, y: 112 }, data: { label: 'Child', content: [{ id: 'nested', type: 'toggle', content: 'Toggle', metadata: { items: [{ id: 'deep', type: 'text', content: 'Nested', metadata: { nodeId: 'child' } }] } }] } },
        { id: 'outside', type: 'note', position: { x: 0, y: 0 }, data: { content: [] } },
    ] as AppNode[];
}
const group = () => buildGraphClipboard(fixture(), [
    { id: 'internal', source: 'parent', target: 'peer', label: 'Relationship', style: { stroke: '#aa0000' }, markerEnd: 'arrow', data: { parentId: null, label: 'Custom', routing: { x: 3 } } },
    { id: 'external', source: 'outside', target: 'parent' },
    { id: 'nested-edge', source: 'child', target: 'child', data: { parentId: 'parent' } },
], new Set(['parent', 'peer', 'child']))!;

test('selected ancestors carry descendants exactly once and only internal edges', () => {
    const built = group();
    assert.equal(built.payload.nodes.length, 3);
    assert.deepEqual(built.ids, ['parent', 'peer']);
    assert.equal(built.payload.edges.length, 2);
    assert.equal(built.payload.nodes[2].parentRef, 0);
    assert.equal(built.payload.nodes[2].dx, 56);
    assert.equal(buildGraphClipboard(fixture(), [], new Set()), null);
});

test('UTF-8 transport preserves readable text and the graph through encode/decode', () => {
    const built = group();
    assert.match(built.text, /أمّ/);
    assert.match(built.text, /Keep me/);
    assert.deepEqual(decodePayload(built.html), JSON.parse(JSON.stringify(built.payload)));
    assert.equal(decodePayload('<p>External text</p>'), null);
    assert.equal(decodePayload('<span data-chnkit-clipboard="malformed"></span>'), null);
});

test('paste into a different canvas preserves hierarchy, relative geometry, edge appearance and ownership', () => {
    const copy = materializeGraphClipboard(group().payload, { x: 900, y: 800 }, 'destination')!;
    const [parent, peer, child] = copy.nodes;
    assert.equal(parent.parentId, 'destination');
    assert.equal(peer.parentId, 'destination');
    assert.equal(child.parentId, parent.id);
    assert.deepEqual(parent.position, { x: 900, y: 800 });
    assert.deepEqual(peer.position, { x: 1400, y: 900 });
    assert.deepEqual(child.position, { x: 56, y: 112 });
    assert.deepEqual([...copy.selectedIds], [parent.id, peer.id]);
    assert.equal(copy.edges[0].data?.parentId, 'destination');
    assert.equal(copy.edges[1].data?.parentId, parent.id);
    assert.equal(copy.edges[0].label, 'Relationship');
    assert.deepEqual(copy.edges[0].style, { stroke: '#aa0000' });
    assert.deepEqual(copy.edges[0].data?.routing, { x: 3 });
});

test('fresh node, edge and nested block IDs; references remap recursively; source remains independent', () => {
    const payload = group().payload;
    const saved = JSON.stringify(payload);
    const a = materializeGraphClipboard(payload, { x: 0, y: 0 }, null)!;
    const b = materializeGraphClipboard(payload, { x: 0, y: 0 }, null)!;
    const ids = [...a.nodes, ...a.edges, ...b.nodes, ...b.edges].map(n => n.id);
    assert.equal(new Set(ids).size, ids.length);
    const parentBlocks = (a.nodes[0].data as { content: { id: string; metadata: { nodeId: string } }[] }).content;
    assert.equal(parentBlocks[0].metadata.nodeId, a.nodes[2].id);
    const child = a.nodes[2].data as { content: { metadata: { items: { id: string; metadata: { nodeId: string } }[] } }[] };
    assert.equal(child.content[0].metadata.items[0].metadata.nodeId, a.nodes[2].id);
    assert.notEqual(child.content[0].metadata.items[0].id, 'deep');
    child.content[0].metadata.items[0].metadata.nodeId = 'mutated';
    assert.equal(JSON.stringify(payload), saved);
    assert.notEqual(JSON.stringify(b.nodes), JSON.stringify(a.nodes));
});

test('legacy v1 flat clipboard still pastes as selected roots', () => {
    const payload: NodesPayload = { v: 1, kind: 'nodes', nodes: [{ ref: 0, type: 'note', dx: 1, dy: 2, data: { content: [] } }], edges: [] };
    assert.equal(isValidGraphPayload(payload), true);
    const copy = materializeGraphClipboard(payload, { x: 10, y: 20 }, null)!;
    assert.deepEqual(copy.nodes[0].position, { x: 11, y: 22 });
    assert.equal(copy.selectedIds.size, 1);
});

for (const [name, mutate] of [
    ['duplicate refs', (p: NodesPayload) => { p.nodes[1].ref = p.nodes[0].ref; }],
    ['duplicate source IDs', (p: NodesPayload) => { p.nodes[1].sourceId = p.nodes[0].sourceId; }],
    ['missing parent', (p: NodesPayload) => { p.nodes[0].parentRef = 900; }],
    ['parent cycle', (p: NodesPayload) => { p.nodes[0].parentRef = 2; }],
    ['dangling edge', (p: NodesPayload) => { p.edges[0].target = 900; }],
    ['invalid position', (p: NodesPayload) => { p.nodes[0].dx = Infinity; }],
    ['invalid type', (p: NodesPayload) => { p.nodes[0].type = 'unknown'; }],
] as const) test(`malformed ${name} rejected without graph mutation`, () => {
    const payload = group().payload;
    mutate(payload);
    assert.equal(isValidGraphPayload(payload), false);
    assert.equal(materializeGraphClipboard(payload, { x: 0, y: 0 }, null), null);
});

test('one gesture records its initial graph once, clears Redo and always resumes tracking', () => {
    const before = { nodes: fixture(), edges: [] };
    const history = createStore(() => ({
        pastStates: [before], futureStates: [before], isTracking: true,
        pause: () => history.setState({ isTracking: false }), resume: () => history.setState({ isTracking: true }),
    }));
    bindTemporal(history as unknown as Parameters<typeof bindTemporal>[0]);
    beginHistoryGesture(before);
    assert.equal(history.getState().isTracking, false);
    // A second start cannot overwrite the original snapshot.
    const moved = { nodes: before.nodes.map(n => ({ ...n, position: { x: n.position.x + 50, y: n.position.y } })), edges: [] };
    beginHistoryGesture(moved);
    endHistoryGesture(moved);
    assert.equal(history.getState().pastStates.length, 2);
    assert.deepEqual(history.getState().pastStates[1], before);
    assert.equal(history.getState().futureStates.length, 0);
    assert.equal(history.getState().isTracking, true);
    endHistoryGesture(moved);
    assert.equal(history.getState().pastStates.length, 2);
    beginHistoryGesture(moved);
    endHistoryGesture(moved);
    assert.equal(history.getState().pastStates.length, 2, 'no-op gestures add no history');
});

test('explicit gesture boundaries keep two rapid user actions as separate history steps', () => {
    const saved: number[] = [];
    const record = createCoalescingHandleSet(5)((value: number) => { saved.push(value); });
    record(1); record(2);
    resetHistoryCoalescing();
    record(3);
    assert.deepEqual(saved, [1, 3]);
});

for (const selectionChanged of [false, true]) test(`deletion Undo restores graph/selection consistency${selectionChanged ? ' after a bystander selection' : ''}`, () => {
    const before = fixture().slice(0, 2).map(n => ({ ...n, selected: true }));
    const bystander = { ...fixture()[3], selected: false };
    before.push(bystander);
    const after = [bystander];
    const afterEdges: AppState['edges'] = [];
    const store = createStore<AppState>((set, get, api) => ({
        ...createNodeBulkSlice(set, get, api), nodes: after, edges: afterEdges, currentParentId: null,
        selectedCanvasNodeIds: new Set<string>(),
        setSelectedCanvasNodeIds: ids => set(state => ({ selectedCanvasNodeIds: ids,
            nodes: state.nodes.map(n => ({ ...n, selected: ids.has(n.id) })),
        })),
    } as AppState));
    store.setState({ lastNodeDeletion: { beforeNodes: before, beforeEdges: [], afterNodes: after, afterEdges, message: 'Deleted 2 cards.' } });
    if (selectionChanged) store.getState().setSelectedCanvasNodeIds(new Set([bystander.id]));
    store.getState().undoLastNodeDeletion();
    const state = store.getState();
    assert.equal(state.nodes.length, 3, 'selection-only changes must not invalidate deletion Undo');
    assert.deepEqual([...state.selectedCanvasNodeIds].sort(), state.nodes.filter(n => n.selected).map(n => n.id).sort());
    assert.deepEqual([...state.selectedCanvasNodeIds].sort(), selectionChanged ? [bystander.id] : ['parent', 'peer']);
});

test('history selection excludes hidden/deleted nodes and preserves current visible selection', () => {
    const nodes = fixture().map(n => ({ ...n, selected: true }));
    assert.deepEqual([...selectionAfterHistory(nodes, new Set(['deleted', 'child']), null)], ['parent', 'peer', 'outside']);
    assert.deepEqual([...selectionAfterHistory(nodes, new Set(['peer']), null)], ['peer']);
    assert.deepEqual([...selectionAfterHistory(nodes, new Set(), null, false)], [], 'nonstructural Undo must not undo explicit deselection');
});
