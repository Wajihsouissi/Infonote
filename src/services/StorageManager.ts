/**
 * StorageManager - Module-level storage synchronization
 * 
 * This runs OUTSIDE of React to avoid StrictMode issues and ensure
 * reliable persistence without race conditions.
 */

import { fileSystemStorage } from './FileSystemStorage';

// State
let isInitialized = false;
let isConnected = false;
let saveTimeout: number | null = null;

// Callbacks
let onStatusChange: ((connected: boolean, dirName: string | null) => void) | null = null;
let onSaveStart: (() => void) | null = null;
let onSaveEnd: ((time: string) => void) | null = null;

/**
 * Initialize the storage manager with a store subscription
 */
export function initStorageManager(
    getState: () => { nodes: any[]; edges: any[] },
    subscribe: (callback: (state: any, prevState: any) => void) => () => void,
    loadGraph: (nodes: any[], edges: any[]) => void,
    callbacks: {
        onStatusChange?: (connected: boolean, dirName: string | null) => void;
        onSaveStart?: () => void;
        onSaveEnd?: (time: string) => void;
    }
) {
    if (isInitialized) {
        console.log('[StorageManager] Already initialized, skipping');
        return;
    }
    isInitialized = true;
    
    onStatusChange = callbacks.onStatusChange || null;
    onSaveStart = callbacks.onSaveStart || null;
    onSaveEnd = callbacks.onSaveEnd || null;

    console.log('[StorageManager] Initializing...');

    // Try to reconnect on startup
    (async () => {
        try {
            const handle = await fileSystemStorage.getStoredHandle();
            if (handle) {
                const connected = await fileSystemStorage.reconnect();
                if (connected) {
                    const data = await fileSystemStorage.loadData();
                    if (data) {
                        console.log('[StorageManager] Initial load:', data.nodes.length, 'nodes');
                        
                        // Progressive loading: load in batches for large datasets
                        if (data.nodes.length > 1000) {
                            console.log('[StorageManager] Large dataset detected, progressive loading...');
                            await progressiveLoad(data.nodes, data.edges, loadGraph);
                        } else {
                            loadGraph(data.nodes, data.edges);
                        }
                    } else {
                        console.log('[StorageManager] No existing data found in directory');
                    }
                    
                    isConnected = true;
                    onStatusChange?.(true, fileSystemStorage.directoryName || 'Local Folder');
                }
            }
        } catch (error) {
            console.error('[StorageManager] Initial load failed:', error);
        }
    })();

    // Subscribe to store changes for auto-save
    subscribe((state, prevState) => {
        // Use the store status as the source of truth for connection
        const connected = state.storage.isConnected;
        if (!connected) {
            if (isConnected) isConnected = false;
            return;
        }
        
        // Update local isConnected if it changed
        if (!isConnected && connected) isConnected = true;

        // Handle case where prevState might be missing (initial subscribe call in some versions)
        if (!prevState) return;

        const nodesChanged = state.nodes !== prevState.nodes;
        const edgesChanged = state.edges !== prevState.edges;

        if (nodesChanged || edgesChanged) {
            // Clear pending save
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }

            // Check if structural change (immediate save) or content change (debounced)
            const nodeCountChanged = state.nodes.length !== prevState.nodes.length;

            if (nodeCountChanged) {
                console.log('[StorageManager] Structural change, saving immediately');
                performSave(getState);
            } else {
                // Debounce content changes - reduced to 500ms for more responsive saves
                saveTimeout = window.setTimeout(() => {
                    performSave(getState);
                }, 500);
            }
        }
    });

    console.log('[StorageManager] Initialized');
}

// Progressive loading for large datasets
async function progressiveLoad(
    nodes: any[],
    edges: any[],
    loadGraph: (nodes: any[], edges: any[]) => void
) {
    const BATCH_SIZE = 500;
    const BATCH_DELAY = 16; // ~60fps
    
    // Load first batch immediately (priority nodes)
    const firstBatch = nodes.slice(0, BATCH_SIZE);
    const firstEdges = edges.filter(e => 
        firstBatch.some(n => n.id === e.source || n.id === e.target)
    );
    
    console.log('[StorageManager] Loading batch 1:', firstBatch.length, 'nodes');
    loadGraph(firstBatch, firstEdges);
    
    // Load remaining batches progressively
    for (let i = BATCH_SIZE; i < nodes.length; i += BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        
        const batch = nodes.slice(0, i + BATCH_SIZE);
        const batchEdges = edges.filter(e =>
            batch.some(n => n.id === e.source || n.id === e.target)
        );
        
        console.log(`[StorageManager] Loading batch ${Math.floor(i/BATCH_SIZE) + 1}:`, batch.length, 'nodes total');
        loadGraph(batch, batchEdges);
    }
    
    console.log('[StorageManager] Progressive load complete:', nodes.length, 'nodes');
}

async function performSave(getState: () => { nodes: any[]; edges: any[] }) {
    if (!isConnected) return;

    // Use a flag to track if we should notify the UI. 
    // We only want to show "Saving..." if we're not already showing it.
    onSaveStart?.();

    try {
        const { nodes, edges } = getState();
        // saveData now returns a promise that resolves when the save (or the queued save) is actually on disk
        await fileSystemStorage.saveData(nodes, edges, { skipFolderSync: false });
        onSaveEnd?.(new Date().toLocaleTimeString());
    } catch (error) {
        console.error('[StorageManager] Save failed:', error);
        onSaveEnd?.('Failed');
        
        // If save failed because handle was invalidated, update status
        if (!fileSystemStorage.isConnected) {
            isConnected = false;
            onStatusChange?.(false, null);
        }
    }
}

/**
 * Manually connect to a directory (called from UI)
 */
export async function connectStorage(
    getState: () => { nodes: any[]; edges: any[] },
    loadGraph: (nodes: any[], edges: any[]) => void
): Promise<boolean> {
    try {
        // Try reconnect first
        let success = await fileSystemStorage.reconnect();
        
        if (!success) {
            success = await fileSystemStorage.selectDirectory();
        }

        if (success) {
            const data = await fileSystemStorage.loadData();
            if (data) {
                // Progressive loading for large datasets
                if (data.nodes.length > 1000) {
                    console.log('[StorageManager] Large dataset detected, progressive loading...');
                    await progressiveLoad(data.nodes, data.edges, loadGraph);
                } else {
                    loadGraph(data.nodes, data.edges);
                }
            } else {
                // No data on disk, save current state
                const { nodes, edges } = getState();
                await fileSystemStorage.saveData(nodes, edges);
            }
            
            isConnected = true;
            onStatusChange?.(true, fileSystemStorage.directoryName || 'Local Folder');
            return true;
        }
    } catch (error) {
        console.error('[StorageManager] Connection failed:', error);
    }
    return false;
}

/**
 * Check if storage is connected
 */
export function isStorageConnected(): boolean {
    return isConnected;
}
