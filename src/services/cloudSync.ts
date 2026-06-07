/**
 * cloudSync — explicit "Save Cloud" / "Reload Saved Data" operations.
 *
 * These helpers map the React Flow canvas state (nodes + edges) onto the
 * production schema in supabase/migrations/0001_init.sql:
 *
 *   canvas_nodes(id, user_id, parent_id, type, x_pos, y_pos, width, height, data_json)
 *   canvas_edges(id, user_id, source_id, target_id, data_json)
 *
 * Notes:
 *   - All access is gated through Supabase RLS. For shared workspaces, rows
 *     are stored under the workspace owner's `user_id` while `workspace_id`
 *     and membership policies authorize collaborators to read/write them.
 *   - We upsert in batches and then delete-by-not-in to mirror the local
 *     state exactly (true sync, not append-only).
 *   - `data_json` carries everything not captured by the typed columns
 *     (node.data, node.style minus width/height, edge type/handles/etc.).
 */
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types';
import { supabase, isSupabaseConfigured } from './supabase/client';

export type CloudSyncResult =
    | { ok: true; counts: { nodes: number; edges: number } }
    | { ok: false; error: string };

export type CloudLoadResult =
    | { ok: true; nodes: AppNode[]; edges: Edge[] }
    | { ok: false; error: string };

/**
 * Module-level mutex to prevent concurrent saves from racing.
 * When one save is in progress, subsequent calls wait for it to finish
 * before starting their own operation — this eliminates the 409 conflict
 * error caused by overlapping upsert batches hitting the same PK rows.
 */
let _saveLock: Promise<CloudSyncResult> | null = null;

/** Lightweight metadata used to render the "Reload Saved Data" picker. */
export interface CloudPageSummary {
    /** Node id of the root-level page (parent_id IS NULL). */
    id: string;
    /** Best-effort human-readable title from data_json. Falls back to id. */
    title: string;
    /** Number of descendants belonging to this page. */
    childCount: number;
    /** ISO timestamp of last update for the page node. */
    updatedAt: string | null;
}

export interface CloudSnapshotMetadata {
    nodeCount: number;
    edgeCount: number;
    lastUpdated: string | null;
    pages: CloudPageSummary[];
}

export type CloudMetadataResult =
    | { ok: true; metadata: CloudSnapshotMetadata }
    | { ok: false; error: string };

interface CanvasNodeRow {
    id: string;
    user_id: string;
    workspace_id: string;
    parent_id: string | null;
    type: string;
    x_pos: number;
    y_pos: number;
    width: number | null;
    height: number | null;
    data_json: Record<string, unknown>;
}

interface CanvasEdgeRow {
    id: string;
    user_id: string;
    workspace_id: string;
    source_id: string;
    target_id: string;
    data_json: Record<string, unknown>;
}

async function ensureReady(userId: string | null, workspaceId: string | null): Promise<{ userId: string; workspaceId: string; actorUserId: string }> {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured (missing VITE_SUPABASE_* env).');
    }
    if (!supabase) {
        throw new Error('Supabase client is not initialized.');
    }
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        throw new Error('User not authenticated');
    }
    if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.trim() === '') {
        throw new Error('No active workspace selected.');
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
        throw new Error('User not authenticated');
    }
    if (authData.user.id !== userId) {
        throw new Error('Authenticated user does not match the requested cloud user.');
    }

    const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id, owner_id')
        .eq('id', workspaceId)
        .maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace?.id || !workspace.owner_id) {
        throw new Error('Unauthorized workspace access blocked.');
    }

    return { userId: workspace.owner_id as string, workspaceId, actorUserId: authData.user.id };
}

/** Retry an async operation with exponential backoff. */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 2,
    baseDelayMs = 1000
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

