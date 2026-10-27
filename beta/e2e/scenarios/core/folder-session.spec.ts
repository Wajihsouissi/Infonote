import { test, expect } from '../../support/fixtures';
import type { AppNode } from '../../../src/types';

const paths = { session: '/src/services/storage/workspace/folderPersistence.ts',
    binding: '/src/services/storage/workspace/folderBinding.ts',
    workspace: '/src/services/storage/workspace/FolderWorkspace.ts', store: '/src/store/useStore.ts',
    local: '/src/services/storage/workspace/localPersistence.ts', localStore: '/src/services/storage/workspace/LocalWorkspaceStore.ts' };

test.describe('core: folder session lifecycle', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/__folder_session', route => route.fulfill({
            contentType: 'text/html', body: '<html><body>Folder lifecycle contracts</body></html>',
        }));
        await page.goto('/__folder_session');
    });

    test.describe('unavailable only copy', () => {
        test.use({ allowConsoleErrors: true });
        test('denied folder access with no browser copy cannot seed or autosave an empty workspace', async ({ page }) => {
            await page.evaluate(async paths => {
                const { storedFolderBinding } = await import(/* @vite-ignore */ paths.binding);
                const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('only-copy', { create: true });
                await storedFolderBinding({ handle: root, commit: null });
            }, paths);
            await page.reload();
            const result = await page.evaluate(async paths => {
                Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'denied' });
                Object.assign(window, { showDirectoryPicker: async () => { throw new Error('Startup must not prompt'); } });
                const { startLocalPersistence } = await import(/* @vite-ignore */ paths.local);
                const local = await import(/* @vite-ignore */ paths.localStore);
                const { useStore } = await import(/* @vite-ignore */ paths.store);
                let ready = 0, fail!: (reason: string) => void;
                const failed = new Promise<string>(resolve => { fail = resolve; });
                const stop = startLocalPersistence({ onReady: () => { ready++; }, onError: fail });
                const error = await failed;
                stop();
                return { ready, error, nodes: useStore.getState().nodes.length, saved: await local.loadLocalWorkspace(local.LOCAL_WORKSPACE_KEY) };
            }, paths);
            expect(result.ready).toBe(0);
            expect(result.error).toMatch(/folder|access|permission/i);
            expect(result.nodes).toBe(0);
            expect(result.saved).toBeNull();
        });
    });

    test('edits coalesce while a save runs; switching waits and preserves both folders', async ({ page }) => {
        const result = await page.evaluate(async paths => {
            const session = await import(/* @vite-ignore */ paths.session);
            const { useStore } = await import(/* @vite-ignore */ paths.store);
            const { FolderWorkspace } = await import(/* @vite-ignore */ paths.workspace);
            const makeGraph = (id: string) => ({ nodes: [{ id, type: 'note', position: { x: 0, y: 0 },
                data: { label: id, content: [] } }] as AppNode[], edges: [] });
            const root = await navigator.storage.getDirectory();
            const first = await root.getDirectoryHandle('first', { create: true });
            const second = await root.getDirectoryHandle('second', { create: true });
            let picked = first, pickerCalls = 0;
            Object.assign(window, { showDirectoryPicker: () => { pickerCalls++; return Promise.resolve(picked); } });
            useStore.setState(makeGraph('initial'));
            await session.connectFolder();
            const originalSave = FolderWorkspace.prototype.save;
            let release!: () => void, started!: () => void;
            const blocked = new Promise<void>(resolve => { release = resolve; });
            const entered = new Promise<void>(resolve => { started = resolve; });
            const saves: string[] = []; let pendingDuringLatest = false;
            FolderWorkspace.prototype.save = async function (graph: { nodes: AppNode[]; edges: [] }) {
                saves.push(graph.nodes[0].id);
                if (saves.length === 1) { started(); await blocked; }
                else if (saves.length === 2) pendingDuringLatest = session.folderHasPendingChanges();
                return originalSave.call(this, graph);
            };
            session.markFolderDirty(); session.queueFolderSave(makeGraph('older')); await entered;
            session.markFolderDirty(); session.queueFolderSave(makeGraph('intermediate'));
            session.markFolderDirty(); session.queueFolderSave(makeGraph('latest'));
            useStore.setState(makeGraph('current'));
            picked = second;
            const connecting = session.connectFolder();
            const pickerInGesture = pickerCalls === 2;
            // Let connect acquire its switching guard while the old save is blocked.
            await Promise.resolve();
            session.queueFolderSave(makeGraph('during-switch'));
            release(); await connecting;
            const readId = async (handle: FileSystemDirectoryHandle) => {
                const data = await handle.getDirectoryHandle('chnk-it-workspace');
                const head = JSON.parse(await (await (await data.getFileHandle('workspace.json')).getFile()).text());
                return JSON.parse(await (await (await data.getFileHandle(head.nodes[0].file)).getFile()).text()).id;
            };
            const firstId = await readId(first), secondId = await readId(second);
            await session.disconnectFolder();
            return { saves, pickerInGesture, pendingDuringLatest, firstId, secondId,
                pendingAfterDisconnect: session.folderHasPendingChanges() };
        }, paths);
        expect(result).toEqual({ saves: ['older', 'latest', 'current'], pickerInGesture: true,
            pendingDuringLatest: true, firstId: 'latest', secondId: 'current', pendingAfterDisconnect: false });
    });

    test('reconnect shares initialization, prefers the browser draft and refuses an external revision', async ({ page }) => {
        await page.evaluate(async paths => {
            const session = await import(/* @vite-ignore */ paths.session);
            const { useStore } = await import(/* @vite-ignore */ paths.store);
            const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('remembered', { create: true });
            Object.assign(window, { showDirectoryPicker: async () => root });
            useStore.setState({ nodes: [{ id: 'disk', type: 'note', position: { x: 0, y: 0 }, data: { content: [] } }], edges: [] });
            await session.connectFolder();
        }, paths);
        await page.reload();
        const draft = await page.evaluate(async paths => {
            Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
            Object.assign(window, { showDirectoryPicker: async () => { throw new Error('Startup must not prompt'); } });
            const session = await import(/* @vite-ignore */ paths.session);
            const { useStore } = await import(/* @vite-ignore */ paths.store);
            const { FolderWorkspace } = await import(/* @vite-ignore */ paths.workspace);
            const browser = { nodes: [{ id: 'browser-draft', type: 'note', position: { x: 0, y: 0 }, data: { content: [] } }], edges: [] };
            useStore.setState(browser);
            let release!: () => void, entered!: () => void;
            const blocked = new Promise<void>(resolve => { release = resolve; });
            const loading = new Promise<void>(resolve => { entered = resolve; });
            const load = FolderWorkspace.prototype.load;
            FolderWorkspace.prototype.load = async function () { entered(); await blocked; return load.call(this); };
            const one = session.reconnectFolder(browser), two = session.reconnectFolder(null);
            await loading;
            useStore.getState().updateNodeData('browser-draft', { label: 'Typed during reconnection' });
            release();
            const shared = one === two, restored = await one;
            FolderWorkspace.prototype.load = load;
            await session.retryFolderSave();
            const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('remembered');
            const external = new FolderWorkspace(root); const loaded = await external.load();
            await external.save({ ...browser, nodes: [{ ...browser.nodes[0], id: 'external' }] });
            return { shared, restored, savedId: loaded.nodes[0].id, savedLabel: loaded.nodes[0].data.label, currentId: useStore.getState().nodes[0].id };
        }, paths);
        expect(draft).toEqual({ shared: true, restored: null, savedId: 'browser-draft', savedLabel: 'Typed during reconnection', currentId: 'browser-draft' });
        await page.reload();
        const changed = await page.evaluate(async paths => {
            Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
            Object.assign(window, { showDirectoryPicker: async () => { throw new Error('Startup must not prompt'); } });
            const session = await import(/* @vite-ignore */ paths.session);
            const { useStore } = await import(/* @vite-ignore */ paths.store);
            useStore.setState({ nodes: [{ id: 'safe-draft', type: 'note', position: { x: 0, y: 0 }, data: { content: [] } }], edges: [] });
            return { restored: await session.reconnectFolder({ nodes: useStore.getState().nodes, edges: [] }),
                pending: session.folderHasPendingChanges(), currentId: useStore.getState().nodes[0].id };
        }, paths);
        expect(changed).toEqual({ restored: null, pending: true, currentId: 'safe-draft' });
    });

    test('the browser draft is ready during folder I/O; restart leaves one autosave subscription pair', async ({ page }) => {
        await page.evaluate(async paths => {
            const session = await import(/* @vite-ignore */ paths.session);
            const { useStore } = await import(/* @vite-ignore */ paths.store);
            const local = await import(/* @vite-ignore */ paths.localStore);
            const graph = { nodes: [{ id: 'retained', type: 'note', position: { x: 0, y: 0 }, data: { label: 'Retained', content: [] } }], edges: [] };
            await local.saveLocalWorkspace({ ...graph, key: local.LOCAL_WORKSPACE_KEY, updatedAt: 1 });
            useStore.setState(graph);
            const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('restart', { create: true });
            Object.assign(window, { showDirectoryPicker: async () => root }); await session.connectFolder();
        }, paths);
        await page.reload();
        const result = await page.evaluate(async paths => {
            Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
            Object.assign(window, { showDirectoryPicker: async () => { throw new Error('Startup must not prompt'); } });
            const { useStore } = await import(/* @vite-ignore */ paths.store);
            const { FolderWorkspace } = await import(/* @vite-ignore */ paths.workspace);
            const { startLocalPersistence } = await import(/* @vite-ignore */ paths.local);
            const local = await import(/* @vite-ignore */ paths.localStore);
            let release!: () => void, started!: () => void;
            const blocked = new Promise<void>(resolve => { release = resolve; });
            const entered = new Promise<void>(resolve => { started = resolve; });
            const load = FolderWorkspace.prototype.load;
            FolderWorkspace.prototype.load = async function () { started(); await blocked; return load.call(this); };
            let active = 0, subscribed = 0, firstReady = 0, secondReady = 0;
            const subscribe = useStore.subscribe;
            useStore.subscribe = (...args: unknown[]) => {
                active++; subscribed++;
                const unsubscribe = subscribe(...args);
                return () => { active--; unsubscribe(); };
            };
            const stopFirst = startLocalPersistence({ onReady: () => { firstReady++; } });
            await entered; stopFirst(); stopFirst();
            const before = await local.loadLocalWorkspace(local.LOCAL_WORKSPACE_KEY);
            let ready!: () => void;
            const hydrated = new Promise<void>(resolve => { ready = resolve; });
            const stopSecond = startLocalPersistence({ onReady: () => { secondReady++; ready(); } });
            release(); await hydrated;
            const activeAfterRestart = active;
            useStore.getState().updateNodeData('retained', { label: 'Latest draft' });
            stopSecond(); stopSecond();
            const after = await local.loadLocalWorkspace(local.LOCAL_WORKSPACE_KEY);
            return { beforeId: before.nodes[0].id, firstReady, secondReady, activeAfterRestart,
                activeAfterStop: active, subscribed, afterLabel: after.nodes[0].data.label };
        }, paths);
        expect(result).toEqual({ beforeId: 'retained', firstReady: 1, secondReady: 1,
            activeAfterRestart: 2, activeAfterStop: 0, subscribed: 4, afterLabel: 'Latest draft' });
    });
});
