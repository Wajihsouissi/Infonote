import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { createStorageSlice } from '../src/store/slices/storageSlice';
import { nodesEquivalent } from '../src/store/historyConfig';

const node = id => ({ id, type: 'note', position: { x: 0, y: 0 }, data: { label: id, content: [{ id: `block-${id}`, type: 'text', content: `Body ${id}` }] } });
const fixture = nodes => {
    const store = createStore((set, get, api) => ({ ...createStorageSlice(set, get, api), nodes: [], edges: [], reconstructBreadcrumbs() {} }));
    store.getState().loadGraph(nodes, []); return store.getState().nodes;
};
let failures = 0, checks = 0;
function check(name, run) { try { run(); checks++; console.log(`PASS ${name}`); } catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); } }

check('valid saved nodes retain their references through hydration', () => {
    const saved = [node('a'), node('b')], hydrated = fixture(saved);
    assert.equal(hydrated[0], saved[0]); assert.equal(hydrated[1], saved[1]);
});
check('editing one hydrated node changes only one persistence comparison', () => {
    const saved = [node('a'), node('b'), node('c')], hydrated = fixture(saved);
    const edited = hydrated.map(n => n.id === 'a' ? { ...n, data: { ...n.data, label: 'Edited' } } : n);
    assert.equal(edited.filter((n, i) => !nodesEquivalent(saved[i], n)).length, 1);
});
check('legacy string content is converted without mutating the saved input', () => {
    const legacy = { ...node('legacy'), data: { label: 'Legacy', content: 'Preserved original body', custom: 'Retained field' } };
    const [fixed] = fixture([legacy]); assert.equal(fixed.data.content[0].content, legacy.data.content);
    assert.equal(legacy.data.content, 'Preserved original body'); assert.equal(fixed.data.custom, legacy.data.custom);
});
check('malformed content is preserved alongside a corrected body', () => {
    const malformed = { ...node('malformed'), data: { label: 'Malformed', content: { original: 'Retained' } } };
    const [fixed] = fixture([malformed]); assert.equal(fixed.data._lostContent, malformed.data.content);
    assert.deepEqual(fixed.data.content, []); assert.deepEqual(malformed.data.content, { original: 'Retained' });
});
check('identity repair copies only the affected node and preserves all block text', () => {
    const broken = node('broken'); broken.data.content.push({ ...broken.data.content[0], content: 'Second retained block' });
    const valid = node('valid'), hydrated = fixture([broken, valid]);
    assert.notEqual(hydrated[0], broken); assert.equal(hydrated[1], valid);
    assert.equal(new Set(hydrated[0].data.content.map(b => b.id)).size, 2);
    assert.deepEqual(hydrated[0].data.content.map(b => b.content), ['Body broken', 'Second retained block']);
    assert.equal(broken.data.content[0].id, broken.data.content[1].id);
});
console.log(`${checks} storage hydration checks passed; ${failures} failed.`);
if (failures) process.exitCode = 1;