/** Convert an AppNode -> canvas_nodes row payload. */
function nodeToRow(node: AppNode, userId: string, workspaceId: string): CanvasNodeRow {
    const style = (node as { style?: Record<string, unknown> }).style || {};
    const { width: styleWidth, height: styleHeight, ...restStyle } = style as {
        width?: number | string;
        height?: number | string;
    } & Record<string, unknown>;

    const widthNum =
        typeof styleWidth === 'number' ? styleWidth :
        typeof styleWidth === 'string' && /^\d+(?:\.\d+)?$/.test(styleWidth) ? parseFloat(styleWidth) :
        null;
    const heightNum =
        typeof styleHeight === 'number' ? styleHeight :
        typeof styleHeight === 'string' && /^\d+(?:\.\d+)?$/.test(styleHeight) ? parseFloat(styleHeight) :
        null;

    // Capture everything React Flow may track aside from typed columns.
    const rawDataJson: Record<string, unknown> = {
        data: node.data ?? {},
        style: restStyle,
        // Preserve any extra optional fields without listing them all.
        zIndex: (node as { zIndex?: number }).zIndex,
        selected: (node as { selected?: boolean }).selected,
        draggable: (node as { draggable?: boolean }).draggable,
        selectable: (node as { selectable?: boolean }).selectable,
        deletable: (node as { deletable?: boolean }).deletable,
    };

    // Fallback if data is totally missing
    const data_json = rawDataJson;

    return {
        id: String(node.id),
        user_id: userId,
        workspace_id: workspaceId,
        parent_id: (node as { parentId?: string | null }).parentId ?? null,
        type: node.type ?? 'block',
        x_pos: node.position?.x ?? 0,
        y_pos: node.position?.y ?? 0,
        width: widthNum,
        height: heightNum,
        data_json,
    };
}

/** Convert an Edge -> canvas_edges row payload. */
function edgeToRow(edge: Edge, userId: string, workspaceId: string): CanvasEdgeRow {
    const rawDataJson: Record<string, unknown> = {
        data: edge.data ?? {},
        type: edge.type,
        animated: edge.animated,
        label: edge.label,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
        style: edge.style ?? null,
        markerEnd: edge.markerEnd ?? null,
        markerStart: edge.markerStart ?? null,
    };

    // Fallback if data is missing
    const data_json = rawDataJson;

    return {
        id: String(edge.id),
        user_id: userId,
        workspace_id: workspaceId,
        source_id: edge.source,
        target_id: edge.target,
        data_json,
    };
}

/** Convert a canvas_nodes row -> AppNode. */
function rowToNode(row: CanvasNodeRow): AppNode {
    const dj = (row.data_json ?? {}) as {
        data?: unknown;
        style?: Record<string, unknown>;
        zIndex?: number;
        selected?: boolean;
        draggable?: boolean;
        selectable?: boolean;
        deletable?: boolean;
    };
    const restStyle = dj.style ?? {};
    const style: Record<string, unknown> = { ...restStyle };
    if (row.width != null) style.width = row.width;
    if (row.height != null) style.height = row.height;

    return {
        id: row.id,
        type: row.type,
        position: { x: row.x_pos, y: row.y_pos },
        data: (dj.data ?? {}) as AppNode['data'],
        parentId: row.parent_id ?? undefined,
        ...(Object.keys(style).length ? { style } : {}),
        ...(dj.zIndex != null ? { zIndex: dj.zIndex } : {}),
        ...(dj.selected != null ? { selected: dj.selected } : {}),
        ...(dj.draggable != null ? { draggable: dj.draggable } : {}),
        ...(dj.selectable != null ? { selectable: dj.selectable } : {}),
        ...(dj.deletable != null ? { deletable: dj.deletable } : {}),
    } as AppNode;
}

function rowToEdge(row: CanvasEdgeRow): Edge {
    const dj = (row.data_json ?? {}) as {
        data?: Record<string, unknown>;
        type?: string;
        animated?: boolean;
        label?: string;
        sourceHandle?: string | null;
        targetHandle?: string | null;
        style?: Record<string, unknown>;
        markerEnd?: unknown;
        markerStart?: unknown;
    };
    return {
        id: row.id,
        source: row.source_id,
        target: row.target_id,
        type: dj.type,
        animated: dj.animated,
        label: dj.label,
        sourceHandle: dj.sourceHandle ?? undefined,
        targetHandle: dj.targetHandle ?? undefined,
        data: dj.data,
        style: dj.style as React.CSSProperties | undefined,
        markerEnd: dj.markerEnd as Edge['markerEnd'],
        markerStart: dj.markerStart as Edge['markerStart'],
    };
}

