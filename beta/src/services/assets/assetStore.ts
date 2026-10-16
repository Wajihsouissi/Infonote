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
 * cards stores one copy and hands back one id.
 *
 * Bytes are stored as an ArrayBuffer rather than a Blob. Every engine can store
 * raw bytes, while Blob support in IndexedDB is the one part of this that is
 * not universal — WebKit's Windows build refuses them outright, which also made
 * uploads untestable there. Above `STREAMED_BYTES` the Blob is kept instead:
 * a long video should stream from the browser's own storage rather than sit in
 * memory as one buffer. `assetBlob()` hides the difference from readers.
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
}

export interface AssetRecord extends AssetMeta {
    /** The file's bytes. Absent on a large file (see `blob`) and on records
     *  written before this was the storage format. */
    bytes?: ArrayBuffer;
    /** A large file, kept as a Blob so it streams instead of being held in
     *  memory. Also what every record written before the switch carries. */
    blob?: Blob;
}

/**
 * Above this a file keeps its Blob. Chosen so that everything a note normally
 * holds — pictures, PDFs, documents — takes the portable path, and only long
 * media stays with the browser's own file-backed storage.
 */
const STREAMED_BYTES = 16 * 1024 * 1024;

/** The bytes of a record, as something the DOM can point at. */
export function assetBlob(record: AssetRecord): Blob {
    if (record.bytes) return new Blob([record.bytes], { type: record.mime });
    if (record.blob) return record.blob;
    return new Blob([], { type: record.mime });
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


/** Content hash, or a cheap stand-in for files too large to hold in memory. */
async function hashFile(file: File, bytes: ArrayBuffer | null): Promise<string> {
    if (!bytes || file.size > HASH_MAX_BYTES || !globalThis.crypto?.subtle) {
        return `id:${file.size}:${file.lastModified}:${file.name}`;
    }
    try {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
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
    // Read once: the hash and the stored copy want the same bytes.
    const bytes = file.size > STREAMED_BYTES ? null : await file.arrayBuffer();
    const hash = await hashFile(file, bytes);

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
        ...(bytes ? { bytes } : { blob: file }),
    };
    await tx('readwrite', (store) => request(store.put(record)));
    return record;
}

/**
 * Write a record the app already has, bytes and identity included.
 *
 * Restoring a backup is the one case where the id must be preserved: the cards
 * coming back with it point at `asset:<id>`, so a fresh id would restore the
 * file and lose every reference to it.
 */
export async function putAssetRecord(record: AssetRecord): Promise<void> {
    await tx('readwrite', (store) => request(store.put(record)));
}

export async function getAsset(id: string): Promise<AssetRecord | null> {
    const record = await tx('readonly', (store) =>
        request(store.get(id) as IDBRequest<AssetRecord | undefined>),
    );
    return record ?? null;
}
