import assert from 'node:assert/strict';
import { MetadataCache, MAX_METADATA_ENTRIES, MAX_METADATA_CACHE_CHARS } from '../src/services/metadata/MetadataCache';
import { fetchMetadata } from '../src/services/metadataService';

let checks = 0;
const item = id => ({ url: `https://cache.test/${id}`, title: `Title ${id}`, description: 'Description', favicon: '', image: '', provider: 'website', isEmbeddable: false });
const fixture = (initial = null) => {
    const timers = [], written = []; let reads = 0, failed = false;
    const cache = new MetadataCache({ read: () => { reads++; return initial; }, write: text => {
        written.push(text); if (failed) throw Error('Quota exceeded');
    }, setTimer: fn => { timers.push(fn); return timers.length; } });
    return { cache, written, timers, fail: () => { failed = true; }, reads: () => reads,
        flush: () => { while (timers.length) timers.shift()(); } };
};
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }

await check('constructing a metadata cache does not read localStorage', () => {
    const f = fixture(); assert.equal(f.reads(), 0); f.cache.get('missing'); f.cache.get('another'); assert.equal(f.reads(), 1);
});
await check('compatible legacy metadata is read without changing storage', () => {
    const value = { ...item('old'), embedUrl: 'https://embed.test/old' };
    const f = fixture(JSON.stringify({ [value.url]: value })); assert.deepEqual(f.cache.get(value.url), value); assert.equal(f.written.length, 0);
});
await check('an oversized legacy cache is skipped, not parsed into an unbounded map or deleted on read', () => {
    const big = { ...item('big'), description: 'x'.repeat(MAX_METADATA_CACHE_CHARS) }, small = item('small');
    const f = fixture(JSON.stringify({ [big.url]: big, [small.url]: small }));
    assert.equal(f.cache.get(small.url), undefined); assert.equal(f.written.length, 0);
});
await check('malformed JSON and malformed cache records remain harmless cache misses', () => {
    const bad = fixture('{broken'); assert.equal(bad.cache.get('missing'), undefined);
    const value = item('valid'); const mixed = fixture(JSON.stringify({ bad: { title: 'bad' }, wrong: value, [value.url]: value }));
    assert.equal(mixed.cache.get('wrong'), undefined); assert.deepEqual(mixed.cache.get(value.url), value);
});
await check('a response burst produces one bounded write and evicts old metadata', () => {
    const f = fixture(); for (let i = 0; i < 1000; i++) { const value = item(i); f.cache.set(value.url, value); }
    assert.equal(f.timers.length, 1); assert.equal(f.written.length, 0); f.flush();
    const saved = JSON.parse(f.written[0]); assert.equal(Object.keys(saved).length, MAX_METADATA_ENTRIES);
    assert(f.written[0].length <= MAX_METADATA_CACHE_CHARS); assert.equal(f.cache.get(item(0).url), undefined);
    assert.deepEqual(f.cache.get(item(999).url), item(999));
});
await check('recently read metadata survives eviction before older entries', () => {
    const f = fixture(); for (let i = 0; i < MAX_METADATA_ENTRIES; i++) f.cache.set(item(i).url, item(i));
    f.cache.get(item(0).url); f.cache.set(item('next').url, item('next'));
    assert.deepEqual(f.cache.get(item(0).url), item(0)); assert.equal(f.cache.get(item(1).url), undefined);
});
await check('the serialized budget applies before the entry-count limit', () => {
    const f = fixture(); for (let i = 0; i < 30; i++) { const value = { ...item(i), description: 'x'.repeat(20_000) }; f.cache.set(value.url, value); }
    f.flush(); assert(f.written[0].length <= MAX_METADATA_CACHE_CHARS); assert(Object.keys(JSON.parse(f.written[0])).length < 30);
});
await check('an oversized response is usable by its caller but not retained in the cache', () => {
    const f = fixture(), value = { ...item('huge'), image: 'x'.repeat(MAX_METADATA_CACHE_CHARS) };
    f.cache.set(value.url, value); assert.equal(f.cache.get(value.url), undefined); f.flush(); assert.equal(f.written[0], '{}');
});
await check('failed fetch results remain memory-only when other metadata is persisted', () => {
    const f = fixture(), failed = { ...item('failed'), error: true }, good = item('good');
    f.cache.set(failed.url, failed, false); assert.equal(f.timers.length, 0); f.cache.set(good.url, good); f.flush();
    assert.deepEqual(f.cache.get(failed.url), failed); assert.equal(JSON.parse(f.written[0])[failed.url], undefined);
});
await check('a quota failure stops repeated writes without disabling memory caching', () => {
    const f = fixture(); f.fail(); f.cache.set(item('first').url, item('first')); f.flush();
    f.cache.set(item('later').url, item('later')); f.flush(); assert.equal(f.written.length, 1); assert.deepEqual(f.cache.get(item('later').url), item('later'));
});
await check('storage access failure does not prevent fresh metadata from being cached in memory', () => {
    const cache = new MetadataCache({ read() { throw Error('Blocked'); }, write() { throw Error('Blocked'); }, setTimer(fn) { fn(); return 1; } });
    cache.set(item('safe').url, item('safe')); assert.deepEqual(cache.get(item('safe').url), item('safe'));
});

await check('the real metadata service shares one fetch for concurrent identical URLs', async () => {
    const original = { storage: globalThis.localStorage, fetch: globalThis.fetch, timer: globalThis.setTimeout };
    let reads = 0, calls = 0; const writes = [], timers = [];
    globalThis.localStorage = { getItem: () => { reads++; return null; }, setItem: (_key, value) => writes.push(value) };
    globalThis.setTimeout = fn => { timers.push(fn); return timers.length; };
    globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ status: 'success', data: { title: 'Shared title' } }) }; };
    try {
        const results = await Promise.all(Array.from({ length: 20 }, () => fetchMetadata('https://shared.cache.test/', 0)));
        assert.equal(calls, 1); assert.equal(reads, 1); assert(results.every(value => value === results[0]));
        assert.equal(writes.length, 0); while (timers.length) timers.shift()(); assert.equal(writes.length, 1);
        await fetchMetadata('https://shared.cache.test/', 0); assert.equal(calls, 1);
        globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ status: 'success', data: { title: 'Large response', description: 'x'.repeat(MAX_METADATA_CACHE_CHARS) } }) }; };
        const value = await fetchMetadata('https://oversized.cache.test/', 0); assert.equal(value.description.length, MAX_METADATA_CACHE_CHARS);
        await fetchMetadata('https://oversized.cache.test/', 0); assert.equal(calls, 3, 'Finished requests must leave the in-flight map');
        while (timers.length) timers.shift()();
    } finally { globalThis.localStorage = original.storage; globalThis.fetch = original.fetch; globalThis.setTimeout = original.timer; }
});
console.log(`${checks} metadata cache checks passed.`);
