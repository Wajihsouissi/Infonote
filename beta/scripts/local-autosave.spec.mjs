import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { startLocalPersistence } from '../src/services/storage/workspace/localPersistence';
import './storage-hydration.spec.mjs';
import { markPendingEditorWrite, clearPendingEditorWrite, flushPendingEditorWrites } from '../src/services/storage/workspace/pendingEditorWrites';

const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
let passed = 0, failed = 0;
async function check(name, run) {
    const original = { window: globalThis.window, document: globalThis.document, error: console.error };
    let now = 0, id = 0, ready = false;
    const timers = new Map(), handlers = new Map(), jobs = [], requests = [], errors = [];
    const listen = (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); };
    const unlisten = (type, fn) => handlers.get(type)?.delete(fn);
    const loaded = { key: 'anonymous', updatedAt: 1, nodes: [{ id: 'one', type: 'note', position: { x: 0, y: 0 }, data: { label: 'initial', content: [] } }], edges: [] };
    const store = createStore(subscribeWithSelector(set => ({
        nodes: [], edges: [], interactionState: { draggedNodeId: null }, storage: { isLocalDirty: false, localError: null },
        loadGraph: (nodes, edges) => set({ nodes, edges }),
        setLocalDirty: value => set(state => ({ storage: { ...state.storage, isLocalDirty: value } })),
        setLocalError: value => set(state => ({ storage: { ...state.storage, localError: value } })),
        setLocalLastSaved: value => set(state => ({ storage: { ...state.storage, localLastSaved: value } })),
    })));
    globalThis.window = {
        setTimeout: (fn, delay) => { timers.set(++id, { fn, at: now + delay }); return id; },
        clearTimeout: token => timers.delete(token), addEventListener: listen, removeEventListener: unlisten,
    };
    globalThis.document = { visibilityState: 'visible', addEventListener: listen, removeEventListener: unlisten };
    console.error = (...args) => errors.push(args);
    const fixture = globalThis.__autosaveFixture = {
        store, loaded, requests, errors, folderWrites:[],
        save: record => { requests.push(record); return new Promise((resolve, reject) => jobs.push({ resolve, reject })); },
        edit: label => store.setState(state => ({ nodes: state.nodes.map(node => ({ ...node, data: { ...node.data, label } })) })),
        drag: value => store.setState({ interactionState: { draggedNodeId: value } }),
        event: type => { for (const fn of [...(handlers.get(type) ?? [])]) fn({ preventDefault() {} }); },
        tick: async amount => {
            const end = now + amount;
            while (true) {
                const first = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!first) break; now = first[1].at; timers.delete(first[0]); first[1].fn(); await settle();
            }
            now = end; await settle();
        },
        release: async error => { const job = jobs.shift(); assert(job, 'A save must be running'); if (error) job.reject(error); else job.resolve(); await settle(); },
        releaseWithLateFlush: async label => {
            const job = jobs.shift(); assert(job); job.resolve();
            queueMicrotask(() => queueMicrotask(() => { fixture.edit(label); fixture.event('pagehide'); }));
            await settle();
        },
    };
    const stop = startLocalPersistence({ onReady: () => { ready = true; } });
    fixture.stop = stop;
    try {
        await settle(); assert(ready); assert.equal(requests.length, 0);
        await run(fixture); passed++; console.log(`PASS ${name}`);
    } catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
    finally {
        flushPendingEditorWrites();
        stop(); for (let i = 0; jobs.length && i < 30; i++) await fixture.release();
        globalThis.window = original.window; globalThis.document = original.document; console.error = original.error;
        delete globalThis.__autosaveFixture;
    }
}

