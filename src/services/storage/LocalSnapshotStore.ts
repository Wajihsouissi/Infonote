/**
 * LocalSnapshotStore — IndexedDB safety-net persistence for the canvas.
 *
 * Neither of the explicit backends covers every user: the local-folder
 * backend needs the File System Access API (Chromium-only) plus an explicit
 * connect, and cloud sync needs a signed-in user with a workspace. Anyone
 * outside both would otherwise keep their whole canvas in memory only.
 *
 * This store transparently snapshots nodes+edges to IndexedDB on every change
 * (debounced by StorageManager) and is restored on boot when no other backend
 * supplies data. It is intentionally invisible to the storage UI — it is a
 * recovery net, not a user-facing backend.
 */
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../../types';

const DB_NAME = 'chnk-it-local';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'latest';

export interface CanvasSnapshot {
    nodes: AppNode[];
    edges: Edge[];
    savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not available.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    });
}

export async function saveSnapshot(nodes: AppNode[], edges: Edge[]): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            // JSON round-trip: detaches from the live store (IDB serialization
            // must not observe concurrent mutation) and drops anything the
            // structured-clone algorithm would reject (functions, DOM refs).
            const snapshot: CanvasSnapshot = {
                nodes: JSON.parse(JSON.stringify(nodes)),
                edges: JSON.parse(JSON.stringify(edges)),
                savedAt: Date.now(),
            };
            tx.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('Snapshot write failed.'));
            tx.onabort = () => reject(tx.error ?? new Error('Snapshot write aborted.'));
        });
    } finally {
        db.close();
    }
}

export async function loadSnapshot(): Promise<CanvasSnapshot | null> {
    const db = await openDb();
    try {
        return await new Promise<CanvasSnapshot | null>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
            request.onsuccess = () => {
                const value = request.result as CanvasSnapshot | undefined;
                if (value && Array.isArray(value.nodes) && Array.isArray(value.edges)) {
                    resolve(value);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error ?? new Error('Snapshot read failed.'));
        });
    } finally {
        db.close();
    }
}
