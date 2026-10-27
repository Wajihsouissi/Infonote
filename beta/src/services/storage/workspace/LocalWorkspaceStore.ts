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
import type { AppNode } from '../../../types';
import { nodesEquivalent, edgesEquivalent } from '../../../store/historyConfig';
import { openDatabase } from '../openDatabase';

const DB_NAME = 'infonote-local-workspaces';
// Same format-3 rows. The version fence prevents pre-policy v3 tabs from
// reopening this database and silently bypassing stale-writer refusal.
const DB_VERSION = 4;
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

export interface LocalWorkspaceSummary {
    nodes: number;
    edges: number;
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
    return openDatabase(DB_NAME, DB_VERSION, db => {
        if (!db.objectStoreNames.contains(HEADER_STORE)) {
            db.createObjectStore(HEADER_STORE, { keyPath: 'key' });
        }
        for (const name of [NODE_STORE, EDGE_STORE]) {
            if (!db.objectStoreNames.contains(name)) {
                db.createObjectStore(name, { keyPath: ['workspace', 'id'] })
                    .createIndex('workspace', 'workspace');
            }
        }
    });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        value.onsuccess = () => resolve(value.result);
        value.onerror = () => reject(value.error ?? new Error('Local workspace request failed.'));
    });
}

/** Queue dependent writes inside the request event, while the transaction is
 * active. Firefox can commit before a Promise continuation after a tab switch. */