await check('quiet debounce saves the latest graph after 350 ms', async f => {
    f.edit('changed'); await f.tick(349); assert.equal(f.requests.length, 0);
    await f.tick(1); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].nodes[0].data.label, 'changed');
    await f.release(); assert.equal(f.store.getState().storage.isLocalDirty, false);
});
await check('continuous edits reach storage by the maximum 1500 ms deadline', async f => {
    f.edit('start'); for (let i = 0; i < 7; i++) { await f.tick(200); f.edit(`edit-${i}`); }
    await f.tick(100); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].nodes[0].data.label, 'edit-6');
});
await check('slow storage retains one active save and coalesces later requests to the newest graph', async f => {
    f.edit('first'); await f.tick(350);
    for (let i = 0; i < 5; i++) { f.edit(`newest-${i}`); await f.tick(400); }
    assert.equal(f.requests.length, 1, 'Do not queue a graph snapshot per debounce behind a slow write');
    await f.release(); assert.equal(f.requests.length, 2); assert.equal(f.requests[1].nodes[0].data.label, 'newest-4');
    await f.release(); assert.equal(f.store.getState().storage.isLocalDirty, false);
});
await check('a newer edit stays dirty until its own scheduled save finishes', async f => {
    f.edit('first'); await f.tick(350); f.edit('later'); await f.release();
    assert.equal(f.store.getState().storage.isLocalDirty, true);
    await f.tick(350); await f.release(); assert.equal(f.store.getState().storage.isLocalDirty, false);
});
await check('a failed active save still permits the newest requested retry', async f => {
    f.edit('first'); await f.tick(350); f.edit('retry'); await f.tick(350);
    await f.release(new Error('Simulated quota failure'));
    assert.equal(f.store.getState().storage.isLocalDirty, true); assert.equal(f.requests.length, 2);
    await f.release(); assert.equal(f.store.getState().storage.localError, null); assert.equal(f.store.getState().storage.isLocalDirty, false);
});
await check('a debounce started before a drag waits until that drag ends', async f => {
    f.edit('changed'); f.drag('one'); await f.tick(350); assert.equal(f.requests.length, 0);
    f.drag(null); await f.tick(350); assert.equal(f.requests.length, 1); await f.release();
});
await check('page hide forces the final dirty graph to storage even during a drag', async f => {
    f.edit('last'); f.drag('one'); f.event('pagehide'); await settle();
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0].nodes[0].data.label, 'last'); await f.release();
});
await check('teardown captures the newest graph and cancels pending autosave admission', async f => {
    f.edit('first'); await f.tick(350); f.edit('final'); await f.tick(350); f.stop();
    assert.equal(f.requests.at(-1).nodes[0].data.label, 'final');
    await f.release(); await f.tick(2000); assert.equal(f.requests.length, 2);
});
await check('a lifecycle flush in the promise-settlement gap still drains the newest graph', async f => {
    f.edit('first'); await f.tick(350); await f.releaseWithLateFlush('last-microtask');
    assert.equal(f.requests.length, 2); assert.equal(f.requests[1].nodes[0].data.label, 'last-microtask');
    await f.release(); assert.equal(f.store.getState().storage.isLocalDirty, false);
});
await check('a pending editor draft marks the workspace unsaved before its owner debounce', async f => {
    const owner = Symbol('editor');
    markPendingEditorWrite(owner, () => { clearPendingEditorWrite(owner); f.edit('pending draft'); });
    assert.equal(f.store.getState().storage.isLocalDirty, true);
    await f.tick(350);
    assert.equal(f.requests[0].nodes[0].data.label, 'pending draft');
    await f.release(); assert.equal(f.store.getState().storage.isLocalDirty, false);
});
await check('an in-flight save cannot report saved while a newer editor draft is pending', async f => {
    f.edit('first'); await f.tick(350);
    const owner = Symbol('editor');
    markPendingEditorWrite(owner, () => { clearPendingEditorWrite(owner); f.edit('newer draft'); });
    await f.release(); assert.equal(f.store.getState().storage.isLocalDirty, true);
    await f.tick(350);
    assert.equal(f.requests[1].nodes[0].data.label, 'newer draft');
    await f.release(); assert.equal(f.store.getState().storage.isLocalDirty, false);
});
await check('page hide publishes pending editor text before taking its storage snapshot', async f => {
    const owner = Symbol('editor');
    markPendingEditorWrite(owner, () => { clearPendingEditorWrite(owner); f.edit('last pending text'); });
    f.event('pagehide'); await settle();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].nodes[0].data.label, 'last pending text');
    await f.release();
});
await check('clean teardown does not manufacture a new durable revision',async f=>{
    f.stop();await settle();assert.equal(f.requests.length,0);
});
await check('a drag alone becomes dirty and page hide captures it without a prior edit',async f=>{
    f.drag('one');assert.equal(f.store.getState().storage.isLocalDirty,true);
    f.event('pagehide');await settle();assert.equal(f.requests.length,1);await f.release();
    assert.equal(f.store.getState().storage.isLocalDirty,true,'A continuing drag can still move after this snapshot');
    f.drag(null);await f.tick(350);await f.release();assert.equal(f.store.getState().storage.isLocalDirty,false);
});
await check('manual retry commits the latest draft after a failed save',async f=>{
    f.edit('failed');await f.tick(350);await f.release(new Error('Disk full'));assert.equal(f.store.getState().storage.isLocalDirty,true);
    f.edit('newest');f.event('chnk-it-retry-local-save');await settle();assert.equal(f.requests.at(-1).nodes[0].data.label,'newest');
    await f.release();assert.equal(f.store.getState().storage.isLocalDirty,false);assert.equal(f.store.getState().storage.localError,null);
});
await check('an external revision warns without editing or acknowledging the local graph',async f=>{
    f.external('different-key');assert.equal(f.store.getState().storage.localError,null);
    f.external('anonymous');assert.match(f.store.getState().storage.localError,/Another tab/);assert.equal(f.store.getState().storage.isLocalDirty,false);assert.equal(f.requests.length,0);
});
await check('expected stale-writer refusal remains unsaved without an unexpected-error log',async f=>{
    f.edit('stale');await f.tick(350);const error=new Error('Another tab saved newer work');error.name='LocalWorkspaceConflictError';await f.release(error);
    assert.equal(f.store.getState().storage.isLocalDirty,true);assert.match(f.store.getState().storage.localError,/Another tab/);assert.equal(f.errors.length,0);
});
await check('saved timestamps are parseable absolute instants',async f=>{
    f.edit('timestamp');await f.tick(350);await f.release();assert(Number.isFinite(Date.parse(f.store.getState().storage.localLastSaved)));
});
await check('a failed lifecycle flush cannot clear dirty or claim a successful save',async f=>{
    f.edit('not durable');f.event('pagehide');await settle();await f.release(new Error('Write interrupted'));
    assert.equal(f.store.getState().storage.isLocalDirty,true);assert.match(f.store.getState().storage.localError,/Write interrupted/);assert.equal(f.store.getState().storage.localLastSaved,new Date(1).toISOString());
});
await check('folder autosave receives only a browser-accepted generation',async f=>{
    f.edit('refused');await f.tick(350);assert.equal(f.folderWrites.length,0);const conflict=new Error('Newer revision');conflict.name='LocalWorkspaceConflictError';await f.release(conflict);assert.equal(f.folderWrites.length,0);
    f.edit('accepted');f.event('chnk-it-retry-local-save');await settle();assert.equal(f.folderWrites.length,0);await f.release();assert.equal(f.folderWrites.length,1);assert.equal(f.folderWrites[0].nodes[0].data.label,'accepted');
});
console.log(`${passed} local autosave checks passed; ${failed} failed.`);
if (failed) process.exitCode = 1;
