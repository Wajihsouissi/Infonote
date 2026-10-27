import { mkdir, mkdtemp, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { FolderWorkspace } from '../src/services/storage/workspace/FolderWorkspace';
import type { AppNode } from '../src/types';

// Test adapter only: filesystem API semantics on an actual temporary PC folder.
// Headed tests separately exercise native browser streams and permission state.
let order = Promise.resolve();
Object.defineProperty(navigator, 'locks', { value: { request: (_name: string, fn: () => Promise<unknown>) => { const next = order.then(fn); order = next.then(() => undefined, () => undefined); return next; } } });
const output = path.resolve('../output/audits/folder-autosave-2026-10-18');
await mkdir(output, { recursive: true });
const root = await mkdtemp(path.join(output, 'pc-folder-'));
let writes = 0;
const directory = (dir: string): FileSystemDirectoryHandle => ({
    name: path.basename(dir), kind: 'directory',
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => { const p = path.join(dir, name); if (options?.create) await mkdir(p, { recursive: true }); return directory(p); },
    getFileHandle: async (name: string) => ({
        getFile: async () => { try { const bytes = await readFile(path.join(dir, name)); return { text: async () => bytes.toString(), size: bytes.length }; } catch (e) { if ((e as { code: string }).code === 'ENOENT') throw new DOMException('Missing', 'NotFoundError'); throw e; } },
        createWritable: async () => {
            let value = ''; const temp = path.join(dir, `${name}.test-tmp`);
            return { write: async (data: string) => { value = data; }, close: async () => { await writeFile(temp, value); await rename(temp, path.join(dir, name)); writes++; }, abort: async () => { await unlink(temp).catch(() => undefined); } };
        },
    }),
    removeEntry: async (name: string) => unlink(path.join(dir, name)),
} as unknown as FileSystemDirectoryHandle);
const nodes: AppNode[] = Array.from({ length: 160 }, (_, i) => ({ id: `n-${i}`, type: 'note', position: { x: i * 500, y: 0 }, data: { label: `Study ${i}`, content: Array.from({ length: 80 }, (_, j) => ({ id: `b-${i}-${j}`, type: 'text', content: `Evidence ${i}:${j}` })) } }));
const graph = { nodes, edges: [] };
const storage = new FolderWorkspace(directory(root)); await storage.load();
const first = performance.now(); await storage.save(graph); const initialMs = performance.now() - first;
const initialWrites = writes; await storage.save(graph); assert.equal(writes, initialWrites, 'unchanged graph must not rewrite files');
const changed = { ...graph, nodes: nodes.map((n, i) => i === 3 ? { ...n, data: { ...n.data, label: 'Latest evidence' } } as AppNode : n) };
const begin = performance.now(); await storage.save(changed); const editMs = performance.now() - begin;
assert.equal(writes - initialWrites, 3, 'one entity plus previous and current manifest');
const fresh = new FolderWorkspace(directory(root)); assert.deepEqual(await fresh.load(), changed);
const writesForSingleEdit = writes - initialWrites;
for (let i = 0; i < 20; i++) await storage.save({ ...changed, nodes: changed.nodes.map((n, index) => index === 3 ? { ...n, data: { ...n.data, label: `Cycle ${i}` } } as AppNode : n) });
const retainedFiles = (await readdir(path.join(root, 'chnk-it-workspace'))).length;
assert.ok(retainedFiles <= 163, 'normal edit cycles retain only current and previous revisions');
const result = { root, cards: 160, blocks: 12800, initialMs, editMs, writesForSingleEdit, noOpWrites: 0, reload: 'PASS', cycles: 20, retainedFiles };
await writeFile(path.join(root, 'diagnostic-results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
