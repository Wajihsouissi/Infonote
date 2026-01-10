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

    async saveData(nodes: AppNode[], edges: Edge[]): Promise<void> {
        if (!this.directoryHandle) return;

        try {
            await this.writeJsonFile(NODES_FILE, nodes);
            await this.writeJsonFile(EDGES_FILE, edges);

            // Sync individual cards to folders
            await this.syncCardsToFolders(nodes);

        } catch (error) {
            console.error('Failed to save data:', error);
            throw error;
        }
    }

    private async syncCardsToFolders(nodes: AppNode[]) {
        if (!this.directoryHandle) return;

        try {
            // 1. Group by parent
            const childrenMap = new Map<string, AppNode[]>();
            const roots: AppNode[] = [];

            for (const node of nodes) {
                if (node.type !== 'note') continue; // Only sync Note type for now

                if (!node.parentId) {
                    roots.push(node);
                } else {
                    const list = childrenMap.get(node.parentId) || [];
                    list.push(node);
                    childrenMap.set(node.parentId, list);
                }
            }

            // 2. Recursive Writer Helper
            const writeLevel = async (dirHandle: FileSystemDirectoryHandle, nodeList: AppNode[]) => {
                for (const node of nodeList) {
                    // We filtered for type === 'note' earlier in the main loop, but types need help
                    const label = (node.data as any).label || 'Untitled';
                    // Sanitize name for folder safety
                    const safeName = label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const folderName = `${safeName}_${node.id.slice(0, 4)}`;

                    // Create folder for card
                    const nodeDir = await dirHandle.getDirectoryHandle(folderName, { create: true });

                    // Save card specific data
                    const fileHandle = await nodeDir.getFileHandle('card.json', { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(node, null, 2));
                    await writable.close();

                    // Recurse for children
                    const children = childrenMap.get(node.id);
                    if (children && children.length > 0) {
                        await writeLevel(nodeDir, children);
                    }
                }
            };

            // Start at 'Cards' root
            const cardsDir = await this.directoryHandle.getDirectoryHandle('Cards', { create: true });
            await writeLevel(cardsDir, roots);

        } catch (error) {
            console.warn('Failed to sync card folders:', error);
            // Don't crash main save if folder sync fails
        }
    }

    async loadData(): Promise<{ nodes: AppNode[]; edges: Edge[] } | null> {
        if (!this.directoryHandle) return null;

        try {
            const nodes = await this.readJsonFile<AppNode[]>(NODES_FILE);
            const edges = await this.readJsonFile<Edge[]>(EDGES_FILE);
            return { nodes, edges };
        } catch (error) {
            console.log('No existing data found (or error reading), starting fresh in this directory.', error);
            return null;
        }
    }

    private async writeJsonFile(filename: string, data: any): Promise<void> {
        if (!this.directoryHandle) throw new Error('No directory selected');

        const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
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