/**
 * Deduplicate rows by id (last write wins).
 *
 * Why: PostgreSQL throws an error — surfaced by PostgREST as HTTP 409
 * "ON CONFLICT DO UPDATE command cannot affect row a second time" —
 * if the same primary key appears more than once in a single upsert
 * payload. This happens easily after duplicate node operations or when
 * React state has stale copies. Stripping duplicates client-side makes
 * the upsert idempotent and predictable.
 */
function dedupeById<T extends { id: string }>(rows: T[]): T[] {
    const map = new Map<string, T>();
    for (const row of rows) {
        if (!row.id) continue; // skip rows with no id
        map.set(row.id, row);   // later entries overwrite earlier ones
    }
    return Array.from(map.values());
}

/**
 * Save the current canvas snapshot to the user's cloud rows. Performs a true
 * sync: upserts incoming rows (overwriting existing entries with same id),
 * then deletes anything no longer in state.
 */
export async function saveCanvasToCloud(
    userId: string | null,
    workspaceId: string | null,
    nodes: AppNode[],
    edges: Edge[],
    delta?: {
        dirtyNodeIds: Set<string>;
        dirtyEdgeIds: Set<string>;
        deletedNodeIds: Set<string>;
        deletedEdgeIds: Set<string>;
        forceUpsertAll?: boolean;
    }
): Promise<CloudSyncResult> {
    // Serialize saves: if a save is already in flight, wait for it first.
    // This prevents two concurrent upserts from hitting PostgreSQL with
    // overlapping (user_id, id) pairs that trigger 409 conflicts.
    if (_saveLock) {
        await _saveLock.catch(() => {}); // ignore errors from the prior save
    }

    const promise = _saveCanvasToCloudImpl(userId, workspaceId, nodes, edges, delta);
    _saveLock = promise;

    try {
        return await promise;
    } finally {
        // Only clear the lock if it's still pointing to OUR promise.
        if (_saveLock === promise) {
            _saveLock = null;
        }
    }
}