function continueRequest<T>(value: IDBRequest<T>, next: (result: T) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        value.onsuccess = () => {
            try { next(value.result); resolve(); }
            catch (error) {
                try { value.transaction?.abort(); } catch { /* Already settled. */ }
                reject(error);
            }
        };
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
type Committed = { commit: string | null; nodes: Map<string, AppNode>; edges: Map<string, Edge> };
const committed = new Map<string, Committed>();

export class LocalWorkspaceConflictError extends Error {
    constructor() {
        super('Another tab has saved a newer workspace. Keep this tab open and download your changes before reopening the saved workspace.');
        this.name = 'LocalWorkspaceConflictError';
    }
}

function verifyHeader(header: WorkspaceHeader): void {
    if (header.format !== 3) throw new Error('This saved workspace uses an unsupported format. Its saved data has not been changed.');
    if (typeof header.commit !== 'string' || !header.commit || !Number.isFinite(header.updatedAt)
        || ![header.nodeIds, header.edgeIds].every(ids => Array.isArray(ids)
            && ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length)) {
        throw new Error('The saved workspace header is incomplete. Keep its saved data and open workspace recovery.');
    }
}
const sameOrder = (previous: string[], next: Map<string, unknown>) => {
    if (previous.length !== next.size) return false;
    let index = 0;
    for (const id of next.keys()) if (previous[index++] !== id) return false;
    return true;
};
const CHANNEL = 'chnk-it-browser-workspace';
function announce(key: string) {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return;
    try { const channel = new window.BroadcastChannel(CHANNEL); channel.postMessage({ key }); channel.close(); }
    catch { /* Transactional refusal remains effective without notifications. */ }
}
/** Notifications are advisory; verify the current durable revision rather than
 * trusting message arrival order. They never rebase the visible document. */
export function subscribeLocalWorkspaceChanges(listener: (key: string) => void): () => void {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return () => {};
    let channel: BroadcastChannel;
    try { channel = new window.BroadcastChannel(CHANNEL); } catch { return () => {}; }
    let stopped = false;
    channel.onmessage = event => {
        const key = event.data?.key;
        if (typeof key !== 'string' || !committed.has(key)) return;
        void ordered(() => graphTransaction('readonly', async tx => {
            const header = await request(tx.objectStore(HEADER_STORE).get(key)) as WorkspaceHeader | undefined;
            return (header?.commit ?? null) !== committed.get(key)?.commit;
        })).then(changed => { if (changed && !stopped) listener(key); }).catch(() => { /* The next save/load surfaces storage failures. */ });
    };
    return () => { stopped = true; channel.close(); };
}

/** Recovery can inspect the saved header without materializing every record. */
export function readLocalWorkspaceSummary(key: string): Promise<LocalWorkspaceSummary | null> {
    return ordered(() => graphTransaction('readonly', async tx => {
        const header = await request(tx.objectStore(HEADER_STORE).get(key)) as WorkspaceHeader | undefined;
        if (!header) return null;
        verifyHeader(header);
        return { nodes: header.nodeIds.length, edges: header.edgeIds.length, updatedAt: header.updatedAt };
    }));
}

export function loadLocalWorkspace(key: string): Promise<LocalWorkspaceRecord | null> {
    return ordered(() => graphTransaction('readonly', async (tx) => {
        // Enqueue all reads before yielding; the transaction may otherwise
        // become inactive between the header read and the entity reads.
        const [header, nodeRows, edgeRows] = await Promise.all([
            request(tx.objectStore(HEADER_STORE).get(key)) as Promise<WorkspaceHeader | undefined>,
            request(tx.objectStore(NODE_STORE).index('workspace').getAll(key)) as Promise<EntityRow<AppNode>[]>,
            request(tx.objectStore(EDGE_STORE).index('workspace').getAll(key)) as Promise<EntityRow<Edge>[]>,
        ]);
        if (!header) {
            if (nodeRows.length || edgeRows.length) throw new Error('Saved workspace records have no header. Open workspace recovery before making changes.');
            committed.set(key, { commit: null, nodes: new Map(), edges: new Map() });
            return null;
        }
        verifyHeader(header);
        const nodes = new Map(nodeRows.map((row) => [row.id, row.value]));
        const edges = new Map(edgeRows.map((row) => [row.id, row.value]));
        if (header.nodeIds.some((id) => !nodes.has(id)) || header.edgeIds.some((id) => !edges.has(id))) {
            throw new Error('The local workspace is incomplete. Keep this tab open and retry saving.');
        }
        if (header.nodeIds.some(id => nodes.get(id)?.id !== id) || header.edgeIds.some(id => edges.get(id)?.id !== id)) {
            throw new Error('Saved workspace item identities do not match their header. Open workspace recovery before continuing.');
        }
        committed.set(key, { commit: header.commit, nodes, edges });
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
        if (typeof record.key !== 'string' || !record.key || !Number.isFinite(record.updatedAt)) throw new Error('The workspace save has an invalid key or timestamp. Its saved copy has not been changed.');
        if (nodes.size !== record.nodes.length || edges.size !== record.edges.length
            || [...nodes.keys(), ...edges.keys()].some(id => typeof id !== 'string' || !id)) {
            throw new Error('The workspace contains duplicate or missing item identities. Its saved copy has not been changed.');
        }
        // uuid rather than crypto.randomUUID: the latter only exists in
        // secure contexts, and a LAN address over http is not one.
        const commit = uuidv4();
        let wrote = false;
        const known = committed.get(record.key);
        await graphTransaction('readwrite', (tx) => {
            const headers = tx.objectStore(HEADER_STORE);
            return continueRequest(headers.get(record.key), (previous: WorkspaceHeader | undefined) => {
                if (previous) verifyHeader(previous);
                // The comparison and every write share one readwrite transaction.
                // An independent writer cannot pass this check concurrently.
                if ((previous?.commit ?? null) !== (known?.commit ?? null)) throw new LocalWorkspaceConflictError();
                const base = known;
                if (previous && base && sameOrder(previous.nodeIds, nodes) && sameOrder(previous.edgeIds, edges)
                    && [...nodes].every(([id, node]) => { const old = base.nodes.get(id); return old && nodesEquivalent(old, node); })
                    && [...edges].every(([id, edge]) => { const old = base.edges.get(id); return old && edgesEquivalent(old, edge); })) return;
                wrote = true;
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
        });
        committed.set(record.key, { commit: wrote ? commit : known?.commit ?? null, nodes, edges });
        if (wrote) announce(record.key);
    });
}
