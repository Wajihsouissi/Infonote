/**
 * Durable workspace storage in this browser (IndexedDB).
 *
 * Zustand is the live projection React renders; this is the copy that survives
 * refreshes, crashes and offline sessions. The layout is the full app's
 * "format 3" — one header per workspace plus one row per node and per edge —
 * so a one-card edit rewrites that card, never the whole workspace, and the
 * data needs no conversion when cloud sync returns.
 *
 * Adding an object store later requires bumping DB_VERSION: onupgradeneeded
 * only runs when the version changes.
 */
import type { Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../../types';
import { nodesEquivalent, edgesEquivalent } from '../../store/historyConfig';

const DB_NAME = 'infonote-local-workspaces';
const DB_VERSION = 3;
const HEADER_STORE = 'workspaces';
const NODE_STORE = 'workspace-nodes';
const EDGE_STORE = 'workspace-edges';

/** The one workspace a browser holds in the beta. Same key the full app uses
 *  for signed-out work, so a later first cloud connection adopts it. */
export const LOCAL_WORKSPACE_KEY = 'anonymous';

export interface LocalWorkspaceRecord {
    key: string;
    nodes: AppNode[];
    edges: Edge[];
    updatedAt: number;
}

type WorkspaceHeader = {
    key: string;
    format: 3;
    /** Changes on every save; lets a save trust its in-memory base. */
    commit: string;
    nodeIds: string[];
    edgeIds: string[];
    updatedAt: number;
};
type EntityRow<T> = { workspace: string; id: string; value: T };

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('This browser does not support local workspace storage.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(HEADER_STORE)) {
                db.createObjectStore(HEADER_STORE, { keyPath: 'key' });
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

/** Run `body` in one transaction over all three stores; settles only when the
 *  transaction commits, so a resolved save is a durable save. */
async function graphTransaction<T>(mode: IDBTransactionMode, body: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await openDb();
    const tx = db.transaction([HEADER_STORE, NODE_STORE, EDGE_STORE], mode);
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

// Every operation runs in call order, so a late load can never overtake a
// save (or the reverse). A failed operation releases the queue.
let operations: Promise<unknown> = Promise.resolve();
function ordered<T>(operation: () => Promise<T>): Promise<T> {
    const result = operations.catch(() => undefined).then(operation);
    operations = result.catch(() => undefined);
    return result;
}

// The last committed graph, by reference. It is what lets a save skip every
// node and edge that has not changed since.
let committed: { key: string; commit: string; nodes: Map<string, AppNode>; edges: Map<string, Edge> } | null = null;

export function loadLocalWorkspace(key: string): Promise<LocalWorkspaceRecord | null> {
    return ordered(() => graphTransaction('readonly', async (tx) => {
        const header = await request(tx.objectStore(HEADER_STORE).get(key)) as WorkspaceHeader | undefined;
        if (!header || header.format !== 3) return null;
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
        return {
            key,
            nodes: header.nodeIds.map((id) => nodes.get(id)!),
            edges: header.edgeIds.map((id) => edges.get(id)!),
            updatedAt: header.updatedAt,
        };
    }));
}

export function saveLocalWorkspace(record: LocalWorkspaceRecord): Promise<void> {
    return ordered(async () => {
        const nodes = new Map(record.nodes.map((node) => [node.id, node]));
        const edges = new Map(record.edges.map((edge) => [edge.id, edge]));
        // uuid rather than crypto.randomUUID: the latter only exists in
        // secure contexts, and a LAN address over http is not one.
        const commit = uuidv4();
        await graphTransaction('readwrite', async (tx) => {
            const headers = tx.objectStore(HEADER_STORE);
            const previous = await request(headers.get(record.key)) as WorkspaceHeader | undefined;
            // Trust the in-memory base only if it is exactly what is on disk.
            const base = previous && committed?.key === record.key && committed.commit === previous.commit
                ? committed
                : null;
            const nodeStore = tx.objectStore(NODE_STORE);
            const edgeStore = tx.objectStore(EDGE_STORE);
            for (const [id, node] of nodes) {
                const old = base?.nodes.get(id);
                if (!old || !nodesEquivalent(old, node)) nodeStore.put({ workspace: record.key, id, value: node });
            }
            for (const [id, edge] of edges) {
                const old = base?.edges.get(id);
                if (!old || !edgesEquivalent(old, edge)) edgeStore.put({ workspace: record.key, id, value: edge });
            }
            for (const id of previous?.nodeIds ?? []) if (!nodes.has(id)) nodeStore.delete([record.key, id]);
            for (const id of previous?.edgeIds ?? []) if (!edges.has(id)) edgeStore.delete([record.key, id]);
            headers.put({
                key: record.key,
                format: 3,
                commit,
                nodeIds: [...nodes.keys()],
                edgeIds: [...edges.keys()],
                updatedAt: record.updatedAt,
            } satisfies WorkspaceHeader);
        });
        committed = { key: record.key, commit, nodes, edges };
    });
}
