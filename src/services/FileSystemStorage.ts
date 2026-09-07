import type { AppNode } from '../types';
import type { Edge } from '@xyflow/react';
import LZString from 'lz-string';
import { perfMonitor } from '../utils/performance';
import { loadFolderAssets, saveFolderAssets } from './assets/folderAssets';

const NODES_FILE = 'nodes.json';
const EDGES_FILE = 'edges.json';
const BACKUP_NODES_FILE = 'nodes.backup.json';
const BACKUP_EDGES_FILE = 'edges.backup.json';
const TEMP_NODES_FILE = 'nodes.tmp.json';
const TEMP_EDGES_FILE = 'edges.tmp.json';

/**
 * Writes are plain JSON.
 *
 * `LZString.compressToUTF16` is a pure-JS loop that runs synchronously on the
 * main thread, and it does not scale: measured on a real 1411-card workspace
 * (10.6 MB of JSON) it took 3,580ms for ONE pass, against 21ms to serialise the
 * same data. `_doSave` ran it three times per save — backup rewrite plus both
 * temp files — which is essentially the whole of the ~17s saves that made the
 * app unusable, main thread blocked throughout.
 *
 * Reads still accept the old format (see `readJsonFile`), so folders written by
 * earlier versions keep loading and quietly become plain JSON on their next
 * save. The files are named `.json` and now actually contain JSON — inspectable
 * and salvageable by hand, which the compressed UTF16 payload never was.
 *
 * If the on-disk size ever justifies compression again, it belongs in a worker
 * or on native `CompressionStream`, never in a synchronous main-thread loop.
 */
const COMPRESS_ON_WRITE = false;
/** Old folders still hold LZString payloads; reads must keep decoding them. */
const DECOMPRESS_LEGACY_READS = true;

declare global {
    interface Window {
        showDirectoryPicker(options?: {
            id?: string;
            mode?: 'read' | 'readwrite';
            startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
        }): Promise<FileSystemDirectoryHandle>;
    }

    interface FileSystemHandle {
        queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
        requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
    }

    interface FileSystemDirectoryHandle extends FileSystemHandle {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    }
}

export class FileSystemStorage {
    private directoryHandle: FileSystemDirectoryHandle | null = null;
    private readonly DB_NAME = 'chnk-it-db';
    private readonly STORE_NAME = 'handles';
    private readonly KEY = 'project-dir';

    private _isSaving = false;
    /** The single coalesced follow-up save: latest graph wins. */
    private _pendingSave: {
        nodes: AppNode[];
        edges: Edge[];
        options?: { skipFolderSync?: boolean };
    } | null = null;
    private _pendingResolvers: { resolve: () => void; reject: (e: unknown) => void }[] = [];

    constructor() {
        this.initDB();
    }

    get isSaving(): boolean {
        return this._isSaving;
    }

    get isConnected(): boolean {
        return this.directoryHandle !== null;
    }

    get directoryName(): string | undefined {
        return this.directoryHandle?.name;
    }

