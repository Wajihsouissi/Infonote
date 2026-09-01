/**
 * assetStore
 * --------------------------------------------------------------------------
 * IndexedDB blob storage for uploaded files.
 *
 * Deliberately its own database: assets are the only thing here likely to run
 * into the origin's storage quota. Keeping file blobs isolated means a full
 * asset store cannot interfere with the app's saved graph backends.
 *
 * Records are content-addressed by SHA-256, so dropping the same file onto two
 * cards stores one blob and hands back one id.
 */
import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'chnk-it-assets';
const DB_VERSION = 1;
const STORE = 'assets';
const HASH_INDEX = 'by-hash';

/**
 * Above this, hashing is skipped. `crypto.subtle.digest` needs the whole file
 * as one ArrayBuffer, and holding a 100 MB copy in memory to save a duplicate
 * write is the wrong trade. Large files fall back to an identity built from
 * their own name/size/mtime, which still catches the common "dropped the same
 * file twice" case without reading a byte.
 */
const HASH_MAX_BYTES = 32 * 1024 * 1024;

export interface AssetMeta {
    id: string;
    name: string;
    mime: string;
    size: number;
    hash: string;
    createdAt: number;
    /** Set once the bytes are known to exist in cloud storage. */
    remotePath?: string;
}

export interface AssetRecord extends AssetMeta {
    blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('This browser has no local storage for files.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id' });
                store.createIndex(HASH_INDEX, 'hash', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not open the file store.'));
    });
}

/** Run `body` inside one transaction and close the connection afterwards. */
async function tx<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
    const db = await openDb();
    try {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const result = await body(store);
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error('File store write failed.'));
            transaction.onabort = () => reject(transaction.error ?? new Error('File store write aborted.'));
        });
        return result;
    } finally {
        db.close();
    }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('File store read failed.'));
    });
}

const stripBlob = ({ blob: _blob, ...meta }: AssetRecord): AssetMeta => meta;

/** Content hash, or a cheap stand-in for files too large to hold in memory. */
async function hashFile(file: File): Promise<string> {
    if (file.size > HASH_MAX_BYTES || !globalThis.crypto?.subtle) {
        return `id:${file.size}:${file.lastModified}:${file.name}`;
    }
    try {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    } catch {
        return `id:${file.size}:${file.lastModified}:${file.name}`;
    }
}

/**
 * Store a file and return its record. A file whose bytes are already held
 * comes back with the existing id rather than being written twice.
 */
export async function putAsset(file: File): Promise<AssetRecord> {
    const hash = await hashFile(file);

    const existing = await tx('readonly', (store) =>
        request(store.index(HASH_INDEX).get(hash) as IDBRequest<AssetRecord | undefined>),
    );
    if (existing) return existing;

    const record: AssetRecord = {
        id: uuidv4(),
        name: file.name || 'Untitled',
        mime: file.type || 'application/octet-stream',
        size: file.size,
        hash,
        createdAt: Date.now(),
        blob: file,
    };
    await tx('readwrite', (store) => request(store.put(record)));
    return record;
}

/** Cache bytes fetched from cloud storage under the id the document already
 *  references, so the reference resolves locally from then on. */
export async function putRemoteAsset(id: string, blob: Blob, meta: Partial<AssetMeta> = {}): Promise<AssetRecord> {
    const record: AssetRecord = {
        id,
        name: meta.name || 'Untitled',
        mime: meta.mime || blob.type || 'application/octet-stream',
        size: meta.size ?? blob.size,
        hash: meta.hash || `remote:${id}`,
        createdAt: meta.createdAt ?? Date.now(),
        remotePath: meta.remotePath,
        blob,
    };
    await tx('readwrite', (store) => request(store.put(record)));
    return record;
}

export async function getAsset(id: string): Promise<AssetRecord | null> {
    const record = await tx('readonly', (store) =>
        request(store.get(id) as IDBRequest<AssetRecord | undefined>),
    );
    return record ?? null;
}

export async function getAssetMeta(id: string): Promise<AssetMeta | null> {
    const record = await getAsset(id);
    return record ? stripBlob(record) : null;
}

export async function hasAsset(id: string): Promise<boolean> {
    const count = await tx('readonly', (store) => request(store.count(id)));
    return count > 0;
}

export async function deleteAsset(id: string): Promise<void> {
    await tx('readwrite', (store) => request(store.delete(id)));
}

export async function listAssetMeta(): Promise<AssetMeta[]> {
    const records = await tx('readonly', (store) =>
        request(store.getAll() as IDBRequest<AssetRecord[]>),
    );
    return records.map(stripBlob);
}

export async function markAssetRemote(id: string, remotePath: string): Promise<void> {
    await tx('readwrite', async (store) => {
        const record = await request(store.get(id) as IDBRequest<AssetRecord | undefined>);
        if (!record) return;
        await request(store.put({ ...record, remotePath }));
    });
}

export async function estimateUsage(): Promise<{ used: number; quota: number } | null> {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { used: usage, quota };
}
