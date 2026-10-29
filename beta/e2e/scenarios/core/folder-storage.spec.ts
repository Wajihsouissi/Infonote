import { test, expect } from '../../support/fixtures';
import { fitView, nodeById, openCanvas, selectNode, setTitle } from '../../support/canvas';
import { seedCanvasState, makeCards, readCanvasState } from '../../support/canvasState';

const modulePath = '/src/services/storage/workspace/FolderWorkspace.ts';
test.describe('core: incremental folder storage', () => {
    test('an interrupted first pointer can retry, but a missing committed pointer cannot initialize over its backup', async ({ page }) => {
        await page.route('**/__folder_engine', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Folder retry test</body></html>' }));
        await page.goto('/__folder_engine');
        const result = await page.evaluate(async modulePath => {
            const { FolderWorkspace } = await import(/* @vite-ignore */ modulePath);
            const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('first-pointer', { create: true });
            const data = await root.getDirectoryHandle('chnk-it-workspace', { create: true });
            const empty = await (await data.getFileHandle('workspace.json', { create: true })).createWritable(); await empty.close();
            const fresh = new FolderWorkspace(root); const initiallyEmpty = await fresh.load() === null;
            const graph = { nodes: [{ id: 'retry', type: 'note', position: { x: 0, y: 0 }, data: { content: [] } }], edges: [] };
            await fresh.save(graph);
            await fresh.save({ ...graph, nodes: [{ ...graph.nodes[0], data: { content: [], label: 'Latest' } }] });
            await data.removeEntry('workspace.json');
            let refused = false; try { await new FolderWorkspace(root).load(); } catch { refused = true; }
            const previous = await (await data.getFileHandle('workspace.previous.json')).getFile();
            return { initiallyEmpty, refused, backupPresent: previous.size > 0 };
        }, modulePath);
        expect(result).toEqual({ initiallyEmpty: true, refused: true, backupPresent: true });
    });

    test('heavy graph and binary assets round-trip; one edit writes one record; conflicts and interrupted commits preserve disk', async ({ page }) => {
        // The storage engine needs an origin, not a mounted canvas. UI boot,
        // ownership and real input are covered by the separate scenario below.
        await page.route('**/__folder_engine', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Folder storage engine test</body></html>' }));
        await page.goto('/__folder_engine');
        const result = await page.evaluate(async modulePath => {
            const { FolderWorkspace } = await import(/* @vite-ignore */ modulePath);
            const assetModule = '/src/services/assets/assetStore.ts';
            const { putAsset, getAsset, assetBlob } = await import(/* @vite-ignore */ assetModule);
            const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('engine-case', { create: true });
            const asset = await putAsset(new File([new Uint8Array([1, 2, 3, 255])], 'evidence.bin'));
            const graph = { nodes: Array.from({ length: 160 }, (_, i) => ({ id: `node-${i}`, type: 'note', position: { x: i * 500, y: 0 }, data: { label: `Research ${i}`, viewMode: 'expanded', content: Array.from({ length: 80 }, (_, j) => ({ id: `b-${i}-${j}`, type: 'text', content: `Research evidence ${i}:${j}` })), coverImage: i === 0 ? `asset:${asset.id}` : undefined } })), edges: [{ id: 'edge', source: 'node-0', target: 'node-1' }] };
            const writer = new FolderWorkspace(root);
            await writer.load(); await writer.save(graph);
            const data = await root.getDirectoryHandle('chnk-it-workspace');
            const read = async () => JSON.parse(await (await (await data.getFileHandle('workspace.json')).getFile()).text());
            const before = await read();
            const changed = { ...graph, nodes: graph.nodes.map((n, i) => i === 4 ? { ...n, data: { ...n.data, label: 'Edited research' } } : n) };
            const started = performance.now(); await writer.save(changed); const saveMs = performance.now() - started;
            const after = await read();
            await new Promise<void>((resolve, reject) => { const r = indexedDB.deleteDatabase('chnk-it-assets'); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); });
            const reader = new FolderWorkspace(root); const loaded = await reader.load();
            const recovered = await getAsset(asset.id);
            const recoveredBytes = Array.from(new Uint8Array(await assetBlob(recovered).arrayBuffer()));
            let conflict = false;
            await writer.save({ ...changed, nodes: changed.nodes.slice(1) });
            try { await reader.save(changed); } catch { conflict = true; }
            const last = await read();
            const brokenData = new Proxy(data, { get(target, key) { if (key === 'getFileHandle') return async (name: string, options?: FileSystemGetFileOptions) => { if (name === 'workspace.json' && options?.create) throw new DOMException('Disk full', 'QuotaExceededError'); return target.getFileHandle(name, options); }; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } });
            const brokenRoot = new Proxy(root, { get(target, key) { if (key === 'getDirectoryHandle') return async () => brokenData; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } });
            const broken = new FolderWorkspace(brokenRoot); await broken.load(); let interrupted = false;
            try { await broken.save(changed); } catch { interrupted = true; }
            const survived = await read();
            return { loaded: JSON.stringify(loaded) === JSON.stringify(changed), recoveredBytes, changedFiles: after.nodes.filter((e: { file: string }, i: number) => e.file !== before.nodes[i].file).length, assetUnchanged: before.assets[0].file === after.assets[0].file, conflict, interrupted, unchangedCommit: survived.commit === last.commit, saveMs };
        }, modulePath);
        expect(result.loaded).toBe(true); expect(result.changedFiles).toBe(1); expect(result.assetUnchanged).toBe(true);
        expect(result.recoveredBytes).toEqual([1, 2, 3, 255]);
        expect(result.conflict).toBe(true); expect(result.interrupted).toBe(true); expect(result.unchangedCommit).toBe(true);
        console.log('Folder 160-card incremental save diagnostic (OPFS):', result.saveMs);
    });

    test('folder UI autosaves, reconnects after reload and restores after the browser graph is cleared', async ({ page }, testInfo) => {
        test.setTimeout(90_000);
        await page.addInitScript(() => {
            (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ui-folder', { create: true });
            Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => localStorage.getItem('test-folder-denied') ? 'prompt' : 'granted' });
            Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => localStorage.getItem('test-folder-denied') ? 'denied' : 'granted' });
        });
        await openCanvas(page);
        await seedCanvasState(page, makeCards(3));
        await page.goto('/profile');
        await page.getByRole('button', { name: 'Choose or open folder' }).click();
        await expect(page.getByText(/ui-folder — Saved to folder/)).toBeVisible();
        await page.goto('/canvas');
        await expect(page.getByText('Saved to folder', { exact: true })).toBeVisible();
        await fitView(page);
        const edited = nodeById(page, 'seed-0');
        await selectNode(edited);
        await setTitle(edited, 'Persistent folder edit');
        await expect(page.getByText('Saved to folder', { exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(async () => {
            const root = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('ui-folder')).getDirectoryHandle('chnk-it-workspace');
            const head = JSON.parse(await (await (await root.getFileHandle('workspace.json')).getFile()).text());
            const first = JSON.parse(await (await (await root.getFileHandle(head.nodes[0].file)).getFile()).text()); return first.data.label;
        })).toBe('Persistent folder edit');
        await page.reload();
        await expect(page.getByText('Saved to folder', { exact: true })).toBeVisible();
        // Clear only the graph, retaining the directory grant/binding and assets.
        await page.evaluate(async () => { await new Promise<void>((resolve, reject) => { const r = indexedDB.deleteDatabase('infonote-local-workspaces'); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); }); });
        await page.reload();
        await expect(page.getByText('Saved to folder', { exact: true })).toBeVisible();
        await expect(nodeById(page, 'seed-0').getByPlaceholder('Untitled')).toHaveValue('Persistent folder edit');
        await page.evaluate(() => localStorage.setItem('test-folder-denied', '1'));
        await page.reload();
        await expect(page.getByText('Folder save paused', { exact: true })).toBeVisible();
        await expect(nodeById(page, 'seed-0').getByPlaceholder('Untitled')).toHaveValue('Persistent folder edit');
        await page.goto('/profile');
        await page.getByRole('button', { name: 'Retry folder save' }).click();
        await expect(page.getByRole('alert')).toContainText('permission was not granted');
        await page.evaluate(() => localStorage.removeItem('test-folder-denied'));
        await page.getByRole('button', { name: 'Retry folder save' }).click();
        await expect(page.getByText(/ui-folder — Saved to folder/)).toBeVisible();
        for (const [name, width, height] of [['desktop', 1440, 1000], ['small', 390, 844]] as const) {
            await page.setViewportSize({ width, height });
            await page.screenshot({ path: testInfo.outputPath(`folder-${name}.png`), fullPage: true });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
        await page.getByRole('button', { name: 'Disconnect folder' }).click();
        await expect(page.getByText(/ui-folder —/)).toHaveCount(0);
        await seedCanvasState(page, makeCards(1));
        await page.goto('/profile');
        page.once('dialog', dialog => dialog.dismiss());
        await page.getByRole('button', { name: 'Choose or open folder' }).click();
        await expect.poll(async () => (await readCanvasState(page))?.nodes.length).toBe(1);
        await expect(page.getByText(/ui-folder —/)).toHaveCount(0);
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Choose or open folder' }).click();
        await expect.poll(async () => (await readCanvasState(page))?.nodes.length).toBe(3);
        await expect.poll(async () => (await readCanvasState(page))?.nodes.find(node => node.id === 'seed-0')?.data?.label).toBe('Persistent folder edit');
        await expect(page.getByText(/ui-folder — Saved to folder/)).toBeVisible();
    });
});
