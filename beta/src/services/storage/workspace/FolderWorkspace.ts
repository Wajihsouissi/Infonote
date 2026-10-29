import type { Edge } from '@xyflow/react';
import { isAppNodeType, type AppNode } from '../../../types';
import { nodesEquivalent, edgesEquivalent } from '../../../store/historyConfig';
import { collectNodeAssetIds } from '../../assets/nodeAssetRefs';
import { assetBlob, getAsset, putAssetRecord, type AssetMeta } from '../../assets/assetStore';

export interface FolderGraph { nodes: AppNode[]; edges: Edge[] }
interface Entry { id: string; file: string }
interface Manifest { format: 'chnk-it-folder'; version: 1; commit: string; nodes: Entry[]; edges: Entry[]; assets: Array<AssetMeta & { file: string }> }
const HEAD = 'workspace.json';
const PREVIOUS = 'workspace.previous.json';
const safeFile = (name: string) => /^[a-zA-Z0-9-]+\.(json|bin)$/.test(name);
const missing = (e: unknown) => e instanceof DOMException && e.name === 'NotFoundError';

async function readJSON(dir: FileSystemDirectoryHandle, name: string): Promise<unknown> {
    return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text());
}
async function write(dir: FileSystemDirectoryHandle, name: string, value: string | Blob) {
    const stream = await (await dir.getFileHandle(name, { create: true })).createWritable();
    try { await stream.write(value); await stream.close(); }
    catch (e) { await stream.abort().catch(() => undefined); throw e; }
}
function manifest(value: unknown): Manifest {
    const m = value as Manifest;
    if (!m || m.format !== 'chnk-it-folder' || m.version !== 1 || typeof m.commit !== 'string'
        || ![m.nodes, m.edges, m.assets].every(Array.isArray)
        || [...m.nodes, ...m.edges, ...m.assets].some(e => !e || typeof e.id !== 'string' || !safeFile(e.file))
        || new Set(m.nodes.map(e => e.id)).size !== m.nodes.length || new Set(m.edges.map(e => e.id)).size !== m.edges.length
        || new Set(m.assets.map(e => e.id)).size !== m.assets.length
        || m.assets.some(a => typeof a.size !== 'number' || a.size < 0 || typeof a.mime !== 'string' || typeof a.name !== 'string')) {
        throw new Error('This folder has an unsupported or damaged workspace. Its files were not changed.');
    }
    return m;
}

async function readHead(dir: FileSystemDirectoryHandle): Promise<Manifest | null> {
    let text = '';
    try { text = await (await (await dir.getFileHandle(HEAD)).getFile()).text(); }
    catch (e) { if (!missing(e)) throw e; }
    if (text.trim()) return manifest(JSON.parse(text));
    // A first interrupted createWritable can leave an empty, never-committed
    // pointer. Retry it only when no previous committed revision exists.
    try { await (await dir.getFileHandle(PREVIOUS)).getFile(); }
    catch (e) { if (missing(e)) return null; throw e; }
    throw new Error('The folder commit pointer is missing or empty. Its previous revision is preserved; restore it before saving.');
}

/** Immutable entity files, then one commit pointer. The old pointer stays valid
 * until close succeeds. Failed/conflicting writes never publish a partial graph. */