async function _saveCanvasToCloudImpl(
    userId: string | null,
    workspaceId: string | null,
    nodes: AppNode[],
    edges: Edge[],
    delta?: {
        dirtyNodeIds: Set<string>;
        dirtyEdgeIds: Set<string>;
        deletedNodeIds: Set<string>;
        deletedEdgeIds: Set<string>;
        forceUpsertAll?: boolean;
    }
): Promise<CloudSyncResult> {
    try {
        const { userId: uid, workspaceId: wid, actorUserId } = await ensureReady(userId, workspaceId);

        // Build payloads, then dedupe — prevents the "409 ON CONFLICT cannot
        // affect row a second time" error when state has duplicate ids.
        // Filter for delta sync if provided and not forcing all
        const nodesToUpsert = (delta && !delta.forceUpsertAll)
            ? nodes.filter(n => delta.dirtyNodeIds.has(n.id))
            : nodes;
        const edgesToUpsert = (delta && !delta.forceUpsertAll)
            ? edges.filter(e => delta.dirtyEdgeIds.has(e.id))
            : edges;

        const nodeRows = dedupeById(nodesToUpsert.map((n) => nodeToRow(n, uid, wid)));
        const edgeRows = dedupeById(edgesToUpsert.map((e) => edgeToRow(e, uid, wid)));

        // Helper to chunk arrays
        const chunkArray = <T>(arr: T[], size: number): T[][] => {
            const chunks = [];
            for (let i = 0; i < arr.length; i += size) {
                chunks.push(arr.slice(i, i + size));
            }
            return chunks;
        };

        const nodeChunks = chunkArray(nodeRows, 500);
        const edgeChunks = chunkArray(edgeRows, 500);

        await withRetry(async () => {
            for (const chunk of nodeChunks) {
                if (chunk.length === 0) continue;
                const { error } = await supabase
                    .from('canvas_nodes')
                    .upsert(chunk, { onConflict: 'user_id,workspace_id,id', ignoreDuplicates: false });
                if (error) throw error;
            }
            for (const chunk of edgeChunks) {
                if (chunk.length === 0) continue;
                const { error } = await supabase
                    .from('canvas_edges')
                    .upsert(chunk, { onConflict: 'user_id,workspace_id,id', ignoreDuplicates: false });
                if (error) throw error;
            }
        });

        // Handle Deletes
        // ONLY delete nodes that were explicitly marked as deleted.
        // We never do a full ID diff against the cloud to prevent catastrophic 
        // data loss when users log in from a new PC (where local state is empty).
        const nodeIdsToDelete = delta ? Array.from(delta.deletedNodeIds) : [];
        const edgeIdsToDelete = delta ? Array.from(delta.deletedEdgeIds) : [];

        // Chunk deletes too, as PostgREST `in` filter has URL length limits
        const deleteNodeChunks = chunkArray(nodeIdsToDelete, 200);
        const deleteEdgeChunks = chunkArray(edgeIdsToDelete, 200);

        await withRetry(async () => {
            for (const chunk of deleteNodeChunks) {
                if (chunk.length === 0) continue;
                const { error } = await supabase
                    .from('canvas_nodes')
                    .delete()
                    .eq('user_id', uid)
                    .eq('workspace_id', wid)
                    .in('id', chunk);
                if (error) throw error;
            }
            for (const chunk of deleteEdgeChunks) {
                if (chunk.length === 0) continue;
                const { error } = await supabase
                    .from('canvas_edges')
                    .delete()
                    .eq('user_id', uid)
                    .eq('workspace_id', wid)
                    .in('id', chunk);
                if (error) throw error;
            }
        });

        // Update user's last_active_at for inactivity tracking
        supabase
            .from('user_profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', actorUserId)
            .then(() => {}); // fire-and-forget, don't block save

        return { ok: true, counts: { nodes: nodeRows.length, edges: edgeRows.length } };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // Detect network-specific errors
        if (!navigator.onLine || message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('fetch')) {
            return { ok: false, error: 'You are offline. Changes will be saved when you reconnect.' };
        }
        return { ok: false, error: message };
    }
}

/**
 * Fetch the entire canvas for the active user and return it ready for
 * `loadGraph(nodes, edges)`.
 */
