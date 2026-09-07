import { test, expect } from '../../support/fixtures';
import { openCanvas } from '../../support/canvas';

test('a one-card edit on a large workspace writes only that card and its outbox', async ({ page }, testInfo) => {
    await openCanvas(page);
    const metrics = await page.evaluate(async () => {
        const path = '/src/services/storage/LocalWorkspaceStore.ts';
        const local = await import(path);
        const nodes = Array.from({ length: 1200 }, (_, i) => ({
            id: `large-${i}`, type: 'note', position: { x: i * 10, y: 10 },
            data: { label: `Card ${i}`, content: [{ id: `block-${i}`, type: 'text', content: 'Research notes. '.repeat(300) }] },
        }));
        const record = {
            key: 'large-test', nodes, edges: [], dirtyNodeIds: [], dirtyEdgeIds: [],
            deletedNodeIds: [], deletedEdgeIds: [], cloudRevision: null, cloudHydrated: false,
            updatedAt: Date.now(), lastSyncedAt: null, lastDailyVersionKey: null,
        };
        await local.saveLocalWorkspace(record);
        const fullBytes = new Blob([JSON.stringify(record)]).size;
        const writes: Array<{ store: string; bytes: number }> = [];
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
            if (['workspaces', 'workspace-nodes', 'workspace-edges'].includes(this.name)) {
                writes.push({ store: this.name, bytes: new Blob([JSON.stringify(args[0])]).size });
            }
            return put.apply(this, args);
        };
        const next = [...nodes];
        next[500] = { ...next[500], data: { ...next[500].data, label: 'Changed' } };
        const start = performance.now();
        try { await local.saveLocalWorkspace({ ...record, nodes: next, dirtyNodeIds: ['large-500'] }); }
        finally { IDBObjectStore.prototype.put = put; }
        const saveMs = performance.now() - start;
        const reloaded = await local.loadLocalWorkspace(record.key);
        return {
            fullBytes, writes, saveMs, count: reloaded.nodes.length,
            label: reloaded.nodes[500].data.label, pending: reloaded.dirtyNodeIds,
        };
    });
    await testInfo.attach('save-size-and-timing', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    expect(metrics.count).toBe(1200);
    expect(metrics.label).toBe('Changed');
    expect(metrics.pending).toEqual(['large-500']);
    expect(metrics.writes.filter((item) => item.store === 'workspace-nodes')).toHaveLength(1);
    expect(metrics.writes.filter((item) => item.store === 'workspace-edges')).toHaveLength(0);
    expect(metrics.writes.reduce((sum, item) => sum + item.bytes, 0)).toBeLessThan(metrics.fullBytes / 100);
});

test('legacy graphs migrate without duplicate snapshots, and failed commits stay atomic', async ({ page }) => {
    await openCanvas(page);
    const result = await page.evaluate(async () => {
        const path = '/src/services/storage/LocalWorkspaceStore.ts';
        const local = await import(path);
        const nodes = [{ id: 'legacy-note', type: 'note', position: { x: 0, y: 0 }, data: { label: 'Original', content: [] } }];
        const record = {
            key: 'legacy-test', nodes, edges: [], syncedNodes: nodes, syncedEdges: [],
            dirtyNodeIds: ['legacy-note'], deletedNodeIds: [], dirtyEdgeIds: [], deletedEdgeIds: [],
        };
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('infonote-local-workspaces');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('workspaces', 'readwrite');
            tx.objectStore('workspaces').put(record);
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
        });
        db.close();
        const old = await local.loadLocalWorkspace(record.key);
        await local.saveLocalWorkspace(old);
        const migrated = await local.loadLocalWorkspace(record.key);
        const changed = { ...migrated, nodes: [{ ...nodes[0], data: { label: 'New value', content: [] } }] };
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
            if (this.name === 'workspaces') throw new DOMException('Disk full', 'QuotaExceededError');
            return put.apply(this, args);
        };
        let failed = false;
        try { await local.saveLocalWorkspace(changed); } catch { failed = true; }
        finally { IDBObjectStore.prototype.put = put; }
        const afterFailure = await local.loadLocalWorkspace(record.key);
        await local.saveLocalWorkspace(changed);
        const afterRetry = await local.loadLocalWorkspace(record.key);
        await local.saveLocalWorkspace({ ...changed, nodes: [], deletedNodeIds: ['legacy-note'], dirtyNodeIds: [] });
        const afterDelete = await local.loadLocalWorkspace(record.key);
        return { failed, migrated, afterFailure, afterRetry, afterDelete };
    });
    expect(result.failed).toBe(true);
    expect(result.migrated).not.toHaveProperty('syncedNodes');
    expect(result.migrated.dirtyNodeIds).toEqual(['legacy-note']);
    expect(result.afterFailure.nodes[0].data.label).toBe('Original');
    expect(result.afterRetry.nodes[0].data.label).toBe('New value');
    expect(result.afterDelete.nodes).toEqual([]);
    expect(result.afterDelete.deletedNodeIds).toEqual(['legacy-note']);
});

