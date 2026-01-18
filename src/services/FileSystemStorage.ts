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
}

export class FileSystemStorage {
    private directoryHandle: FileSystemDirectoryHandle | null = null;
    private readonly DB_NAME = 'infonote-db';
    private readonly STORE_NAME = 'handles';
    private readonly KEY = 'project-dir';

    constructor() {
        this.initDB();
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

    async saveData(nodes: AppNode[], edges: Edge[], force: boolean = false): Promise<void> {
        if (!this.directoryHandle) return;

        try {
            // Write main data files (compact JSON)
            await Promise.all([
                this.writeJsonFile(NODES_FILE, nodes),
                this.writeJsonFile(EDGES_FILE, edges)
            ]);

            // Sync individual cards to folders (concurrently)
            await this.syncCardsToFolders(nodes);

        } catch (error) {
            console.error('Failed to save data:', error);
            throw error;
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
                // Use Promise.all for concurrent writes at this level
                await Promise.all(nodeList.map(async (node) => {
                    const label = (node.data as any).label || 'Untitled';
                    const safeName = label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const folderName = `${safeName}_${node.id.slice(0, 4)}`;

                    const nodeDir = await dirHandle.getDirectoryHandle(folderName, { create: true });

                    // Save card data
                    const fileHandle = await nodeDir.getFileHandle('card.json', { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(node)); // Compact JSON
                    await writable.close();

                    const children = childrenMap.get(node.id);
                    if (children && children.length > 0) {
                        await writeLevel(nodeDir, children);
                    }
                }));
            };

            const cardsDir = await this.directoryHandle.getDirectoryHandle('Cards', { create: true });
            await writeLevel(cardsDir, roots);

        } catch (error) {
            console.warn('Failed to sync card folders:', error);
        }
    }

    async loadData(): Promise<{ nodes: AppNode[]; edges: Edge[] } | null> {
        if (!this.directoryHandle) return null;

        try {
            const nodes = await this.readJsonFile<AppNode[]>(NODES_FILE);
            const edges = await this.readJsonFile<Edge[]>(EDGES_FILE);
            
            // Validate loaded data
            if (!Array.isArray(nodes) || !Array.isArray(edges)) {
                console.warn('Invalid data structure in storage files');
                return null;
            }
            
            // Validate node structure
            const validNodes = nodes.filter(node => {
                if (!node || typeof node !== 'object') return false;
                if (!node.id || !node.type) return false;
                if (!['note', 'block', 'fused-note', 'kanban'].includes(node.type)) return false;
                if (!node.data || typeof node.data !== 'object') return false;
                return true;
            });
            
            // Validate edge structure
            const validEdges = edges.filter(edge => {
                if (!edge || typeof edge !== 'object') return false;
                if (!edge.id || !edge.source || !edge.target) return false;
                return true;
            });
            
            console.log(`Loaded ${validNodes.length}/${nodes.length} valid nodes and ${validEdges.length}/${edges.length} valid edges`);
            
            return { nodes: validNodes, edges: validEdges };
        } catch (error) {
            console.log('No existing data found (or error reading), starting fresh in this directory.', error);
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