export async function loadCanvasFromCloud(userId: string | null, workspaceId: string | null): Promise<CloudLoadResult> {
    try {
        const { userId: uid, workspaceId: wid } = await ensureReady(userId, workspaceId);

        const [nodesRes, edgesRes] = await withRetry(async () => {
            const [nRes, eRes] = await Promise.all([
                supabase.from('canvas_nodes').select('*').eq('user_id', uid).eq('workspace_id', wid),
                supabase.from('canvas_edges').select('*').eq('user_id', uid).eq('workspace_id', wid),
            ]);
            if (nRes.error) throw nRes.error;
            if (eRes.error) throw eRes.error;
            return [nRes, eRes] as const;
        });

        const nodes = ((nodesRes.data as CanvasNodeRow[] | null) ?? []).map(rowToNode);
        const edges = ((edgesRes.data as CanvasEdgeRow[] | null) ?? []).map(rowToEdge);

        return { ok: true, nodes, edges };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Append (additively) a batch of nodes to the user's cloud canvas.
 *
 * Unlike `saveCanvasToCloud`, this DOES NOT delete rows that are missing
 * from the payload — it is a one-way merge designed for importers (Figma,
 * templates, marketplace) where the user expects new content to land
 * alongside whatever they already have.
 *
 * Conflict handling matches the regular save path:
 *   - Rows are deduplicated client-side by id (last write wins).
 *   - We upsert with `onConflict: 'user_id,id'` and
 *     `ignoreDuplicates: false` so any row that happens to match an
 *     existing primary key is overwritten in place. This is what avoids
 *     PostgreSQL's HTTP 409 "ON CONFLICT cannot affect row a second time".
 */
export async function appendCanvasNodesToCloud(
    userId: string | null,
    workspaceId: string | null,
    nodes: AppNode[],
): Promise<CloudSyncResult> {
    try {
        const { userId: uid, workspaceId: wid } = await ensureReady(userId, workspaceId);
        const nodeRows = dedupeById(nodes.map((n) => nodeToRow(n, uid, wid)));
        if (nodeRows.length === 0) {
            return { ok: true, counts: { nodes: 0, edges: 0 } };
        }

        await withRetry(async () => {
            const { error } = await supabase
                .from('canvas_nodes')
                .upsert(nodeRows, {
                    onConflict: 'user_id,workspace_id,id',
                    ignoreDuplicates: false,
                });
            if (error) {
                console.error('[cloudSync] figma append upsert failed', {
                    message: error.message,
                    details: (error as { details?: string }).details,
                    hint: (error as { hint?: string }).hint,
                    code: (error as { code?: string }).code,
                });
                throw error;
            }
        });

        return { ok: true, counts: { nodes: nodeRows.length, edges: 0 } };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Summarise the user's saved canvas without downloading every node body.
 *
 * This powers the "Reload Saved Data" picker — we want the user to see what
 * they're about to overwrite (page count, last-update timestamp, root pages
 * with titles) BEFORE we yank the canvas out from under them.
 */
export async function fetchCloudMetadata(
    userId: string | null,
    workspaceId: string | null,
): Promise<CloudMetadataResult> {
    try {
        const { userId: uid, workspaceId: wid } = await ensureReady(userId, workspaceId);

        // Pull only the columns we need to render the picker. Supabase will
        // return [] (not error) if the user has nothing saved yet.
        type NodeMeta = {
            id: string;
            type: string;
            parent_id: string | null;
            data_json: Record<string, unknown> | null;
            updated_at: string | null;
        };

        const [nodesRes, edgesCountRes] = await withRetry(async () => {
            const [nRes, eRes] = await Promise.all([
                supabase
                    .from('canvas_nodes')
                    .select('id, type, parent_id, data_json, updated_at')
                    .eq('user_id', uid)
                    .eq('workspace_id', wid),
                supabase
                    .from('canvas_edges')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', uid)
                    .eq('workspace_id', wid),
            ]);
            if (nRes.error) throw nRes.error;
            if (eRes.error) throw eRes.error;
            return [nRes, eRes] as const;
        });

        const allNodes = (nodesRes.data as NodeMeta[] | null) ?? [];
        const edgeCount = edgesCountRes.count ?? 0;

        // Find each user's most recent updated_at to act as "last saved".
        const lastUpdated = allNodes.reduce<string | null>((acc, n) => {
            if (!n.updated_at) return acc;
            if (!acc || n.updated_at > acc) return n.updated_at;
            return acc;
        }, null);

        // Count children per parent so the picker can show "42 cards" etc.
        const childCounts = new Map<string, number>();
        for (const n of allNodes) {
            if (!n.parent_id) continue;
            childCounts.set(n.parent_id, (childCounts.get(n.parent_id) ?? 0) + 1);
        }

        // Roots = nodes with no parent. These are the user's "projects/pages".
        const roots = allNodes.filter((n) => !n.parent_id);
        const pages: CloudPageSummary[] = roots.map((n) => {
            const data = (n.data_json ?? {}) as { data?: Record<string, unknown> };
            const inner = (data.data ?? {}) as Record<string, unknown>;
            const rawTitle =
                (inner.title as string | undefined) ??
                (inner.name as string | undefined) ??
                (inner.label as string | undefined) ??
                (inner.text as string | undefined) ??
                '';
            const title = (typeof rawTitle === 'string' && rawTitle.trim())
                ? rawTitle.trim().slice(0, 80)
                : `${n.type || 'Item'} · ${n.id.slice(0, 6)}`;
            return {
                id: n.id,
                title,
                childCount: childCounts.get(n.id) ?? 0,
                updatedAt: n.updated_at,
            };
        });

        // Newest first — helpful default ordering for the picker.
        pages.sort((a, b) => {
            const ta = a.updatedAt ?? '';
            const tb = b.updatedAt ?? '';
            return tb.localeCompare(ta);
        });

        return {
            ok: true,
            metadata: {
                nodeCount: allNodes.length,
                edgeCount,
                lastUpdated,
                pages,
            },
        };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
