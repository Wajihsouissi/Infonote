import type { AppState } from '../../../src/store/types';
import { test, expect } from '../../support/fixtures';
import { openCanvas } from '../../support/canvas';
import { waitForCanvasState } from '../../support/canvasState';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002';
const NODE_ID = 'cloud-refresh-probe';

test('cloud data loads once per tab session while real edits still sync', async ({ page }) => {
    const user = {
        id: USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'cloud-refresh@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { display_name: 'Cloud refresh test' },
        created_at: '2026-01-01T00:00:00.000Z',
    };
    const nodeRow = {
        id: NODE_ID,
        user_id: USER_ID,
        workspace_id: WORKSPACE_ID,
        parent_id: null,
        type: 'note',
        x_pos: 120,
        y_pos: 120,
        width: 432,
        height: 432,
        data_json: { data: { label: 'Cloud refresh test', content: [], viewMode: 'expanded' } },
    };
    const requests = { revisions: 0, nodeReads: 0, edgeReads: 0, nodeWrites: 0 };
    let revision = 1;

    // Every backend request is intercepted in this fresh test context. No
    // credentials, graph rows or writes ever reach a real cloud workspace.
    await page.route(/\/(?:auth|rest|storage)\/v1\//, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let body: unknown = [];
        if (path.endsWith('/user')) body = user;
        else if (path.endsWith('/workspaces')) body = [{ id: WORKSPACE_ID, owner_id: USER_ID }];
        else if (path.endsWith('/user_profiles')) {
            body = [{ id: USER_ID, email: user.email, display_name: 'Cloud refresh test' }];
        } else if (path.endsWith('/rpc/get_workspace_sync_revision')) {
            requests.revisions += 1;
            body = revision;
        } else if (path.endsWith('/canvas_nodes')) {
            if (request.method() === 'GET') {
                requests.nodeReads += 1;
                body = [nodeRow];
            } else if (request.method() === 'POST') {
                requests.nodeWrites += 1;
                revision += 1;
                const rows = request.postDataJSON() as typeof nodeRow[];
                const update = rows.find((row) => row.id === NODE_ID);
                if (update) Object.assign(nodeRow, update);
            }
        } else if (path.endsWith('/canvas_edges') && request.method() === 'GET') {
            requests.edgeReads += 1;
        }
        if (request.headers().accept?.includes('application/vnd.pgrst.object+json') && Array.isArray(body)) {
            body = body[0] ?? null;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify(body),
        });
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
    const configured = await page.evaluate(async () => {
        const modulePath = '/src/services/supabase/client.ts';
        return (await import(modulePath)).isSupabaseConfigured as boolean;
    });
    test.skip(!configured, 'Cloud sync requires the local Supabase public configuration.');

    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const accessToken = [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: USER_ID, aud: 'authenticated', exp: expiresAt })).toString('base64url'),
        'test-signature-not-a-real-credential',
    ].join('.');
    await page.evaluate(async ({ user, accessToken, expiresAt, workspaceId }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('infonote-local-workspaces');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('workspaces', 'readwrite');
            tx.objectStore('workspaces').put({
                key: `workspace:${workspaceId}`,
                nodes: [], edges: [],
                dirtyNodeIds: [], dirtyEdgeIds: [], deletedNodeIds: [], deletedEdgeIds: [],
                cloudRevision: null, cloudHydrated: false, syncedNodes: [], syncedEdges: [],
                updatedAt: Date.now(), lastSyncedAt: null,
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        localStorage.setItem('chnk-it-auth-token', JSON.stringify({
            access_token: accessToken,
            refresh_token: 'test-refresh-token-not-a-real-credential',
            token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user,
        }));
        localStorage.setItem('infonote.storage-mode.v2', 'sync');
        localStorage.setItem(`chnk-it.activeWorkspaceId.${user.id}`, workspaceId);
    }, { user, accessToken, expiresAt, workspaceId: WORKSPACE_ID });

    await page.goto('/');
    await waitForCanvasState(page, (state) => state.nodes.some((node) => node.id === NODE_ID), 'background cloud hydration on the dashboard');
    await expect(page.locator('.react-flow__pane')).toHaveCount(0);
    await page.waitForTimeout(1800);
    expect(requests.nodeReads).toBe(1);
    expect(requests.edgeReads).toBe(1);
    expect(requests.nodeWrites).toBe(0);
    const afterBackgroundLoad = { ...requests };

    await page.getByRole('button', { name: 'Open your canvas', exact: true }).click();
    const upToDate = page.getByRole('button', { name: /^Cloud Save: (Up to date|Synced)/ });
    await expect(upToDate).toBeVisible();
    await page.waitForTimeout(1800); // Beyond the 1.2s automatic-sync debounce.
    expect(requests, 'opening CanvasBoard must reuse the background-loaded graph').toEqual(afterBackgroundLoad);
    const afterFirstLoad = { ...requests };

    for (let refresh = 0; refresh < 2; refresh += 1) {
        await page.reload();
        await waitForCanvasState(page, (state) => state.nodes.some((node) => node.id === NODE_ID), 'the cached cloud canvas');
        await expect(upToDate).toBeVisible();
        await page.waitForTimeout(1800);
        expect(requests, `refresh ${refresh + 1} checks metadata without downloading or saving the graph`).toEqual({
            ...afterFirstLoad, revisions: afterFirstLoad.revisions + refresh + 1,
        });
    }

    await page.evaluate((nodeId) => {
        const store = (window as unknown as { __appStore: { getState: () => AppState } }).__appStore;
        store.getState().updateNodeData(nodeId, { label: 'Edited after refresh' });
    }, NODE_ID);
    await expect.poll(() => requests.nodeWrites).toBe(1);
    await expect(upToDate).toBeVisible();
    expect(nodeRow.data_json.data.label).toBe('Edited after refresh');
    expect(requests.nodeReads).toBe(1);
    expect(requests.edgeReads).toBe(1);
});
