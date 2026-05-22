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
 *   - All access is gated through Supabase RLS, which restricts every row to
 *     `auth.uid() = user_id`. We additionally pass user_id in the payload so
 *     RLS `with check` succeeds.
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

interface CanvasNodeRow {
    id: string;
    user_id: string;
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
    source_id: string;
    target_id: string;
    data_json: Record<string, unknown>;
}

function ensureReady(userId: string | null): string {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured (missing VITE_SUPABASE_* env).');
    }
    if (!userId) {
        throw new Error('You must be signed in to use cloud sync.');
    }
    return userId;
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
function nodeToRow(node: AppNode, userId: string): CanvasNodeRow {
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
    const data_json: Record<string, unknown> = {
        data: node.data ?? {},
        style: restStyle,
        // Preserve any extra optional fields without listing them all.
        zIndex: (node as { zIndex?: number }).zIndex,
        selected: (node as { selected?: boolean }).selected,
        draggable: (node as { draggable?: boolean }).draggable,
        selectable: (node as { selectable?: boolean }).selectable,
        deletable: (node as { deletable?: boolean }).deletable,
    };

    return {
        id: String(node.id),
        user_id: userId,
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
function edgeToRow(edge: Edge, userId: string): CanvasEdgeRow {
    const data_json: Record<string, unknown> = {
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
    return {
        id: String(edge.id),
        user_id: userId,
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
 * Save the current canvas snapshot to the user's cloud rows. Performs a true
 * sync: upserts incoming rows, then deletes anything no longer in state.
 */
export async function saveCanvasToCloud(
    userId: string | null,
    nodes: AppNode[],
    edges: Edge[],
): Promise<CloudSyncResult> {
    try {
        const uid = ensureReady(userId);

        const nodeRows = nodes.map((n) => nodeToRow(n, uid));
        const edgeRows = edges.map((e) => edgeToRow(e, uid));

        // Upsert (chunked — Supabase handles a few thousand rows per request).
        await withRetry(async () => {
            if (nodeRows.length > 0) {
                const { error } = await supabase
                    .from('canvas_nodes')
                    .upsert(nodeRows, { onConflict: 'user_id,id' });
                if (error) throw error;
            }
            if (edgeRows.length > 0) {
                const { error } = await supabase
                    .from('canvas_edges')
                    .upsert(edgeRows, { onConflict: 'user_id,id' });
                if (error) throw error;
            }
        });

        // Mirror deletes — remove rows that no longer exist locally. We fetch
        // the current ids and diff them client-side; this is robust regardless
        // of how exotic the id strings are (UUIDs, slugs, etc.).
        const localNodeIds = new Set(nodeRows.map((r) => r.id));
        const localEdgeIds = new Set(edgeRows.map((r) => r.id));

        const [existingNodes, existingEdges] = await withRetry(async () => {
            const [nRes, eRes] = await Promise.all([
                supabase.from('canvas_nodes').select('id').eq('user_id', uid),
                supabase.from('canvas_edges').select('id').eq('user_id', uid),
            ]);
            if (nRes.error) throw nRes.error;
            if (eRes.error) throw eRes.error;
            return [nRes, eRes] as const;
        });

        const nodeIdsToDelete = (existingNodes.data ?? [])
            .map((r: { id: string }) => r.id)
            .filter((id: string) => !localNodeIds.has(id));
        const edgeIdsToDelete = (existingEdges.data ?? [])
            .map((r: { id: string }) => r.id)
            .filter((id: string) => !localEdgeIds.has(id));

        await withRetry(async () => {
            if (nodeIdsToDelete.length > 0) {
                const { error } = await supabase
                    .from('canvas_nodes')
                    .delete()
                    .eq('user_id', uid)
                    .in('id', nodeIdsToDelete);
                if (error) throw error;
            }
            if (edgeIdsToDelete.length > 0) {
                const { error } = await supabase
                    .from('canvas_edges')
                    .delete()
                    .eq('user_id', uid)
                    .in('id', edgeIdsToDelete);
                if (error) throw error;
            }
        });

        return { ok: true, counts: { nodes: nodeRows.length, edges: edgeRows.length } };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Fetch the entire canvas for the active user and return it ready for
 * `loadGraph(nodes, edges)`.
 */
export async function loadCanvasFromCloud(userId: string | null): Promise<CloudLoadResult> {
    try {
        const uid = ensureReady(userId);

        const [nodesRes, edgesRes] = await withRetry(async () => {
            const [nRes, eRes] = await Promise.all([
                supabase.from('canvas_nodes').select('*').eq('user_id', uid),
                supabase.from('canvas_edges').select('*').eq('user_id', uid),
            ]);
            if (nRes.error) throw nRes.error;
            if (eRes.error) throw eRes.error;
            return [nRes, eRes] as const;
        });

        const nodes = (nodesRes.data as CanvasNodeRow[] | null ?? []).map(rowToNode);
        const edges = (edgesRes.data as CanvasEdgeRow[] | null ?? []).map(rowToEdge);

        return { ok: true, nodes, edges };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
