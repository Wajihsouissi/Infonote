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
const USE_COMPRESSION = true; // Enable compression for large datasets

// Extend the Window interface to include the File System Access API
// Extend the Window interface and FileSystem definitions
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
    
    // Sync state management
    private _isSaving = false;
    private _saveQueue: (() => Promise<void>)[] = [];
    private _lastSavedState: { nodes: AppNode[]; edges: Edge[] } | null = null;
    private _pendingResolvers: { resolve: () => void; reject: (e: any) => void }[] = [];
    private _lastSaveHash: string | null = null;

    constructor() {
        this.initDB();
    }

    // Check if currently saving (used to block loads during saves)
    get isSaving(): boolean {
        return this._isSaving;
    }

    private initDB() {
        // Minimal IndexedDB wrapper
        const request = indexedDB.open(this.DB_NAME, 1);
        request.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                db.createObjectStore(this.STORE_NAME);
            }
        };
    }

    private async saveHandle(handle: FileSystemDirectoryHandle) {
        return new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onsuccess = (e: any) => {
                const db = e.target.result;
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                store.put(handle, this.KEY);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject('Failed to save handle');
            };
        });
    }

    async getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onsuccess = (e: any) => {
                const db = e.target.result;
                try {
                    const tx = db.transaction(this.STORE_NAME, 'readonly');
                    const store = tx.objectStore(this.STORE_NAME);
                    const getReq = store.get(this.KEY);
                    getReq.onsuccess = () => resolve(getReq.result || null);
                    getReq.onerror = () => resolve(null);
                } catch (err) {
                    console.error("DB Error", err);
                    resolve(null);
                }
            };
            request.onerror = () => resolve(null);
        });
    }

    async selectDirectory(): Promise<boolean> {
        try {
            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                id: 'infonote-data',
            });
            await this.saveHandle(this.directoryHandle);
            return true;
        } catch (error) {
            console.warn('User cancelled directory selection or API error:', error);
            return false;
        }
    }

    async reconnect(): Promise<boolean> {
        const handle = await this.getStoredHandle();
        if (!handle) return false;

        try {
            if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
                this.directoryHandle = handle;
                return true;
            }

            if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
                this.directoryHandle = handle;
                return true;
            }
        } catch (e) {
            console.error("Reconnection failed", e);
        }
        return false;
    }

    get isConnected(): boolean {
        return this.directoryHandle !== null;
    }

    get directoryName(): string | undefined {
        return this.directoryHandle?.name;
    }

    private getFolderName(node: AppNode): string {
        const label = (node.data as any).label || 'Untitled';
        const safeName = label.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 32);
        return `${safeName}_${node.id.slice(0, 8)}`;
    }

    async saveData(nodes: AppNode[], edges: Edge[], options?: { skipFolderSync?: boolean }): Promise<void> {
        if (!this.directoryHandle) return;

        // If already saving, queue this save properly (don't drop it)
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
        console.log('[Storage] Starting save...', nodes.length, 'nodes');

        try {
            // 1. Create backup of existing files (Obsidian-style safety)
            await this.createBackup();
            
            // 2. Write to temporary files first (atomic write pattern)
            await Promise.all([
                this.writeJsonFile(TEMP_NODES_FILE, nodes),
                this.writeJsonFile(TEMP_EDGES_FILE, edges)
            ]);
            
            // 3. Verify temp files are valid
            try {
                await this.readJsonFile<AppNode[]>(TEMP_NODES_FILE);
                await this.readJsonFile<Edge[]>(TEMP_EDGES_FILE);
            } catch (verifyError) {
                console.error('[Storage] Temp file verification failed, aborting save');
                throw new Error('Save verification failed');
            }
            
            // 4. Atomic rename: temp -> main (this is the commit point)
            await this.atomicReplace(TEMP_NODES_FILE, NODES_FILE);
            await this.atomicReplace(TEMP_EDGES_FILE, EDGES_FILE);

            // Store state
            this._lastSavedState = { nodes, edges };
            
            const duration = Date.now() - startTime;
            console.log(`[Storage] Saved successfully in ${duration}ms:`, nodes.length, 'nodes');
            perfMonitor.endTimer('storage.save', { success: true });

            // Sync individual cards to folders (background, non-critical)
            if (!options?.skipFolderSync && nodes.length <= 2000) {
                this.syncCardsToFolders(nodes).catch(err => 
                    console.warn('[Storage] Background folder sync failed:', err)
                );
            } else if (nodes.length > 2000) {
                console.log('[Storage] Skipping folder sync for large graph:', nodes.length, 'nodes');
            }

        } catch (error: any) {
            console.error('[Storage] Save failed:', error);
            perfMonitor.endTimer('storage.save', { success: false, error: error.message });
            
            await this.restoreFromBackup().catch(restoreErr =>
                console.error('[Storage] Backup restore also failed:', restoreErr)
            );
            
            if (error.name === 'NotFoundError' || error.name === 'NotAllowedError') {
                console.warn('[Storage] Directory handle invalidated. Disconnecting.');
                this.directoryHandle = null;
            }
            throw error;
        } finally {
            this._isSaving = false;
            
            if (this._saveQueue.length > 0) {
                const nextSave = this._saveQueue.shift();
                if (nextSave) {
                    nextSave();
                }
            }
        }
    }

    private async createBackup(): Promise<void> {
        if (!this.directoryHandle) return;
        
        try {
            const nodesExist = await this.fileExists(NODES_FILE);
            const edgesExist = await this.fileExists(EDGES_FILE);
            
            if (nodesExist) {
                const nodesData = await this.readJsonFile<AppNode[]>(NODES_FILE);
                await this.writeJsonFile(BACKUP_NODES_FILE, nodesData);
            }
            
            if (edgesExist) {
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
            console.error('[Storage] Backup restore failed:', error);
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
        } catch (error) {
            console.warn('[Storage] Failed to delete file:', filename, error);
        }
    }
    
    private async readRawFile(filename: string): Promise<string> {
        if (!this.directoryHandle) throw new Error('No directory selected');
        
        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: false });
        const file = await fileHandle.getFile();
        return await file.text();
    }
    
    private async writeRawFile(filename: string, content: string): Promise<void> {
        if (!this.directoryHandle) throw new Error('No directory selected');
        
        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    }

    private async syncCardsToFolders(nodes: AppNode[]) {
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
                const expectedFolders = new Set<string>();
                for (const node of nodeList) {
                    expectedFolders.add(this.getFolderName(node));
                }

                const orphans: string[] = [];
                try {
                    for await (const [name, handle] of dirHandle.entries()) {
                        if (handle.kind === 'directory') {
                            if (!expectedFolders.has(name)) {
                                orphans.push(name);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to read directory entries for cleanup', e);
                }

                for (const name of orphans) {
                    try {
                        await dirHandle.removeEntry(name, { recursive: true });
                    } catch (e) {
                        console.warn('Failed to remove orphan folder:', name, e);
                    }
                }

                for (const node of nodeList) {
                    try {
                        const folderName = this.getFolderName(node);
                        const nodeDir = await dirHandle.getDirectoryHandle(folderName, { create: true });

                        const fileHandle = await nodeDir.getFileHandle('card.json', { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(JSON.stringify(node));
                        await writable.close();

                        const children = childrenMap.get(node.id) || [];
                        await writeLevel(nodeDir, children);
                    } catch (e) {
                        console.warn('Failed to sync node folder:', node.id, e);
                    }
                }
            };

            const cardsDir = await this.directoryHandle.getDirectoryHandle('Cards', { create: true });
            await writeLevel(cardsDir, roots);

        } catch (error) {
            console.warn('Failed to sync card folders:', error);
        }
    }

    async loadData(): Promise<{ nodes: AppNode[]; edges: Edge[] } | null> {
        if (!this.directoryHandle) return null;
        
        perfMonitor.startTimer('storage.load');
        
        if (this._isSaving) {
            console.log('[Storage] Load blocked - save in progress, returning cached state');
            perfMonitor.endTimer('storage.load', { cached: true });
            return this._lastSavedState;
        }

        try {
            const nodes = await this.readJsonFile<AppNode[]>(NODES_FILE);
            const edges = await this.readJsonFile<Edge[]>(EDGES_FILE);

            if (!Array.isArray(nodes) || !Array.isArray(edges)) {
                console.warn('Invalid data structure in storage files');
                perfMonitor.endTimer('storage.load', { success: false });
                return null;
            }

            console.log(`[Storage] Loaded ${nodes.length} nodes from ${NODES_FILE}`);
            perfMonitor.endTimer('storage.load', { success: true, nodeCount: nodes.length });
            return { nodes, edges };
        } catch (error) {
            console.log('No existing data found (or error reading), starting fresh.', error);
            perfMonitor.endTimer('storage.load', { success: false });
            return null;
        }
    }

    private async writeJsonFile(filename: string, data: any): Promise<void> {
        if (!this.directoryHandle) throw new Error('No directory selected');

        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        
        const jsonStr = JSON.stringify(data);
        
        // Compress if enabled and data is large enough
        if (USE_COMPRESSION && jsonStr.length > 10000) {
            const compressed = LZString.compressToUTF16(jsonStr);
            const compressionRatio = ((1 - compressed.length / jsonStr.length) * 100).toFixed(1);
            console.log(`[Storage] Compressed ${filename}: ${jsonStr.length} → ${compressed.length} bytes (${compressionRatio}% saved)`);
            await writable.write(compressed);
        } else {
            await writable.write(jsonStr);
        }
        
        await writable.close();
    }

    private async readJsonFile<T>(filename: string): Promise<T> {
        if (!this.directoryHandle) throw new Error('No directory selected');

        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: false });
        const file = await fileHandle.getFile();
        const text = await file.text();
        
        // Try to decompress, fall back to plain JSON
        try {
            if (USE_COMPRESSION && text.length > 0 && !text.startsWith('{') && !text.startsWith('[')) {
                const decompressed = LZString.decompressFromUTF16(text);
                if (decompressed) {
                    return JSON.parse(decompressed) as T;
                }
            }
        } catch (e) {
            console.warn('[Storage] Decompression failed, trying plain JSON:', e);
        }
        
        return JSON.parse(text) as T;
    }
}

export const fileSystemStorage = new FileSystemStorage();
