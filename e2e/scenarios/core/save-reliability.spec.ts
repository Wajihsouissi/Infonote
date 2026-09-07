import type { AppState } from '../../../src/store/types';
import { test, expect } from '../../support/fixtures';
import { openCanvas } from '../../support/canvas';
import { mockCloud, editCloudNode, syncNow, CLOUD_NODE, CLOUD_WORKSPACE } from '../../support/mockCloud';

test('an edit to the same card during upload is sent in the next save', async ({ page }) => {
    const cloud = await mockCloud(page);
    let release!: () => void;
    cloud.beforeWrite = () => new Promise<void>((resolve) => { release = resolve; });
    await editCloudNode(page, 'First edit');
    await expect.poll(() => cloud.writes.length).toBe(1);
    await editCloudNode(page, 'Edit while uploading');
    cloud.beforeWrite = null;
    release();
    await expect.poll(() => cloud.row.data_json.data.label).toBe('Edit while uploading');
    await page.reload();
    await expect.poll(() => page.evaluate((id) => {
        const state = (window as unknown as { __appStore?: { getState(): AppState } }).__appStore?.getState();
        return state?.nodes.find((node) => node.id === id)?.data.label;
    }, CLOUD_NODE)).toBe('Edit while uploading');
});

test('local persistence recovers after a failed write and reports the failure honestly', async ({ page }) => {
    await openCanvas(page);
    await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
            if (this.name === 'workspaces') {
                IDBObjectStore.prototype.put = put;
                throw new DOMException('Simulated disk full', 'QuotaExceededError');
            }
            return put.apply(this, args);
        };
    });
    const failed = await syncNow(page, { localOnly: true });
    expect(failed.ok).toBe(false);
    const recovered = await syncNow(page, { localOnly: true });
    expect(recovered.ok).toBe(true);
    const status = await page.evaluate(() => {
        const { storage } = (window as unknown as { __appStore: { getState(): AppState } }).__appStore.getState();
        return { error: storage.localError, dirty: storage.isLocalDirty };
    });
    expect(status).toEqual({ error: null, dirty: false });
});

test('refresh drains durable pending edits even after the session startup check', async ({ page }) => {
    const cloud = await mockCloud(page);
    await editCloudNode(page, 'Queued before refresh');
    expect((await syncNow(page, { localOnly: true })).ok).toBe(true);
    await page.reload();
    await expect.poll(() => cloud.row.data_json.data.label).toBe('Queued before refresh');
});

test('manual restore point works without new edits and invokes retention', async ({ page }) => {
    const cloud = await mockCloud(page);
    expect((await syncNow(page, { createManualVersion: true })).ok).toBe(true);
    expect(cloud.versions.filter((item) => item.kind === 'manual')).toHaveLength(1);
    await expect.poll(() => cloud.prunes).toBe(1);
    expect(cloud.writes).toHaveLength(0);
});

test('an edit arriving while a remote graph is downloading survives the merge', async ({ page }) => {
    const cloud = await mockCloud(page);
    cloud.row.data_json.data.label = 'Collaborator edit';
    cloud.revision++;
    let release!: () => void;
    cloud.beforeRead = () => new Promise<void>((resolve) => { release = resolve; });
    const sync = syncNow(page);
    await expect.poll(() => cloud.reads).toBe(2);
    await editCloudNode(page, 'Typed while downloading');
    cloud.beforeRead = null;
    release();
    await sync;
    await expect.poll(() => cloud.row.data_json.data.label).toBe('Typed while downloading');
});

test('drag end tracks the settled position even without another node update', async ({ page }) => {
    const cloud = await mockCloud(page);
    await page.evaluate((id) => {
        const store = (window as unknown as { __appStore: { getState(): AppState; setState(patch: Partial<AppState>): void } }).__appStore;
        store.getState().setInteractionState({ draggedNodeId: id });
        store.setState({ nodes: store.getState().nodes.map((node) => node.id === id ? { ...node, position: { x: 777, y: 888 } } : node) });
        store.getState().setInteractionState({ draggedNodeId: null });
    }, CLOUD_NODE);
    await expect.poll(() => [cloud.row.x_pos, cloud.row.y_pos]).toEqual([777, 888]);
});

test('unchanged saves create only one daily backup and send no duplicate node writes', async ({ page }) => {
    const cloud = await mockCloud(page);
    await editCloudNode(page, 'First');
    await syncNow(page);
    await editCloudNode(page, 'Second');
    await syncNow(page);
    await syncNow(page);
    expect(cloud.versions.filter((version) => version.kind === 'daily')).toHaveLength(1);
    expect(cloud.writes).toHaveLength(2);
    expect(cloud.writes.every((rows) => rows.length === 1)).toBe(true);
});

test('switching to a new workspace does not copy the previous workspace into it', async ({ page }) => {
    await mockCloud(page);
    await editCloudNode(page, 'Kept in original workspace');
    await syncNow(page, { localOnly: true });
    const nextWorkspace = '00000000-0000-4000-8000-000000000003';
    await page.evaluate(async (workspaceId) => {
        const path = '/src/services/storage/storagePreference.ts';
        (await import(path)).writeStorageMode('local');
        (window as unknown as { __appStore: { getState(): AppState } }).__appStore.getState().setAuthWorkspace(workspaceId);
    }, nextWorkspace);
    await expect.poll(() => page.evaluate(async (workspaceId) => {
        const path = '/src/services/storage/LocalWorkspaceStore.ts';
        return (await (await import(path)).loadLocalWorkspace(`workspace:${workspaceId}`))?.nodes.length;
    }, nextWorkspace)).toBe(0);
    await page.evaluate((workspaceId) => {
        (window as unknown as { __appStore: { getState(): AppState } }).__appStore.getState().setAuthWorkspace(workspaceId);
    }, CLOUD_WORKSPACE);
    await expect.poll(() => page.evaluate((id) => {
        return (window as unknown as { __appStore: { getState(): AppState } }).__appStore.getState().nodes.find((node) => node.id === id)?.data.label;
    }, CLOUD_NODE)).toBe('Kept in original workspace');
});

for (const width of [1280, 390]) {
    test(`device save errors offer a visible working retry at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 844 });
        await openCanvas(page);
        await page.evaluate(() => {
            const state = (window as unknown as { __appStore: { getState(): AppState } }).__appStore.getState();
            state.setLocalError('Simulated disk full');
            state.setLocalDirty(true);
        });
        const alert = page.getByRole('alert').filter({ hasText: 'Device save failed' });
        await expect(alert).toBeVisible();
        const bounds = (await alert.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(await alert.getByRole('button', { name: 'Retry save' }).evaluate((button) => button.scrollWidth <= button.clientWidth)).toBe(true);
        await testInfo.attach('save-error-layout', { body: await page.screenshot(), contentType: 'image/png' });
        await alert.getByRole('button', { name: 'Retry save' }).click();
        await expect(alert).toBeHidden();
    });
}
