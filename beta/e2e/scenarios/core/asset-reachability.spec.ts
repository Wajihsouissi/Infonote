import { test, expect } from '../../support/fixtures';
import type { AppNode } from '../../../src/types';

test.describe('core: workspace asset reachability', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/__asset_engine', route => route.fulfill({
            contentType: 'text/html', body: '<html><body>Asset storage contracts</body></html>',
        }));
        await page.goto('/__asset_engine');
    });

    test('backup and folder preserve nested references, first-seen order and binary restoration', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const paths = {
                assets: '/src/services/assets/assetStore.ts',
                backup: '/src/services/storage/workspace/workspaceBackup.ts',
                folder: '/src/services/storage/workspace/FolderWorkspace.ts',
                store: '/src/store/useStore.ts',
            };
            const { putAssetRecord, getAsset, assetBlob } = await import(/* @vite-ignore */ paths.assets);
            const { createBackup, restoreBackup } = await import(/* @vite-ignore */ paths.backup);
            const { FolderWorkspace } = await import(/* @vite-ignore */ paths.folder);
            const { useStore } = await import(/* @vite-ignore */ paths.store);
            const ids = ['body', 'poster', 'thumb', 'gallery', 'nested', 'legacy', 'column', 'old-column', 'cover', 'icon', 'second'];
            for (const [index, id] of ids.entries()) {
                await putAssetRecord({ id, name: `${id}.bin`, mime: 'application/octet-stream',
                    hash: id, createdAt: 1, size: 2, bytes: new Uint8Array([index, 255]).buffer });
            }
            const nodes = [{ id: 'first', type: 'note', position: { x: 0, y: 0 }, data: {
                content: [null, { content: 'https://example.com/image.png' }, { content: 'asset:' }, {
                    content: 'asset:body', metadata: {
                        poster: 'asset:poster', thumb: 'asset:thumb',
                        items: [{ content: 'asset:gallery' }], blocks: [{ content: 'asset:nested' }],
                        content: [{ content: 'asset:legacy' }], columns: [
                            { content: [{ content: 'asset:column' }], blocks: [{ content: 'asset:shadowed' }] },
                            { blocks: [{ content: 'asset:old-column' }] }, null,
                        ],
                    },
                }, { content: 'asset:gallery' }], coverImage: 'asset:cover', icon: 'asset:icon',
            } }, { id: 'second', type: 'note', position: { x: 1, y: 0 }, data: {
                content: [{ content: 'asset:second' }], coverImage: 'asset:body', icon: 'emoji:star',
            } }] as unknown as AppNode[];
            useStore.setState({ nodes, edges: [] });
            const backup = await createBackup();
            const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('reachability', { create: true });
            const writer = new FolderWorkspace(root); await writer.load(); await writer.save({ nodes, edges: [] });
            const data = await root.getDirectoryHandle('chnk-it-workspace');
            const head = JSON.parse(await (await (await data.getFileHandle('workspace.json')).getFile()).text());
            await new Promise<void>((resolve, reject) => {
                const request = indexedDB.deleteDatabase('chnk-it-assets');
                request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
            });
            const restored = await restoreBackup(new File([JSON.stringify(backup)], 'backup.json'));
            const bytes = [];
            for (const id of ids) bytes.push(Array.from(new Uint8Array(await assetBlob(await getAsset(id)).arrayBuffer())));
            return { backupIds: backup.assets.map((asset: { id: string }) => asset.id),
                folderIds: head.assets.map((asset: { id: string }) => asset.id), restored, bytes };
        });
        const ids = ['body', 'poster', 'thumb', 'gallery', 'nested', 'legacy', 'column', 'old-column', 'cover', 'icon', 'second'];
        expect(result.backupIds).toEqual(ids);
        expect(result.folderIds).toEqual(ids);
        expect(result.restored).toEqual({ nodes: 2, edges: 0, files: 11 });
        expect(result.bytes).toEqual(ids.map((_, index) => [index, 255]));
    });

    test('folder reuses immutable-node discovery and keeps its stricter missing-file policy', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const paths = { folder: '/src/services/storage/workspace/FolderWorkspace.ts',
                backup: '/src/services/storage/workspace/workspaceBackup.ts', store: '/src/store/useStore.ts' };
            const { FolderWorkspace } = await import(/* @vite-ignore */ paths.folder);
            const { createBackup } = await import(/* @vite-ignore */ paths.backup);
            const { useStore } = await import(/* @vite-ignore */ paths.store);
            let traversals = 0;
            const content: unknown[] = [];
            Object.defineProperty(content, Symbol.iterator, { value: function* () { traversals++; yield* []; } });
            const node = { id: 'cached', type: 'note', position: { x: 0, y: 0 }, data: { content } } as AppNode;
            const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('cache-policy', { create: true });
            const writer = new FolderWorkspace(root); await writer.load();
            await writer.save({ nodes: [node], edges: [] });
            const initial = traversals, commit = writer.commit;
            await writer.save({ nodes: [node], edges: [] });
            const unchanged = traversals, noOpCommit = writer.commit === commit;
            await writer.save({ nodes: [{ ...node }], edges: [] });
            const replaced = traversals;
            const missing = { ...node, data: { content: [{ id: 'missing', type: 'image', content: 'asset:missing' }] } } as AppNode;
            useStore.setState({ nodes: [missing], edges: [] });
            const backup = await createBackup();
            let error = '';
            try { await writer.save({ nodes: [missing], edges: [] }); }
            catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
            const data = await root.getDirectoryHandle('chnk-it-workspace');
            const head = JSON.parse(await (await (await data.getFileHandle('workspace.json')).getFile()).text());
            return { initial, unchanged, replaced, noOpCommit, backupFiles: backup.assets.length,
                backupReference: backup.nodes[0].data.content[0].content, error,
                failedSaveKeptCommit: writer.commit === commit && head.commit === commit };
        });
        expect(result).toEqual({ initial: 1, unchanged: 1, replaced: 2, noOpCommit: true,
            backupFiles: 0, backupReference: 'asset:missing',
            error: 'An uploaded file is missing. Folder save paused; keep this tab open.',
            failedSaveKeptCommit: true });
    });
});
