import { readFile } from 'node:fs/promises';
import { test, expect } from '../../support/fixtures';
import { openCanvas, nodeById } from '../../support/canvas';
import { readCanvasState, seedCanvasState, type CanvasStateNode } from '../../support/canvasState';

const localPath = '/src/services/storage/workspace/LocalWorkspaceStore.ts';

test('a saved wide canvas opens with deferred readers and fills a focused document in bounded commits', async ({ page }) => {
    await openCanvas(page);
    const notes: CanvasStateNode[] = Array.from({ length: 6 }, (_, index) => ({
        id: `startup-${index}`, type: 'note', position: { x: index % 2 * 5000, y: Math.floor(index / 2) * 4000 },
        style: { width: 432, height: 500 }, data: { label: `Startup ${index}`, viewMode: 'expanded',
            content: Array.from({ length: 300 }, (_, row) => ({ id: `paragraph-${index}-${row}`, type: 'text', content: `Saved evidence ${index}:${row}` })) },
    }));
    (notes[0].data!.content as object[]).push({ id: 'startup-table', type: 'table', content: '', metadata: {
        tableRowsVersion: 1, rows: Array.from({ length: 121 }, (_, row) => Array.from({ length: 8 }, (_, column) => `Cell ${row}:${column}`)),
    } });
    await seedCanvasState(page, notes);
    await page.evaluate(async ({ path, nodes }) => {
        const local = await import(/* @vite-ignore */ path);
        await local.saveLocalWorkspace({ key: local.LOCAL_WORKSPACE_KEY, nodes, edges: [], updatedAt: Date.now() });
    }, { path: localPath, nodes: notes });
    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(6);
    await expect(page.locator('[data-reading-deferred]')).toHaveCount(6);
    await expect(page.locator('[data-reader-text]')).toHaveCount(0);
    const initialElements = await page.locator('body *').count();
    expect(initialElements).toBeLessThan(2500);

    await page.evaluate(() => {
        const probe = { firstBlocks: 0, maxBatch: 0, previous: 0 };
        const observer = new MutationObserver(() => {
            const count = document.querySelectorAll('[data-id="startup-0"] [data-block-id]').length;
            if (count && !probe.firstBlocks) probe.firstBlocks = count;
            probe.maxBatch = Math.max(probe.maxBatch, count - probe.previous); probe.previous = count;
        });
        observer.observe(document.body, { childList: true, subtree: true });
        Object.assign(window, { __readingProbe: { probe, stop: () => observer.disconnect() } });
        window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: ['startup-0'], duration: 0 } }));
        // Frame the document without requesting its live editing surface.
        (window as unknown as { __appStore: { getState(): { setSelectedCanvasNodeIds(ids: Set<string>): void } } }).__appStore.getState().setSelectedCanvasNodeIds(new Set());
    });
    const card = nodeById(page, 'startup-0');
    await expect(card.locator('[data-block-id]')).toHaveCount(301, { timeout: 20000 });
    await expect(card.locator('[data-table-row]')).toHaveCount(968);
    await expect(card.locator('[data-reading-pending]')).toHaveCount(0);
    const batches = await page.evaluate(() => {
        const { probe, stop } = (window as unknown as { __readingProbe: { probe: { firstBlocks: number; maxBatch: number }; stop(): void } }).__readingProbe;
        stop(); return probe;
    });
    expect(batches.firstBlocks).toBeLessThanOrEqual(16);
    expect(batches.maxBatch).toBeLessThanOrEqual(16);
    const state = await readCanvasState(page);
    if (!state) throw new Error('The restored canvas state was not available.');
    expect(state.nodes.reduce((sum, node) => sum + (Array.isArray(node.data?.content) ? node.data.content.length : 0), 0)).toBe(1801);
    await expect(page.locator('[data-chnk-it-block-editor]')).toHaveCount(0);
});

