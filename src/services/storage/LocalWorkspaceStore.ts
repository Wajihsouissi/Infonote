/**
 * Durable, local-first workspace persistence.
 *
 * Zustand is the live projection used by React. This IndexedDB record is the
 * durable copy that survives refreshes, crashes, and offline sessions. Cloud
 * sync metadata lives beside the graph so a device can check a small server
 * revision instead of downloading the whole workspace on every launch.
 */
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../../types';
import { nodesEquivalent, edgesEquivalent } from '../../store/historyConfig';

const DB_NAME = 'infonote-local-workspaces';
const DB_VERSION = 3;
const STORE = 'workspaces';
const NODE_STORE = 'workspace-nodes';
const EDGE_STORE = 'workspace-edges';
const BACKUP_STORE = 'restore-backups';
const LAST_WORKSPACE_KEY = 'infonote.last-local-workspace-key';

export interface LocalWorkspaceRecord {
    key: string;
    nodes: AppNode[];
    edges: Edge[];
    dirtyNodeIds: string[];
    dirtyEdgeIds: string[];
    deletedNodeIds: string[];
    deletedEdgeIds: string[];
    /** Last cloud revision checked by this device. */
    cloudRevision: string | null;
    /** True after this device has completed its first cloud handshake. */
    cloudHydrated: boolean;
    /* NOTE: this record used to also carry `syncedNodes`/`syncedEdges` — a
       full copy of the last cloud-acknowledged graph, kept for a three-way
       merge that was never implemented. Nothing ever read them, and they
       doubled every write and the workspace's whole footprint against the
       browser's storage quota (measured: 4.58 MB of graph stored as 9.15 MB).
       A real three-way merge should reintroduce a base deliberately, and
       almost certainly as a diff rather than a second copy of everything. */
    updatedAt: number;
    lastSyncedAt: number | null;
    /**
     * Day (UTC, `YYYY-MM-DD`) whose cloud safety copy this device has already
     * uploaded. The server keeps one per day and discards the rest, so without
     * this the client would re-upload the whole graph on every single save for
     * the database to throw away.
     */
    lastDailyVersionKey: string | null;
}

export interface LocalRestoreBackup {
    key: string;
    nodes: AppNode[];
    edges: Edge[];
    timestamp: number;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('This browser does not support local workspace storage.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(BACKUP_STORE)) {
                db.createObjectStore(BACKUP_STORE, { keyPath: 'key' });
            }
            for (const name of [NODE_STORE, EDGE_STORE]) {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name, { keyPath: ['workspace', 'id'] })
                        .createIndex('workspace', 'workspace');
                }
            }
        };
        request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
        };
        request.onerror = () => reject(request.error ?? new Error('Could not open local workspace storage.'));
    });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        value.onsuccess = () => resolve(value.result);
        value.onerror = () => reject(value.error ?? new Error('Local workspace request failed.'));
    });
}

async function transaction<T>(
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => Promise<T>,
    storeName = STORE,
): Promise<T> {
    const db = await openDb();
    try {
        const tx = db.transaction(storeName, mode);
        const completed = new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('Local workspace transaction failed.'));
            tx.onabort = () => reject(tx.error ?? new Error('Local workspace transaction was aborted.'));
        });
        // Observe both failures immediately, including a synchronous put error.
        try {
            const [result] = await Promise.all([body(tx.objectStore(storeName)), completed]);
            return result;
        } catch (error) {
            try { tx.abort(); } catch { /* Already completed/aborted. */ }
            throw error;
        }
    } finally {
        db.close();
    }
}

const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function normalizeRecord(value: LocalWorkspaceRecord | undefined): LocalWorkspaceRecord | null {
    if (!value || typeof value.key !== 'string' || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
        return null;
    }
    return {
        key: value.key,
        nodes: value.nodes,
        edges: value.edges,
        dirtyNodeIds: strings(value.dirtyNodeIds),
        dirtyEdgeIds: strings(value.dirtyEdgeIds),
        deletedNodeIds: strings(value.deletedNodeIds),
        deletedEdgeIds: strings(value.deletedEdgeIds),
        cloudRevision: typeof value.cloudRevision === 'string' ? value.cloudRevision : null,
        cloudHydrated: value.cloudHydrated === true,
        // Records written before this field was dropped still carry the two
        // graph copies; rebuilding the record without them lets the next save
        // reclaim that space rather than migrating it forward forever.
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
        lastSyncedAt: typeof value.lastSyncedAt === 'number' ? value.lastSyncedAt : null,
        lastDailyVersionKey:
            typeof value.lastDailyVersionKey === 'string' ? value.lastDailyVersionKey : null,
    };
}

type WorkspaceHeader = Omit<LocalWorkspaceRecord, 'nodes' | 'edges'> & {
    format: 3;
    nodeIds: string[];
    edgeIds: string[];
    commit: string;
};
type EntityRow<T> = { workspace: string; id: string; value: T };

// Ordering lives at the service boundary, so effect cleanup, remounts and
// explicit saves cannot overtake each other. Failed writes release the queue.
let operations: Promise<unknown> = Promise.resolve();
function ordered<T>(operation: () => Promise<T>): Promise<T> {
    const result = operations.catch(() => undefined).then(operation);
    operations = result.catch(() => undefined);
    return result;
}

