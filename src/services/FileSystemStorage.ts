import type { AppNode } from '../types';
import type { Edge } from '@xyflow/react';
import LZString from 'lz-string';
import { perfMonitor } from '../utils/performance';

const NODES_FILE = 'nodes.json';
const EDGES_FILE = 'edges.json';
const BACKUP_NODES_FILE = 'nodes.backup.json';
const BACKUP_EDGES_FILE = 'edges.backup.json';
const TEMP_NODES_FILE = 'nodes.tmp.json';
const TEMP_EDGES_FILE = 'edges.tmp.json';
const USE_COMPRESSION = true;

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
    private readonly DB_NAME = 'infonote-db';
    private readonly STORE_NAME = 'handles';
    private readonly KEY = 'project-dir';
    
    private _isSaving = false;
    private _saveQueue: (() => Promise<void>)[] = [];
    private _lastSavedState: { nodes: AppNode[]; edges: Edge[] } | null = null;
    private _pendingResolvers: { resolve: () => void; reject: (e: any) => void }[] = [];

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
        request.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                db.createObjectStore(this.STORE_NAME);
            }
        };
        request.onerror = () => {
            console.error('[Storage] Failed to initialize IndexedDB');
        };
    }

    private async saveHandleToIndexedDB(handle: FileSystemDirectoryHandle): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onsuccess = (e: any) => {
                try {
                    const db = e.target.result;
                    const tx = db.transaction(this.STORE_NAME, 'readwrite');
                    const store = tx.objectStore(this.STORE_NAME);
                    store.put(handle, this.KEY);
                    tx.oncomplete = () => {
                        // Handle saved
                        resolve();
                    };
                    tx.onerror = () => reject(new Error('Failed to save handle to IndexedDB'));
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
            request.onsuccess = (e: any) => {
                try {
                    const db = e.target.result;
                    const tx = db.transaction(this.STORE_NAME, 'readonly');
                    const store = tx.objectStore(this.STORE_NAME);
                    const getReq = store.get(this.KEY);
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
            request.onsuccess = (e: any) => {
                try {
                    const db = e.target.result;
                    const tx = db.transaction(this.STORE_NAME, 'readwrite');
                    const store = tx.objectStore(this.STORE_NAME);
                    store.delete(this.KEY);
                    tx.oncomplete = () => {
                        // Handle cleared
                        resolve();
                    };
                    tx.onerror = () => resolve();
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
            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                id: 'infonote-data',
            });
            await this.saveHandleToIndexedDB(this.directoryHandle);
            console.log('[Storage] Directory selected:', this.directoryHandle.name);
            return true;
        } catch (error: any) {
            if (error.name === 'AbortError') {
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
            console.log('[Storage] No stored handle found');
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
        } catch (error: any) {
            console.error('[Storage] Reconnection failed:', error.message || error);
            // Handle is likely stale, clear it
            await this.clearStoredHandle();
            this.directoryHandle = null;
            return false;
        }
    }

    disconnect(): void {
        this.directoryHandle = null;
        console.log('[Storage] Disconnected');
    }

    async saveData(nodes: AppNode[], edges: Edge[], options?: { skipFolderSync?: boolean }): Promise<void> {
        if (!this.directoryHandle) {
            console.warn('[Storage] Cannot save - not connected');
            return;
        }

        if (this._isSaving) {
            return new Promise((resolve, reject) => {
                this._pendingResolvers.push({ resolve, reject });
                this._saveQueue.push(async () => {
                    const resolvers = [...this._pendingResolvers];
                    this._pendingResolvers = [];
                    try {
                        await this._doSave(nodes, edges, options);
                        resolvers.forEach(r => r.resolve());
                    } catch (e) {
                        resolvers.forEach(r => r.reject(e));
                    }
                });
            });
        }

        await this._doSave(nodes, edges, options);
    }

    private async _doSave(nodes: AppNode[], edges: Edge[], options?: { skipFolderSync?: boolean }): Promise<void> {
        if (!this.directoryHandle) return;
        
        perfMonitor.startTimer('storage.save', { nodeCount: nodes.length });
        this._isSaving = true;
        const startTime = Date.now();
        // Saving...

        try {
            // 1. Create backup
            await this.createBackup();
            
            // 2. Write temp files
            await Promise.all([
                this.writeJsonFile(TEMP_NODES_FILE, nodes),
                this.writeJsonFile(TEMP_EDGES_FILE, edges)
            ]);
            
            // 3. Verify temp files
            try {
                await this.readJsonFile<AppNode[]>(TEMP_NODES_FILE);
                await this.readJsonFile<Edge[]>(TEMP_EDGES_FILE);
            } catch (verifyError) {
                console.error('[Storage] Temp file verification failed');
                throw new Error('Save verification failed');
            }
            
            // 4. Atomic replace
            await this.atomicReplace(TEMP_NODES_FILE, NODES_FILE);
            await this.atomicReplace(TEMP_EDGES_FILE, EDGES_FILE);

            this._lastSavedState = { nodes, edges };
            
            const duration = Date.now() - startTime;
            console.log('[Storage] Saved in', duration, 'ms');
            perfMonitor.endTimer('storage.save', { success: true });

            // Skip folder sync for now (expensive)
            // if (!options?.skipFolderSync && nodes.length <= 2000) {
            //     this.syncCardsToFolders(nodes).catch(err => 
            //         console.warn('[Storage] Folder sync failed:', err)
            //     );
            // }

        } catch (error: any) {
            console.error('[Storage] Save failed:', error);
            perfMonitor.endTimer('storage.save', { success: false, error: error.message });
            
            await this.restoreFromBackup().catch(restoreErr =>
                console.error('[Storage] Backup restore failed:', restoreErr)
            );
            
            // Check for invalid handle
            if (error.name === 'NotFoundError' || error.name === 'NotAllowedError' ||
                error.message?.includes('not found') || error.message?.includes('directory')) {
                console.warn('[Storage] Handle invalidated, disconnecting');
                this.directoryHandle = null;
            }
            throw error;
        } finally {
            this._isSaving = false;
            if (this._saveQueue.length > 0) {
                const nextSave = this._saveQueue.shift();
                if (nextSave) nextSave();
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
            console.log('[Storage] Load blocked - save in progress');
            perfMonitor.endTimer('storage.load', { cached: true });
            return this._lastSavedState;
        }

        try {
            // Check if files exist first
            const nodesExist = await this.fileExists(NODES_FILE);
            const edgesExist = await this.fileExists(EDGES_FILE);
            
            if (!nodesExist || !edgesExist) {
                console.log('[Storage] No existing data files found');
                perfMonitor.endTimer('storage.load', { success: true, empty: true });
                return null;
            }

            const nodes = await this.readJsonFile<AppNode[]>(NODES_FILE);
            const edges = await this.readJsonFile<Edge[]>(EDGES_FILE);

            if (!Array.isArray(nodes) || !Array.isArray(edges)) {
                console.warn('[Storage] Invalid data structure');
                perfMonitor.endTimer('storage.load', { success: false });
                return null;
            }

            // Data loaded
            perfMonitor.endTimer('storage.load', { success: true, nodeCount: nodes.length });
            return { nodes, edges };
        } catch (error: any) {
            console.error('[Storage] Load failed:', error.message || error);
            perfMonitor.endTimer('storage.load', { success: false });
            
            // Check for invalid handle
            if (error.name === 'NotFoundError' || error.name === 'NotAllowedError') {
                this.directoryHandle = null;
            }
            return null;
        }
    }

    private async createBackup(): Promise<void> {
        if (!this.directoryHandle) return;
        
        try {
            if (await this.fileExists(NODES_FILE)) {
                const nodesData = await this.readJsonFile<AppNode[]>(NODES_FILE);
                await this.writeJsonFile(BACKUP_NODES_FILE, nodesData);
            }
            if (await this.fileExists(EDGES_FILE)) {
                const edgesData = await this.readJsonFile<Edge[]>(EDGES_FILE);
                await this.writeJsonFile(BACKUP_EDGES_FILE, edgesData);
            }
        } catch (error) {
            console.warn('[Storage] Backup creation failed:', error);
        }
    }
    
    private async restoreFromBackup(): Promise<void> {
        if (!this.directoryHandle) return;
        
        try {
            const backupNodesExist = await this.fileExists(BACKUP_NODES_FILE);
            const backupEdgesExist = await this.fileExists(BACKUP_EDGES_FILE);
            
            if (backupNodesExist && backupEdgesExist) {
                const nodesData = await this.readJsonFile<AppNode[]>(BACKUP_NODES_FILE);
                const edgesData = await this.readJsonFile<Edge[]>(BACKUP_EDGES_FILE);
                await this.writeJsonFile(NODES_FILE, nodesData);
                await this.writeJsonFile(EDGES_FILE, edgesData);
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

    private async writeJsonFile(filename: string, data: any): Promise<void> {
        if (!this.directoryHandle) throw new Error('Not connected');

        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        
        const jsonStr = JSON.stringify(data);
        
        if (USE_COMPRESSION && jsonStr.length > 10000) {
            const compressed = LZString.compressToUTF16(jsonStr);
            // Compressed
            await writable.write(compressed);
        } else {
            await writable.write(jsonStr);
        }
        
        await writable.close();
    }

    private async readJsonFile<T>(filename: string): Promise<T> {
        if (!this.directoryHandle) throw new Error('Not connected');

        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: false });
        const file = await fileHandle.getFile();
        const text = await file.text();
        
        // Try decompress
        if (USE_COMPRESSION && text.length > 0 && !text.startsWith('{') && !text.startsWith('[')) {
            try {
                const decompressed = LZString.decompressFromUTF16(text);
                if (decompressed) {
                    return JSON.parse(decompressed) as T;
                }
            } catch {
                // Fall through to plain JSON
            }
        }
        
        return JSON.parse(text) as T;
    }

    private getFolderName(node: AppNode): string {
        const label = (node.data as any).label || 'Untitled';
        const safeName = label.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 32);
        return `${safeName}_${node.id.slice(0, 8)}`;
    }

    private async syncCardsToFolders(nodes: AppNode[]): Promise<void> {
        if (!this.directoryHandle) return;

        try {
            const childrenMap = new Map<string, AppNode[]>();
            const roots: AppNode[] = [];

            for (const node of nodes) {
                if (node.type !== 'note') continue;
                if (!node.parentId) {
                    roots.push(node);
                } else {
                    const list = childrenMap.get(node.parentId) || [];
                    list.push(node);
                    childrenMap.set(node.parentId, list);
                }
            }

            const writeLevel = async (dirHandle: FileSystemDirectoryHandle, nodeList: AppNode[]) => {
                for (const node of nodeList) {
                    try {
                        const folderName = this.getFolderName(node);
                        const nodeDir = await dirHandle.getDirectoryHandle(folderName, { create: true });
                        const fileHandle = await nodeDir.getFileHandle('card.json', { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(JSON.stringify(node));
                        await writable.close();

                        const children = childrenMap.get(node.id) || [];
                        if (children.length > 0) {
                            await writeLevel(nodeDir, children);
                        }
                    } catch (e) {
                        console.warn('[Storage] Failed to sync folder for node:', node.id);
                    }
                }
            };

            const cardsDir = await this.directoryHandle.getDirectoryHandle('Cards', { create: true });
            await writeLevel(cardsDir, roots);
        } catch (error) {
            console.warn('[Storage] Folder sync failed:', error);
        }
    }
}

export const fileSystemStorage = new FileSystemStorage();
