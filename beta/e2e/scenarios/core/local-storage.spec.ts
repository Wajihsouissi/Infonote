import { test, expect } from '../../support/fixtures';
import { openCanvas } from '../../support/canvas';

/**
 * The browser workspace store (services/storage/LocalWorkspaceStore.ts).
 * Saving is local-only in the beta, so these are the guarantees users' work
 * rests on: a small edit stays cheap on a big workspace, and a failed write
 * never leaves a half-saved workspace behind.
 */

const STORE = '/src/services/storage/workspace/LocalWorkspaceStore.ts';

test('L1 a one-card edit on a large workspace writes only that card', async ({ page }, testInfo) => {
    await openCanvas(page);
    const metrics = await page.evaluate(async (path) => {
        const local = await import(/* @vite-ignore */ path);
        const nodes = Array.from({ length: 1200 }, (_, i) => ({
            id: `large-${i}`, type: 'note', position: { x: i * 10, y: 10 },
            data: { label: `Card ${i}`, content: [{ id: `block-${i}`, type: 'text', content: 'Research notes. '.repeat(300) }] },
        }));
        const record = { key: 'large-test', nodes, edges: [], updatedAt: Date.now() };
        await local.saveLocalWorkspace(record);
        const fullBytes = new Blob([JSON.stringify(record)]).size;

        const writes: Array<{ store: string; bytes: number }> = [];
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
            writes.push({ store: this.name, bytes: new Blob([JSON.stringify(args[0])]).size });
            return put.apply(this, args);
        };
        const next = [...nodes];
        next[500] = { ...next[500], data: { ...next[500].data, label: 'Changed' } };
        const start = performance.now();
        try { await local.saveLocalWorkspace({ ...record, nodes: next }); }
        finally { IDBObjectStore.prototype.put = put; }
        const saveMs = performance.now() - start;

        const reloaded = await local.loadLocalWorkspace(record.key);
        return { fullBytes, writes, saveMs, count: reloaded.nodes.length, label: reloaded.nodes[500].data.label };
    }, STORE);

    await testInfo.attach('save-size-and-timing', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    expect(metrics.count).toBe(1200);
    expect(metrics.label).toBe('Changed');
    expect(metrics.writes.filter((w) => w.store === 'workspace-nodes'), 'only the edited card is rewritten').toHaveLength(1);
    expect(metrics.writes.filter((w) => w.store === 'workspace-edges')).toHaveLength(0);
    expect(metrics.writes.reduce((sum, w) => sum + w.bytes, 0)).toBeLessThan(metrics.fullBytes / 100);
});

test('L2 a failed save leaves the previous workspace intact, and a retry lands', async ({ page }) => {
    await openCanvas(page);
    const result = await page.evaluate(async (path) => {
        const local = await import(/* @vite-ignore */ path);
        const node = (label: string) => ({ id: 'atomic-note', type: 'note', position: { x: 0, y: 0 }, data: { label, content: [] } });
        await local.saveLocalWorkspace({ key: 'atomic-test', nodes: [node('Original')], edges: [], updatedAt: 1 });

        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
            if (this.name === 'workspaces') throw new DOMException('Disk full', 'QuotaExceededError');
            return put.apply(this, args);
        };
        let failed = false;
        try { await local.saveLocalWorkspace({ key: 'atomic-test', nodes: [node('New value')], edges: [], updatedAt: 2 }); }
        catch { failed = true; }
        finally { IDBObjectStore.prototype.put = put; }
        const afterFailure = await local.loadLocalWorkspace('atomic-test');

        await local.saveLocalWorkspace({ key: 'atomic-test', nodes: [node('New value')], edges: [], updatedAt: 3 });
        const afterRetry = await local.loadLocalWorkspace('atomic-test');
        await local.saveLocalWorkspace({ key: 'atomic-test', nodes: [], edges: [], updatedAt: 4 });
        const afterDelete = await local.loadLocalWorkspace('atomic-test');
        return {
            failed,
            afterFailure: afterFailure.nodes[0].data.label,
            afterRetry: afterRetry.nodes[0].data.label,
            afterDelete: afterDelete.nodes.length,
        };
    }, STORE);

    expect(result.failed).toBe(true);
    expect(result.afterFailure, 'a failed save half-wrote the workspace').toBe('Original');
    expect(result.afterRetry).toBe('New value');
    expect(result.afterDelete).toBe(0);
});
