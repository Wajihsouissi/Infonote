import type { AppNode } from '../types';
import type { Edge } from '@xyflow/react';

const NODES_FILE = 'nodes.json';
const EDGES_FILE = 'edges.json';

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

        // We have a handle, but we need to verify permissions
        // This MUST be triggered by user gesture for 'readwrite'
        try {
            // Check if we already have permission
            if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
                this.directoryHandle = handle;
                return true;
            }

            // If not, we might be able to request it, but often the browser blocks 
            // full requestPermission() unless in a gesture.
            // We will assume this is called inside a click handler.
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
        // Limit label length and use longer ID segment to avoid collisions and path limits
        const safeName = label.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 32);
        return `${safeName}_${node.id.slice(0, 8)}`;
    }

    async saveData(nodes: AppNode[], edges: Edge[], options?: { skipFolderSync?: boolean }): Promise<void> {
        if (!this.directoryHandle) return;

        // If already saving, queue this save and return a promise that resolves when the NEXT save finishes
        if (this._isSaving) {
            return new Promise((resolve, reject) => {
                // Store the resolver so we can notify this caller when the queued save finishes
                this._pendingResolvers.push({ resolve, reject });
                
                // Replace the actual queued operation with the latest data
                // We only need one operation in the queue at any time
                this._saveQueue = [async () => {
                    // Capture resolvers for THIS specific batch
                    const resolvers = [...this._pendingResolvers];
                    this._pendingResolvers = [];
                    
                    try {
                        await this._doSave(nodes, edges, options);
                        resolvers.forEach(r => r.resolve());
                    } catch (e) {
                        resolvers.forEach(r => r.reject(e));
                    }
                }];
            });
        }

        await this._doSave(nodes, edges, options);
    }

    private async _doSave(nodes: AppNode[], edges: Edge[], options?: { skipFolderSync?: boolean }): Promise<void> {
        if (!this.directoryHandle) return;
        
        this._isSaving = true;
        console.log('[Storage] Starting save...', nodes.length, 'nodes');

        try {
            // Write main data files (compact JSON) - This is the critical path for data safety
            await Promise.all([
                this.writeJsonFile(NODES_FILE, nodes),
                this.writeJsonFile(EDGES_FILE, edges)
            ]);

            // Store the last saved state for comparison
            this._lastSavedState = { nodes, edges };
            console.log('[Storage] Saved successfully:', nodes.length, 'nodes');

            // Sync individual cards to folders (create new, update existing, delete orphans)
            if (!options?.skipFolderSync) {
                await this.syncCardsToFolders(nodes);
            }

        } catch (error: any) {
            console.error('Failed to save data:', error);
            if (error.name === 'NotFoundError' || error.name === 'NotAllowedError') {
                console.warn('Directory handle invalidated. Disconnecting.');
                this.directoryHandle = null;
            }
            throw error;
        } finally {
            this._isSaving = false;
            
            // Process queued saves
            if (this._saveQueue.length > 0) {
                const nextSave = this._saveQueue.shift();
                if (nextSave) {
                    // Start the next save in the queue
                    // We don't await here to avoid blocking the finally block, 
                    // but the promise inside the queue will handle its own resolution.
                    nextSave();
                }
            }
        }
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
                // 1. Identify expected folders at this level
                const expectedFolders = new Set<string>();
                for (const node of nodeList) {
                    expectedFolders.add(this.getFolderName(node));
                }

                // 2. Clean orphans (delete folders that shouldn't be here)
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

                // Delete identified orphans
                for (const name of orphans) {
                    try {
                        await dirHandle.removeEntry(name, { recursive: true });
                    } catch (e) {
                        console.warn('Failed to remove orphan folder:', name, e);
                    }
                }

                // 3. Write/Update current nodes - Sequential to avoid browser concurrency limits
                for (const node of nodeList) {
                    try {
                        const folderName = this.getFolderName(node);
                        const nodeDir = await dirHandle.getDirectoryHandle(folderName, { create: true });

                        // Save card data
                        const fileHandle = await nodeDir.getFileHandle('card.json', { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(JSON.stringify(node));
                        await writable.close();

                        // Recurse
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
        
        // CRITICAL: Block loads while saving is in progress
        if (this._isSaving) {
            console.log('[Storage] Load blocked - save in progress, returning cached state');
            return this._lastSavedState;
        }

        try {
            const nodes = await this.readJsonFile<AppNode[]>(NODES_FILE);
            const edges = await this.readJsonFile<Edge[]>(EDGES_FILE);

            if (!Array.isArray(nodes) || !Array.isArray(edges)) {
                console.warn('Invalid data structure in storage files');
                return null;
            }

            // Trust the nodes.json as the source of truth. 
            // We removed the destructive filesystem integrity check to prevent accidental data loss.
            console.log(`[Storage] Loaded ${nodes.length} nodes from ${NODES_FILE}`);
            return { nodes, edges };
        } catch (error) {
            console.log('No existing data found (or error reading), starting fresh.', error);
            return null;
        }
    }

    private async writeJsonFile(filename: string, data: any): Promise<void> {
        if (!this.directoryHandle) throw new Error('No directory selected');

        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data)); // Compact JSON
        await writable.close();
    }

    private async readJsonFile<T>(filename: string): Promise<T> {
        if (!this.directoryHandle) throw new Error('No directory selected');

        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: false });
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text) as T;
    }
}

export const fileSystemStorage = new FileSystemStorage();