test('recovery exports the saved graph without importing the app or performing autosave writes', async ({ page }) => {
    await openCanvas(page);
    const notes: CanvasStateNode[] = [{ id: 'recovery-note', type: 'note', position: { x: 0, y: 0 }, data: {
        label: 'Saved recovery evidence', content: [{ id: 'kept', type: 'text', content: 'Retained exactly — محفوظ' }],
    } }];
    await seedCanvasState(page, notes);
    await page.evaluate(async ({ path, nodes }) => {
        const local = await import(/* @vite-ignore */ path);
        await local.saveLocalWorkspace({ key: local.LOCAL_WORKSPACE_KEY, nodes, edges: [], updatedAt: 123456 });
    }, { path: localPath, nodes: notes });
    // Finish the seeding document before observing the recovery dependency
    // graph; late lazy imports from that old document are not recovery imports.
    await page.route('**/__recovery_seeded', route => route.fulfill({ contentType: 'text/html', body: '<p>Saved fixture ready</p>' }));
    await page.goto('/__recovery_seeded');
    const requested: string[] = [];
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await page.route('**/src/app/App.tsx', route => route.abort());
    await page.addInitScript(() => {
        const writes = { puts: 0, deletes: 0, getAll: 0 };
        const put = IDBObjectStore.prototype.put, remove = IDBObjectStore.prototype.delete, getAll = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.put = function (...args) { writes.puts++; return put.apply(this, args); };
        IDBObjectStore.prototype.delete = function (...args) { writes.deletes++; return remove.apply(this, args); };
        IDBObjectStore.prototype.getAll = function (...args) { writes.getAll++; return getAll.apply(this, args); };
        const getAllIndex = IDBIndex.prototype.getAll;
        IDBIndex.prototype.getAll = function (...args) { writes.getAll++; return getAllIndex.apply(this, args); };
        Object.assign(window, { __recoveryWrites: writes });
    });
    await page.goto('/recovery');
    await expect(page.getByRole('heading', { name: 'Workspace recovery' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download saved backup' })).toBeEnabled();
    const before = await page.evaluate(() => (window as unknown as { __recoveryWrites: { puts: number; deletes: number; getAll: number } }).__recoveryWrites);
    expect(before).toEqual({ puts: 0, deletes: 0, getAll: 0 });
    expect(requested.filter(path => /CanvasBoard|\/src\/app\/App\.tsx|\/src\/store\/useStore\.ts/.test(path))).toEqual([]);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download saved backup' }).click();
    const file = await (await download).path();
    const backup = JSON.parse(await readFile(file!, 'utf8'));
    expect(backup.format).toBe('chnk-it-backup');
    expect(backup.nodes[0].id).toBe('recovery-note');
    expect(backup.nodes[0].data.content[0].content).toBe('Retained exactly — محفوظ');
    const after = await page.evaluate(() => (window as unknown as { __recoveryWrites: { puts: number; deletes: number; getAll: number } }).__recoveryWrites);
    expect(after.puts).toBe(0); expect(after.deletes).toBe(0); expect(after.getAll).toBe(2);
    await page.screenshot({ path: '../output/audits/canvas-startup-fix-2026-10-19/recovery-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '../output/audits/canvas-startup-fix-2026-10-19/recovery-narrow.png', fullPage: true });
});

test('blocked folder metadata cannot prevent exporting saved browser work', async ({ page }) => {
    await openCanvas(page);
    await page.evaluate(async path => {
        const local = await import(/* @vite-ignore */ path);
        await local.saveLocalWorkspace({ key: local.LOCAL_WORKSPACE_KEY, nodes: [], edges: [], updatedAt: 1 });
    }, localPath);
    await page.addInitScript(() => {
        const open = indexedDB.open.bind(indexedDB);
        indexedDB.open = (name, version) => {
            if (name !== 'chnk-it-folder-binding') return open(name, version);
            const request = new EventTarget() as IDBOpenDBRequest;
            setTimeout(() => request.onblocked?.call(request, new Event('blocked') as IDBVersionChangeEvent), 0);
            return request;
        };
    });
    await page.goto('/recovery');
    await expect(page.getByRole('button', { name: 'Download saved backup' })).toBeEnabled();
    await expect(page.getByText(/Another tab is blocking local storage/)).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download saved backup' }).click();
    const file = await (await download).path();
    const exported = JSON.parse(await readFile(file!, 'utf8'));
    expect(exported.nodes).toEqual([]);
});

test.describe('startup storage failure', () => {
    test.use({ allowConsoleErrors: true });
    test('a timed-out database open rejects and closes a late connection', async ({ page }) => {
        await page.route('**/__storage_deadline', route => route.fulfill({ contentType: 'text/html', body: '<p>Storage deadline contract</p>' }));
        await page.goto('/__storage_deadline');
        await page.clock.install();
        await page.evaluate(async () => {
            const path = '/src/services/storage/openDatabase.ts';
            const { openDatabase } = await import(/* @vite-ignore */ path);
            const request: Record<string, unknown> = {};
            const probe = { closed: 0, request, pending: Promise.resolve('') };
            Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open: () => request } });
            request.result = { close: () => { probe.closed++; } };
            probe.pending = openDatabase('test-only', 1, () => {}).then(() => 'Unexpected success', (error: Error) => error.message);
            Object.assign(window, { __storageDeadline: probe });
        });
        await page.clock.runFor(10001);
        const result = await page.evaluate(async () => {
            const probe = (window as unknown as { __storageDeadline: { closed: number; pending: Promise<string>; request: { onsuccess(): void } } }).__storageDeadline;
            const error = await probe.pending;
            probe.request.onsuccess();
            return { error, closed: probe.closed };
        });
        expect(result.error).toMatch(/taking too long/);
        expect(result.closed).toBe(1);
    });
    test('a failed saved-workspace load does not expose an empty editable canvas', async ({ page }) => {
        await page.addInitScript(() => {
            const open = indexedDB.open.bind(indexedDB);
            indexedDB.open = (name, version) => {
                if (name !== 'infonote-local-workspaces') return open(name, version);
                const request = { error: new DOMException('Saved workspace read failed', 'UnknownError'), onerror: null as ((event: Event) => void) | null };
                setTimeout(() => request.onerror?.(new Event('error')), 0);
                return request as unknown as IDBOpenDBRequest;
            };
        });
        await page.goto('/canvas');
        await expect(page.getByRole('heading', { name: 'Your workspace could not open' })).toBeVisible();
        await expect(page.getByRole('alert')).toContainText('Saved workspace read failed');
        await expect(page.getByRole('link', { name: 'Open workspace recovery' })).toHaveAttribute('href', '/recovery');
        await expect(page.locator('.react-flow__pane')).toHaveCount(0);
    });
});
