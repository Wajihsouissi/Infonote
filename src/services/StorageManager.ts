/**
 * StorageManager - Module-level storage synchronization
 * Optimized for performance with minimal logging and efficient save handling
 */

import { fileSystemStorage } from './FileSystemStorage';

let isInitialized = false;
let saveTimeout: number | null = null;

let storeCallbacks: {
    getState: () => { nodes: any[]; edges: any[] };
    loadGraph: (nodes: any[], edges: any[]) => void;
    setStorageStatus: (connected: boolean, dirName: string | null) => void;
    setIsSaving: (isSaving: boolean) => void;
    setLastSaved: (time: string | null) => void;
} | null = null;

export function initStorageManager(
    getState: () => { nodes: any[]; edges: any[] },
    subscribe: <T>(selector: (state: any) => T, listener: (curr: T, prev: T) => void) => () => void,
    loadGraph: (nodes: any[], edges: any[]) => void,
    callbacks: {
        onStatusChange?: (connected: boolean, dirName: string | null) => void;
        onSaveStart?: () => void;
        onSaveEnd?: (time: string) => void;
    }
): void {
    if (isInitialized) return;
    isInitialized = true;
    
    storeCallbacks = {
        getState,
        loadGraph,
        setStorageStatus: callbacks.onStatusChange || (() => {}),
        setIsSaving: callbacks.onSaveStart ? () => callbacks.onSaveStart!() : () => {},
        setLastSaved: (time: string | null) => { if (time && callbacks.onSaveEnd) callbacks.onSaveEnd(time); }
    };

    // Auto-reconnect on startup
    autoReconnect();

    // Subscribe to store changes for auto-save
    subscribe(
        (state: any) => ({ 
            nodes: state.nodes, 
            edges: state.edges, 
            isConnected: state.storage.isConnected 
        }),
        (curr, prev) => {
            if (!curr.isConnected) return;
            
            const nodesChanged = curr.nodes !== prev.nodes;
            const edgesChanged = curr.edges !== prev.edges;

            if (nodesChanged || edgesChanged) {
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }

                const nodeCountChanged = curr.nodes.length !== prev.nodes.length;

                if (nodeCountChanged) {
                    // Immediate save for structural changes
                    performSave();
                } else {
                    // Debounce content changes
                    saveTimeout = window.setTimeout(performSave, 500);
                }
            }
        }
    );
}

async function autoReconnect(): Promise<void> {
    if (!storeCallbacks) return;
    
    try {
        const handle = await fileSystemStorage.getStoredHandle();
        if (!handle) return;

        const connected = await fileSystemStorage.reconnect();
        if (connected) {
            const data = await fileSystemStorage.loadData();
            if (data && data.nodes.length > 0) {
                storeCallbacks.loadGraph(data.nodes, data.edges);
            }
            storeCallbacks.setStorageStatus(true, fileSystemStorage.directoryName || 'Local Folder');
        }
    } catch {
        // Silently fail on auto-reconnect
    }
}

async function performSave(): Promise<void> {
    if (!storeCallbacks || !fileSystemStorage.isConnected) return;

    try {
        const { nodes, edges } = storeCallbacks.getState();
        await fileSystemStorage.saveData(nodes, edges);
        storeCallbacks.setLastSaved(new Date().toLocaleTimeString());
    } catch {
        // Check if handle was invalidated
        if (!fileSystemStorage.isConnected) {
            storeCallbacks.setStorageStatus(false, null);
        }
    }
}

export async function connectStorage(
    getState: () => { nodes: any[]; edges: any[] },
    loadGraph: (nodes: any[], edges: any[]) => void,
    setStorageStatus: (connected: boolean, dirName: string | null) => void
): Promise<{ success: boolean; error?: string }> {
    try {
        let connected = await fileSystemStorage.reconnect();
        
        if (!connected) {
            connected = await fileSystemStorage.selectDirectory();
        }

        if (!connected) {
            return { 
                success: false, 
                error: 'Directory selection was cancelled' 
            };
        }

        const data = await fileSystemStorage.loadData();
        if (data && data.nodes.length > 0) {
            loadGraph(data.nodes, data.edges);
        } else {
            const currentState = getState();
            if (currentState.nodes.length > 0) {
                await fileSystemStorage.saveData(currentState.nodes, currentState.edges);
            }
        }
        
        const dirName = fileSystemStorage.directoryName || 'Local Folder';
        setStorageStatus(true, dirName);
        
        return { success: true };
        
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        setStorageStatus(false, null);
        return { success: false, error: errorMsg };
    }
}

export function isStorageConnected(): boolean {
    return fileSystemStorage.isConnected;
}

export function getDirectoryName(): string | undefined {
    return fileSystemStorage.directoryName;
}