    private initDB(): void {
        const request = indexedDB.open(this.DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                db.createObjectStore(this.STORE_NAME);
            }
        };
        request.onerror = () => {
            console.error('[Storage] Failed to initialize IndexedDB');
        };
        request.onsuccess = () => request.result.close();
    }

    private async saveHandleToIndexedDB(handle: FileSystemDirectoryHandle): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onsuccess = () => {
                try {
                    const db = request.result;
                    const tx = db.transaction(this.STORE_NAME, 'readwrite');
                    const store = tx.objectStore(this.STORE_NAME);
                    store.put(handle, this.KEY);
                    tx.oncomplete = () => {
                        db.close();
                        // Handle saved
                        resolve();
                    };
                    tx.onerror = () => { db.close(); reject(new Error('Failed to save handle to IndexedDB')); };
                } catch (err) {
                    reject(err);
                }
            };
            request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        });
    }

    async getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onsuccess = () => {
                try {
                    const db = request.result;
                    const tx = db.transaction(this.STORE_NAME, 'readonly');
                    const store = tx.objectStore(this.STORE_NAME);
                    const getReq = store.get(this.KEY);
                    tx.oncomplete = tx.onabort = () => db.close();
                    getReq.onsuccess = () => resolve(getReq.result || null);
                    getReq.onerror = () => resolve(null);
                } catch (err) {
                    console.error('[Storage] Failed to get stored handle:', err);
                    resolve(null);
                }
            };
            request.onerror = () => resolve(null);
        });
    }

    async clearStoredHandle(): Promise<void> {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onsuccess = () => {
                try {
                    const db = request.result;
                    const tx = db.transaction(this.STORE_NAME, 'readwrite');
                    const store = tx.objectStore(this.STORE_NAME);
                    store.delete(this.KEY);
                    tx.oncomplete = () => {
                        db.close();
                        // Handle cleared
                        resolve();
                    };
                    tx.onerror = () => { db.close(); resolve(); };
                } catch (err) {
                    console.warn('[Storage] Failed to clear stored handle:', err);
                    resolve();
                }
            };
            request.onerror = () => resolve();
        });
    }

    async selectDirectory(): Promise<boolean> {
        try {
            console.log('[Storage] Opening directory picker...');
            const selected = await window.showDirectoryPicker({
                mode: 'readwrite',
                id: 'chnk-it-data',
            });
            await this.waitForSaves();
            this.directoryHandle = selected;
            await this.saveHandleToIndexedDB(this.directoryHandle);
            console.log('[Storage] Directory selected:', this.directoryHandle.name);
            return true;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[Storage] User cancelled directory selection');
            } else {
                console.error('[Storage] Directory selection failed:', error);
            }
            return false;
        }
    }

    async reconnect(): Promise<boolean> {
        // Attempting reconnect
        const handle = await this.getStoredHandle();

        if (!handle) {
            // Silently skip — no previously-granted directory handle exists.
            // This is expected on first visit or after IndexedDB was cleared.
            return false;
        }

        try {
            // First check current permission
            const currentPermission = await handle.queryPermission({ mode: 'readwrite' });
            // Permission check

            if (currentPermission === 'granted') {
                // Verify the handle is still valid by trying to access it
                try {
                    await handle.entries().next();
                    this.directoryHandle = handle;
                    // Reconnected
                    return true;
                } catch (accessError) {
                    console.warn('[Storage] Handle exists but directory is inaccessible:', accessError);
                    await this.clearStoredHandle();
                    return false;
                }
            }

            // Try to request permission
            console.log('[Storage] Requesting permission...');
            const requestResult = await handle.requestPermission({ mode: 'readwrite' });

            if (requestResult === 'granted') {
                this.directoryHandle = handle;
                console.log('[Storage] Reconnected with new permission grant');
                return true;
            }

            console.log('[Storage] Permission denied by user');
            return false;
        } catch (error) {
            console.error('[Storage] Reconnection failed:', error instanceof Error ? error.message : error);
            // Handle is likely stale, clear it
            await this.clearStoredHandle();
            this.directoryHandle = null;
            return false;
        }
    }

    private async waitForSaves(): Promise<void> {
        while (this._isSaving) await new Promise(resolve => setTimeout(resolve, 50));
    }

    async disconnect(): Promise<void> {
        await this.waitForSaves();
        this.directoryHandle = null;
        console.log('[Storage] Disconnected');
    }

    async saveData(nodes: AppNode[], edges: Edge[], options?: { skipFolderSync?: boolean }): Promise<void> {
        if (!this.directoryHandle) {
            throw new Error('The folder is disconnected. Reconnect it to save a folder copy.');
        }

        /* Everything that arrives during an in-flight save collapses into ONE
           follow-up carrying the newest graph.

           This used to push a separate closure per call, each capturing its own
           snapshot, so N edits during a slow save queued N full saves — the
           first N-1 of them writing data already superseded. At the save times
           this backend was reaching, a handful of edits meant minutes of solid
           writing, and the last write was the only one that mattered. */
        if (this._isSaving) {
            return new Promise((resolve, reject) => {
                this._pendingResolvers.push({ resolve, reject });
                this._pendingSave = { nodes, edges, options };
            });
        }

        await this._doSave(nodes, edges, options);
    }

    private async _doSave(nodes: AppNode[], edges: Edge[], _options?: { skipFolderSync?: boolean }): Promise<void> {
        if (!this.directoryHandle) throw new Error('The folder disconnected before the queued save could finish.');

        perfMonitor.startTimer('storage.save', { nodeCount: nodes.length });
        this._isSaving = true;
        const startTime = Date.now();
        let replacingFiles = false;
        // Saving...

        try {
            await saveFolderAssets(this.directoryHandle, nodes);
            // 1. Create backup
            await this.createBackup();

            // 2. Write temp files
            await Promise.all([
                this.writeJsonFile(TEMP_NODES_FILE, nodes),
                this.writeJsonFile(TEMP_EDGES_FILE, edges)
            ]);

            /* 3. Verify the temp files landed.
               This used to read both back, decode them and JSON.parse the whole
               graph purely to see whether it threw, discarding the result — a
               second full decode per save. What it actually needs to establish
               is that the bytes reached the disk, so ask for the size. */
            try {
                const [nodesSize, edgesSize] = await Promise.all([
                    this.fileSize(TEMP_NODES_FILE),
                    this.fileSize(TEMP_EDGES_FILE),
                ]);
                if (nodesSize === 0 || (nodes.length > 0 && nodesSize < 2)) {
                    throw new Error('nodes temp file is empty');
                }
                if (edgesSize === 0) throw new Error('edges temp file is empty');
            } catch (verifyError) {
                console.error('[Storage] Temp file verification failed', verifyError);
                throw new Error('Save verification failed');
            }

            // 4. Atomic replace
            replacingFiles = true;
            await this.atomicReplace(TEMP_NODES_FILE, NODES_FILE);
            await this.atomicReplace(TEMP_EDGES_FILE, EDGES_FILE);

            const duration = Date.now() - startTime;
            console.log('[Storage] Saved in', duration, 'ms');
            perfMonitor.endTimer('storage.save', { success: true });

            // Skip folder sync for now (expensive)
            // if (!options?.skipFolderSync && nodes.length <= 2000) {
            //     this.syncCardsToFolders(nodes).catch(err => 
            //         console.warn('[Storage] Folder sync failed:', err)
            //     );
            // }

        } catch (error) {
            console.error('[Storage] Save failed:', error);
            perfMonitor.endTimer('storage.save', { success: false, error: error instanceof Error ? error.message : String(error) });

            // A failure while writing attachments or temp files has not
            // touched the saved graph. Restoring an older backup here would
            // itself discard the latest successful save.
            if (replacingFiles) {
                await this.restoreFromBackup().catch(restoreErr =>
                    console.error('[Storage] Backup restore failed:', restoreErr)
                );
            }

            // Check for invalid handle
            if (error instanceof Error && (
                error.name === 'NotFoundError' || error.name === 'NotAllowedError' ||
                error.message?.includes('not found') || error.message?.includes('directory'))) {
                console.warn('[Storage] Handle invalidated, disconnecting');
                this.directoryHandle = null;
            }
            throw error;
        } finally {
            this._isSaving = false;

            const pending = this._pendingSave;
            this._pendingSave = null;
            if (pending) {
                const resolvers = this._pendingResolvers;
                this._pendingResolvers = [];
                // Not awaited: this save's own caller is already settled, and
                // the follow-up settles everyone who waited behind it.
                void this._doSave(pending.nodes, pending.edges, pending.options).then(
                    () => resolvers.forEach((r) => r.resolve()),
                    (error) => resolvers.forEach((r) => r.reject(error)),
                );
            }
        }
    }

    async loadData(): Promise<{ nodes: AppNode[]; edges: Edge[] } | null> {
        if (!this.directoryHandle) {
            console.warn('[Storage] Cannot load - not connected');
            return null;
        }

        perfMonitor.startTimer('storage.load');

        if (this._isSaving) {
            console.log('[Storage] Load blocked - waiting for save to complete');
            // Wait for queue to empty
            while (this._isSaving) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        try {
            // Check if files exist first
            const nodesExist = await this.fileExists(NODES_FILE);

            if (!nodesExist) {
                console.log('[Storage] No existing nodes file found');
                perfMonitor.endTimer('storage.load', { success: true, empty: true });
                return null;
            }

            const nodes = await this.readJsonFile<AppNode[]>(NODES_FILE);
            let edges: Edge[] = [];

            if (await this.fileExists(EDGES_FILE)) {
                edges = await this.readJsonFile<Edge[]>(EDGES_FILE);
            }

            if (!Array.isArray(nodes)) {
                console.warn('[Storage] Invalid nodes data structure');
                perfMonitor.endTimer('storage.load', { success: false });
                return null;
            }

            // Data loaded
            await loadFolderAssets(this.directoryHandle, nodes);
            perfMonitor.endTimer('storage.load', { success: true, nodeCount: nodes.length });
            return { nodes, edges };
        } catch (error) {
            console.error('[Storage] Load failed:', error instanceof Error ? error.message : error);
            perfMonitor.endTimer('storage.load', { success: false });

            // Check for invalid handle
            if (error instanceof Error && (error.name === 'NotFoundError' || error.name === 'NotAllowedError')) {
                this.directoryHandle = null;
            }
            throw error;
        }
    }

    private async createBackup(): Promise<void> {
        if (!this.directoryHandle) return;

        /* A byte-for-byte copy. This used to decode the previous file and
           re-encode it, which on a large workspace meant a full parse plus a
           full compress just to duplicate bytes already sitting on disk. The
           backup does not care what the format is — only that it can be put
           back — so copy it raw and leave whatever encoding it had intact. */
        try {
            if (await this.fileExists(NODES_FILE)) {
                await this.writeRawFile(BACKUP_NODES_FILE, await this.readRawFile(NODES_FILE));
            }
            if (await this.fileExists(EDGES_FILE)) {
                await this.writeRawFile(BACKUP_EDGES_FILE, await this.readRawFile(EDGES_FILE));
            }
        } catch (error) {
            console.warn('[Storage] Backup creation failed:', error);
            throw error;
        }
    }

    private async restoreFromBackup(): Promise<void> {
        if (!this.directoryHandle) return;

        try {
            const backupNodesExist = await this.fileExists(BACKUP_NODES_FILE);
            const backupEdgesExist = await this.fileExists(BACKUP_EDGES_FILE);

            if (backupNodesExist && backupEdgesExist) {
                // Raw, to match createBackup: put back exactly the bytes that
                // were known good, whatever encoding they were written in.
                await this.writeRawFile(NODES_FILE, await this.readRawFile(BACKUP_NODES_FILE));
                await this.writeRawFile(EDGES_FILE, await this.readRawFile(BACKUP_EDGES_FILE));
                console.log('[Storage] Restored from backup');
            }
        } catch (error) {
            console.error('[Storage] Restore failed:', error);
            throw error;
        }
    }

    private async atomicReplace(tempFile: string, targetFile: string): Promise<void> {
        if (!this.directoryHandle) return;
        try {
            const data = await this.readRawFile(tempFile);
            await this.writeRawFile(targetFile, data);
            await this.deleteFile(tempFile);
        } catch (error) {
            console.error('[Storage] Atomic replace failed:', error);
            throw error;
        }
    }

    /** Bytes on disk, without reading or decoding the contents. */
    private async fileSize(filename: string): Promise<number> {
        if (!this.directoryHandle) throw new Error('Not connected');
        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: false });
        return (await fileHandle.getFile()).size;
    }

    private async fileExists(filename: string): Promise<boolean> {
        if (!this.directoryHandle) return false;
        try {
            await this.directoryHandle.getFileHandle(filename, { create: false });
            return true;
        } catch {
            return false;
        }
    }

    private async deleteFile(filename: string): Promise<void> {
        if (!this.directoryHandle) return;
        try {
            await this.directoryHandle.removeEntry(filename);
        } catch {
            // Ignore delete errors
        }
    }

    private async readRawFile(filename: string): Promise<string> {
        if (!this.directoryHandle) throw new Error('Not connected');
        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: false });
        const file = await fileHandle.getFile();
        return await file.text();
    }

    private async writeRawFile(filename: string, content: string): Promise<void> {
        if (!this.directoryHandle) throw new Error('Not connected');
        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    }

    private async writeJsonFile(filename: string, data: unknown): Promise<void> {
        if (!this.directoryHandle) throw new Error('Not connected');

        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();

        const jsonStr = JSON.stringify(data);

        if (COMPRESS_ON_WRITE && jsonStr.length > 10000) {
            await writable.write(LZString.compressToUTF16(jsonStr));
        } else {
            await writable.write(jsonStr);
        }

        await writable.close();
    }

    private async readJsonFile<T>(filename: string): Promise<T> {
        if (!this.directoryHandle) throw new Error('Not connected');

        try {
            const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: false });
            const file = await fileHandle.getFile();
            const text = await file.text();

            // Try decompress
            if (DECOMPRESS_LEGACY_READS && text.length > 0 && !text.startsWith('{') && !text.startsWith('[')) {
                try {
                    const decompressed = LZString.decompressFromUTF16(text);
                    if (decompressed) {
                        return JSON.parse(decompressed) as T;
                    }
                } catch (decompressError) {
                    console.warn('[Storage] Decompression failed, trying plain JSON fallback', decompressError);
                }
            }

            return JSON.parse(text) as T;
        } catch (error) {
            console.error(`[Storage] Failed to read/parse ${filename}:`, error);
            throw error;
        }
    }
}

export const fileSystemStorage = new FileSystemStorage();