export class FolderWorkspace {
    private head: Manifest | null = null;
    private previous: Manifest | null = null;
    private base: FolderGraph = { nodes: [], edges: [] };
    private assetsByNode = new Map<AppNode, Set<string>>();
    private data!: FileSystemDirectoryHandle;
    private root: FileSystemDirectoryHandle;
    constructor(root: FileSystemDirectoryHandle) { this.root = root; }
    get commit() { return this.head?.commit ?? null; }
    async load(): Promise<FolderGraph | null> {
        return navigator.locks.request('chnk-it-folder-write', () => this.read());
    }
    private async read(): Promise<FolderGraph | null> {
        this.data = await this.root.getDirectoryHandle('chnk-it-workspace', { create: true });
        const head = await readHead(this.data);
        if (!head) {
            try { await (await this.root.getFileHandle('nodes.json')).getFile(); }
            catch (legacyError) { if (missing(legacyError)) return null; throw legacyError; }
            throw new Error('This is an older workspace folder. Its files were not changed. Import a backup in the current app, then choose a new folder.');
        }
        const load = async <T extends { id: string }>(entries: Entry[]): Promise<T[]> => {
            const values: T[] = [];
            for (const entry of entries) {
                const value = await readJSON(this.data, entry.file) as T;
                if (!value || value.id !== entry.id) throw new Error('A workspace record is missing or damaged. Nothing was overwritten.');
                values.push(value);
            }
            return values;
        };
        const nodes = await load<AppNode>(head.nodes), edges = await load<Edge>(head.edges);
        if (nodes.some(n => !isAppNodeType(n.type) || !n.data || !n.position || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y))
            || edges.some(e => typeof e.source !== 'string' || typeof e.target !== 'string')) throw new Error('The folder contains invalid cards or connections.');
        for (const asset of head.assets) {
            const file = await (await this.data.getFileHandle(asset.file)).getFile();
            if (file.size !== asset.size) throw new Error(`The file “${asset.name}” is incomplete.`);
            if (!(await getAsset(asset.id))) await putAssetRecord({ ...asset, blob: new Blob([file], { type: asset.mime }) });
        }
        try { this.previous = manifest(await readJSON(this.data, PREVIOUS)); } catch { this.previous = null; }
        this.head = head;
        this.base = { nodes, edges };
        return this.base;
    }
    async save(graph: FolderGraph): Promise<void> {
        // One origin-wide lock also protects first-time initialization. Compare
        // the disk commit inside it: a second tab cannot silently overwrite us.
        await navigator.locks.request('chnk-it-folder-write', async () => {
            const disk = await readHead(this.data);
            if ((disk?.commit ?? null) !== this.commit) throw new Error('This folder changed in another tab. Reopen it before saving. Your browser copy is safe.');
            const file = async (value: string | Blob, extension: 'json' | 'bin') => {
                const name = `${crypto.randomUUID()}.${extension}`;
                await write(this.data, name, value); return name;
            };
            const entries = async <T extends { id: string }>(values: T[], old: T[], refs: Entry[], equal: (a: T, b: T) => boolean) => {
                const before = new Map(old.map(v => [v.id, v]));
                const paths = new Map(refs.map(v => [v.id, v.file]));
                const result: Entry[] = [];
                for (const v of values) {
                    const prior = before.get(v.id);
                    result.push({ id: v.id, file: prior && equal(prior, v) && paths.has(v.id) ? paths.get(v.id)! : await file(JSON.stringify(v), 'json') });
                }
                return result;
            };
            const nodes = await entries(graph.nodes, this.base.nodes, this.head?.nodes ?? [], nodesEquivalent);
            const edges = await entries(graph.edges, this.base.edges, this.head?.edges ?? [], edgesEquivalent);
            const assetIds = new Set<string>();
            const nextAssetCache = new Map<AppNode, Set<string>>();
            for (const node of graph.nodes) {
                const ids = this.assetsByNode.get(node) ?? collectNodeAssetIds(node);
                nextAssetCache.set(node, ids); ids.forEach(id => assetIds.add(id));
            }
            const oldAssets = new Map(this.head?.assets.map(a => [a.id, a]) ?? []);
            const assets: Manifest['assets'] = [];
            for (const id of assetIds) {
                const old = oldAssets.get(id);
                if (old) { assets.push(old); continue; }
                const record = await getAsset(id);
                if (!record) throw new Error('An uploaded file is missing. Folder save paused; keep this tab open.');
                const { blob: _blob, bytes: _bytes, ...meta } = record;
                assets.push({ ...meta, file: await file(assetBlob(record), 'bin') });
            }
            const same = (a: Entry[], b: Entry[]) => a.length === b.length && a.every((entry, i) => entry.id === b[i].id && entry.file === b[i].file);
            if (this.head && same(nodes, this.head.nodes) && same(edges, this.head.edges) && same(assets, this.head.assets)) {
                this.base = graph; this.assetsByNode = nextAssetCache;
                return;
            }
            const next: Manifest = { format: 'chnk-it-folder', version: 1, commit: crypto.randomUUID(), nodes, edges, assets };
            if (this.head) await write(this.data, PREVIOUS, JSON.stringify(this.head));
            await write(this.data, HEAD, JSON.stringify(next));
            const obsolete = this.previous;
            this.previous = this.head; this.head = next; this.base = graph; this.assetsByNode = nextAssetCache;
            // Keep the current and previous complete revisions. Never scan
            // or delete unrelated user files; only our known obsolete blobs.
            const retained = new Set([next, this.previous].flatMap(m => m ? [...m.nodes, ...m.edges, ...m.assets].map(e => e.file) : []));
            for (const entry of obsolete ? [...obsolete.nodes, ...obsolete.edges, ...obsolete.assets] : []) {
                if (!retained.has(entry.file)) await this.data.removeEntry(entry.file).catch(() => undefined);
            }
        });
    }
}
