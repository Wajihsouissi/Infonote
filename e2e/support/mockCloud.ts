import { expect, type Page } from '@playwright/test';
import type { AppState } from '../../src/store/types';
import { openCanvas } from './canvas';

export const CLOUD_USER = '00000000-0000-4000-8000-000000000001';
export const CLOUD_WORKSPACE = '00000000-0000-4000-8000-000000000002';
export const CLOUD_NODE = 'save-repair-probe';

export async function mockCloud(page: Page) {
    const user = {
        id: CLOUD_USER, aud: 'authenticated', role: 'authenticated', email: 'save@example.test',
        app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
    };
    const row = {
        id: CLOUD_NODE, user_id: CLOUD_USER, workspace_id: CLOUD_WORKSPACE, parent_id: null,
        type: 'note', x_pos: 100, y_pos: 100, width: 432, height: 432,
        data_json: { data: { label: 'Original', content: [], viewMode: 'expanded' } },
    };
    const cloud = {
        row, revision: 1, writes: [] as typeof row[][], reads: 0,
        versions: [] as Array<{ kind: string; nodes: unknown[] }>, prunes: 0,
        beforeWrite: null as (() => Promise<void>) | null,
        beforeRead: null as (() => Promise<void>) | null,
    };
    // All backend traffic stays in this disposable browser context.
    await page.route(/\/(?:auth|rest|storage)\/v1\//, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let body: unknown = [];
        if (path.endsWith('/user')) body = user;
        else if (path.endsWith('/workspaces')) body = [{ id: CLOUD_WORKSPACE, owner_id: CLOUD_USER }];
        else if (path.endsWith('/user_profiles')) body = [{ id: CLOUD_USER, email: user.email }];
        else if (path.endsWith('/rpc/get_workspace_sync_revision')) body = cloud.revision;
        else if (path.endsWith('/rpc/prune_canvas_versions')) cloud.prunes++;
        else if (path.endsWith('/canvas_versions') && request.method() === 'POST') {
            cloud.versions.push(request.postDataJSON());
        } else if (path.endsWith('/canvas_nodes')) {
            if (request.method() === 'GET') {
                cloud.reads++;
                const snapshot = structuredClone(cloud.row);
                await cloud.beforeRead?.();
                body = [snapshot];
            } else if (request.method() === 'POST') {
                const rows = request.postDataJSON() as typeof row[];
                cloud.writes.push(rows);
                await cloud.beforeWrite?.();
                const update = rows.find((item) => item.id === CLOUD_NODE);
                if (update) Object.assign(cloud.row, update);
                cloud.revision++;
            }
        }
        if (request.headers().accept?.includes('application/vnd.pgrst.object+json') && Array.isArray(body)) {
            body = body[0] ?? null;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.routeWebSocket(/\/realtime\/v1/, (socket) => {
        socket.onMessage((message) => {
            if (typeof message !== 'string') return;
            const [joinRef, ref, topic, event] = JSON.parse(message) as unknown[];
            if (event === 'phx_join' || event === 'heartbeat') {
                socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
            }
        });
    });
    await openCanvas(page);
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: CLOUD_USER, aud: 'authenticated', exp: expiresAt })).toString('base64url'),
        'fake-test-signature',
    ].join('.');
    await page.evaluate(async ({ user, token, expiresAt, workspaceId }) => {
        const path = '/src/services/storage/LocalWorkspaceStore.ts';
        const local = await import(path);
        await local.saveLocalWorkspace({
            key: `workspace:${workspaceId}`, nodes: [], edges: [], dirtyNodeIds: [], dirtyEdgeIds: [],
            deletedNodeIds: [], deletedEdgeIds: [], cloudRevision: null, cloudHydrated: false,
            updatedAt: Date.now(), lastSyncedAt: null, lastDailyVersionKey: null,
        });
        localStorage.setItem('chnk-it-auth-token', JSON.stringify({
            access_token: token, refresh_token: 'fake-refresh-token', token_type: 'bearer',
            expires_in: 3600, expires_at: expiresAt, user,
        }));
        localStorage.setItem('infonote.storage-mode.v2', 'sync');
        localStorage.setItem(`chnk-it.activeWorkspaceId.${user.id}`, workspaceId);
    }, { user, token, expiresAt, workspaceId: CLOUD_WORKSPACE });
    await page.goto('/');
    await expect.poll(() => page.evaluate((id) => {
        const state = (window as unknown as { __appStore?: { getState(): AppState } }).__appStore?.getState();
        return state?.nodes.some((node) => node.id === id) && !state.storage.isCloudSyncing;
    }, CLOUD_NODE)).toBe(true);
    return cloud;
}

export async function editCloudNode(page: Page, label: string) {
    await page.evaluate(({ id, label }) => {
        (window as unknown as { __appStore: { getState(): AppState } }).__appStore.getState().updateNodeData(id, { label });
    }, { id: CLOUD_NODE, label });
}

export async function syncNow(page: Page, request = {}) {
    return page.evaluate(async (request) => {
        const path = '/src/services/syncController.ts';
        return (await import(path)).requestWorkspaceSync(request);
    }, request);
}