// Only the active workspace is cached; references share the live graph and
// avoid retaining a full second graph for every workspace ever opened.
let committed: { key: string; commit: string; nodes: Map<string, AppNode>; edges: Map<string, Edge> } | null = null;

async function graphTransaction<T>(mode: IDBTransactionMode, body: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await openDb();
    const tx = db.transaction([STORE, NODE_STORE, EDGE_STORE], mode);
    const completed = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Local save was interrupted.'));
    });
    try {
        const [result] = await Promise.all([body(tx), completed]);
        return result;
    } catch (error) {
        try { tx.abort(); } catch { /* Already settled. */ }
        throw error;
    } finally {
        db.close();
    }
}

export function loadLocalWorkspace(key: string): Promise<LocalWorkspaceRecord | null> {
    return ordered(() => graphTransaction('readonly', async (tx) => {
        const header = await request(tx.objectStore(STORE).get(key)) as WorkspaceHeader | LocalWorkspaceRecord | undefined;
        if (!header) return null;
        // Upgrade lazily: keep the old graph intact until the first successful
        // atomic save commits both entity stores and the new header.
        if (!('format' in header) || header.format !== 3) return normalizeRecord(header as LocalWorkspaceRecord);
        const [nodeRows, edgeRows] = await Promise.all([
            request(tx.objectStore(NODE_STORE).index('workspace').getAll(key)) as Promise<EntityRow<AppNode>[]>,
            request(tx.objectStore(EDGE_STORE).index('workspace').getAll(key)) as Promise<EntityRow<Edge>[]>,
        ]);
        const nodes = new Map(nodeRows.map((row) => [row.id, row.value]));
        const edges = new Map(edgeRows.map((row) => [row.id, row.value]));
        if (header.nodeIds.some((id) => !nodes.has(id)) || header.edgeIds.some((id) => !edges.has(id))) {
            throw new Error('The local workspace is incomplete. Keep this tab open and retry saving.');
        }
        committed = { key, commit: header.commit, nodes, edges };
        return normalizeRecord({ ...header, nodes: header.nodeIds.map((id) => nodes.get(id)!), edges: header.edgeIds.map((id) => edges.get(id)!) });
    }));
}

export function saveLocalWorkspace(record: LocalWorkspaceRecord): Promise<void> {
    return ordered(async () => {
        const nodes = new Map(record.nodes.map((node) => [node.id, node]));
        const edges = new Map(record.edges.map((edge) => [edge.id, edge]));
        const commit = crypto.randomUUID();
        await graphTransaction('readwrite', async (tx) => {
            const store = tx.objectStore(STORE);
            const previous = await request(store.get(record.key)) as WorkspaceHeader | LocalWorkspaceRecord | undefined;
            const header = previous && 'format' in previous && previous.format === 3 ? previous : null;
            const base = header && committed?.key === record.key && committed.commit === header.commit ? committed : null;
            const nodeStore = tx.objectStore(NODE_STORE);
            const edgeStore = tx.objectStore(EDGE_STORE);
            // Entity writes and outbox acknowledgements commit together. A
            // one-card edit clones only that card, never the entire workspace.
            for (const [id, node] of nodes) {
                const old = base?.nodes.get(id);
                if (!old || !nodesEquivalent(old, node)) nodeStore.put({ workspace: record.key, id, value: node });
            }
            for (const [id, edge] of edges) {
                const old = base?.edges.get(id);
                if (!old || !edgesEquivalent(old, edge)) edgeStore.put({ workspace: record.key, id, value: edge });
            }
            for (const id of header?.nodeIds ?? []) if (!nodes.has(id)) nodeStore.delete([record.key, id]);
            for (const id of header?.edgeIds ?? []) if (!edges.has(id)) edgeStore.delete([record.key, id]);
            const normalized = normalizeRecord(record)!;
            const { nodes: _nodes, edges: _edges, ...metadata } = normalized;
            store.put({ ...metadata, format: 3, commit, nodeIds: [...nodes.keys()], edgeIds: [...edges.keys()] } satisfies WorkspaceHeader);
        });
        committed = { key: record.key, commit, nodes, edges };
    });
}

export async function saveRestoreBackup(backup: LocalRestoreBackup): Promise<void> {
    await transaction('readwrite', async (store) => {
        await request(store.put(backup));
    }, BACKUP_STORE);
}

export async function loadRestoreBackup(key: string): Promise<LocalRestoreBackup | null> {
    const value = await transaction('readonly', (store) =>
        request(store.get(key) as IDBRequest<LocalRestoreBackup | undefined>),
    BACKUP_STORE);
    if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
    return value;
}

export async function deleteRestoreBackup(key: string): Promise<void> {
    await transaction('readwrite', async (store) => {
        await request(store.delete(key));
    }, BACKUP_STORE);
}

/**
 * A signed-out user keeps editing the last workspace locally, matching the
 * existing product promise. A brand-new device starts in an anonymous record.
 */
export function resolveLocalWorkspaceKey(workspaceId: string | null): string {
    if (typeof window === 'undefined') return workspaceId ? `workspace:${workspaceId}` : 'anonymous';
    if (workspaceId) {
        const key = `workspace:${workspaceId}`;
        localStorage.setItem(LAST_WORKSPACE_KEY, key);
        return key;
    }
    return localStorage.getItem(LAST_WORKSPACE_KEY) || 'anonymous';
}