test('a folder backup restores attachment bytes into a fresh local asset store', async ({ page }) => {
    await openCanvas(page);
    const result = await page.evaluate(async () => {
        const storagePath = '/src/services/FileSystemStorage.ts';
        const assetsPath = '/src/services/assets/assetStore.ts';
        const { FileSystemStorage } = await import(storagePath);
        const assets = await import(assetsPath);
        const bytes = new Uint8Array(1024 * 1024).fill(37);
        const asset = await assets.putAsset(new File([bytes], 'research.pdf', { type: 'application/pdf' }));
        const nodes = [{
            id: 'attachment-note', type: 'note', position: { x: 0, y: 0 },
            data: { label: 'Research', content: [{ id: 'file-block', type: 'file', content: `asset:${asset.id}` }] },
        }];
        // OPFS belongs to this fresh test context. No user folder picker or
        // real filesystem directory is touched by this fixture.
        const root = await navigator.storage.getDirectory();
        const folder = await root.getDirectoryHandle('save-repair-test', { create: true });
        const storage = new FileSystemStorage();
        Object.assign(storage, { directoryHandle: folder });
        await storage.saveData(nodes, []);
        const graphFile = await (await folder.getFileHandle('nodes.json')).getFile();
        await assets.deleteAsset(asset.id);
        const restoredGraph = await storage.loadData();
        const restoredAsset = await assets.getAsset(asset.id);
        return {
            graphBytes: graphFile.size, graph: restoredGraph.nodes,
            assetName: restoredAsset.name, assetBytes: restoredAsset.size,
            correctBytes: new Uint8Array(await restoredAsset.blob.arrayBuffer()).every((value) => value === 37),
        };
    });
    expect(result.graphBytes).toBeLessThan(1000);
    expect(result.graph[0].data.label).toBe('Research');
    expect(result.assetName).toBe('research.pdf');
    expect(result.assetBytes).toBe(1024 * 1024);
    expect(result.correctBytes).toBe(true);
});

test('an empty folder cannot erase the canvas and disconnect cannot mark it saved', async ({ page }) => {
    await openCanvas(page);
    const result = await page.evaluate(async () => {
        const managerPath = '/src/services/StorageManager.ts';
        const storagePath = '/src/services/FileSystemStorage.ts';
        const { fileSystemStorage } = await import(storagePath);
        const manager = await import(managerPath);
        const { __appStore: store } = window as unknown as { __appStore: { getState(): import('../../../src/store/types').AppState } };
        const before = store.getState().nodes.map((node) => node.id);
        fileSystemStorage.reconnect = async () => true;
        fileSystemStorage.loadData = async () => null;
        const connected = await manager.connectBackend('filesystem', {
            getState: store.getState, loadGraph: store.getState().loadGraph,
            setStorageStatus: store.getState().setStorageStatus, mode: 'load',
        });
        store.getState().setLocalDirty(true);
        store.getState().setLocalError('Local write is still pending');
        await manager.disconnectBackend(store.getState().setStorageStatus);
        return {
            before, after: store.getState().nodes.map((node) => node.id), connected,
            dirty: store.getState().storage.isLocalDirty, error: store.getState().storage.localError,
        };
    });
    expect(result.connected.success).toBe(false);
    expect(result.after).toEqual(result.before);
    expect(result.dirty).toBe(true);
    expect(result.error).toBe('Local write is still pending');
});
