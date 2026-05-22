/**
 * StorageManager - Module-level storage synchronization for the local
 * filesystem backend. Cloud (Supabase) sync is handled explicitly via
 * src/services/cloudSync.ts and the canvas overlay buttons, so it intentionally
 * lives outside of this auto-save loop.
 */

import { fileSystemBackend } from './storage/FileSystemBackend';
import type { GraphBackend, BackendKind } from './storage/types';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store/useStore';

let isInitialized = false;
let saveTimeout: number | null = null;
let isRestoring = false;

let activeBackend: GraphBackend = fileSystemBackend;

let storeCallbacks: {
    getState: () => { nodes: any[]; edges: any[] };
    loadGraph: (nodes: any[], edges: any[]) => void;
    setStorageStatus: (connected: boolean, dirName: string | null) => void;
    setIsSaving: (isSaving: boolean) => void;
    setLastSaved: (time: string | null) => void;
} | null = null;

export function initStorageManager(
    getState: () => { nodes: any[]; edges: any[] },
    subscribe: <T>(selector: (state: any) => T, listener: (curr: T, prev: T) => void, options?: { equalityFn?: (a: T, b: T) => boolean }) => () => void,
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

    // Auto-reconnect the file-system backend on startup (Supabase cloud mode
    // requires an explicit sign-in + connect click).
    autoReconnect();

    // Subscribe to store changes for auto-save.
    subscribe(
        (state: any) => ({
            nodes: state.nodes,
            edges: state.edges,
            isConnected: state.storage.isConnected,
            setLocalDirty: (state as any).setLocalDirty,
            setCloudDirty: (state as any).setCloudDirty
        }),
        (curr, prev) => {
            const nodesChanged = curr.nodes !== prev.nodes;
            const edgesChanged = curr.edges !== prev.edges;

            if (nodesChanged || edgesChanged) {
                // Mark both states as unsynced/dirty
                if (curr.setLocalDirty) curr.setLocalDirty(true);
                if (curr.setCloudDirty) curr.setCloudDirty(true);

                if (!curr.isConnected || isRestoring) return;

                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }

                const nodeCountChanged = curr.nodes.length !== prev.nodes.length;

                if (nodeCountChanged) {
                    // Immediate save for structural changes.
                    performSave();
                } else {
                    // Debounce content changes.
                    saveTimeout = window.setTimeout(performSave, 500);
                }
            }
        },
        { equalityFn: shallow }
    );
}

async function autoReconnect(): Promise<void> {
    if (!storeCallbacks) return;

    // Only attempt file-system auto-reconnect (uses an IndexedDB-stored handle).
    // Cloud reconnect is an explicit user action because it requires auth.
    try {
        const connected = await fileSystemBackend.connect().catch(() => false);
        if (!connected) return;

        activeBackend = fileSystemBackend;

        const data = await fileSystemBackend.load();
        const timeStr = new Date().toLocaleTimeString();
        const state = useStore.getState();
        if (data && data.nodes.length > 0) {
            isRestoring = true;
            storeCallbacks.loadGraph(data.nodes, data.edges);
            isRestoring = false;
            if (state.setLocalLastSaved) state.setLocalLastSaved(timeStr);
            if (state.setLocalDirty) state.setLocalDirty(false);
            if (state.setLocalError) state.setLocalError(null);
        }
        storeCallbacks.setStorageStatus(true, activeBackend.displayName ?? 'Local Folder');
    } catch (err) {
        console.warn('[StorageManager] Auto-reconnect failed:', err);
        const state = useStore.getState();
        if (state.setLocalError) state.setLocalError(
            err instanceof Error ? err.message : 'Failed to reconnect to local storage'
        );
    }
}

async function performSave(): Promise<void> {
    if (!storeCallbacks || !activeBackend.isConnected) return;

    try {
        const { nodes, edges } = storeCallbacks.getState();
        await activeBackend.save({ nodes, edges });
        
        const timeStr = new Date().toLocaleTimeString();
        storeCallbacks.setLastSaved(timeStr);
        
        // Update new dynamic states
        const state = useStore.getState();
        if (state.setLocalLastSaved) state.setLocalLastSaved(timeStr);
        if (state.setLocalDirty) state.setLocalDirty(false);
        if (state.setLocalError) state.setLocalError(null);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const state = useStore.getState();
        if (state.setLocalError) state.setLocalError(errorMsg);

        // If the backend dropped its connection, surface that to the UI.
        if (!activeBackend.isConnected) {
            storeCallbacks.setStorageStatus(false, null);
        }
    }
}

/**
 * Flush any pending debounced save immediately.
 * Called from the beforeunload handler to minimize data loss on tab close.
 */
export function flushPendingSave(): void {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
        performSave();
    }
}

/**
 * Legacy entry point used by <StorageControls /> for the local-folder button.
 * Kept intact so existing callers do not have to change.
 */
export async function connectStorage(
    getState: () => { nodes: any[]; edges: any[] },
    loadGraph: (nodes: any[], edges: any[]) => void,
    setStorageStatus: (connected: boolean, dirName: string | null) => void
): Promise<{ success: boolean; error?: string }> {
    return connectBackend('filesystem', { getState, loadGraph, setStorageStatus });
}

/**
 * Generic entry point for any backend kind. Used by the new cloud button.
 */
export async function connectBackend(
    kind: BackendKind,
    ctx: {
        getState: () => { nodes: any[]; edges: any[] };
        loadGraph: (nodes: any[], edges: any[]) => void;
        setStorageStatus: (connected: boolean, dirName: string | null) => void;
    }
): Promise<{ success: boolean; error?: string }> {
    if (kind !== 'filesystem') {
        return { success: false, error: 'Cloud backend is now handled by the explicit Save/Reload buttons.' };
    }
    const backend: GraphBackend = fileSystemBackend;

    try {
        const connected = await backend.connect();
        if (!connected) {
            return { success: false, error: 'Directory selection was cancelled' };
        }

        // Disconnect the previously active backend (if it was a different one)
        // so auto-save does not double-write.
        if (activeBackend !== backend) {
            try { await activeBackend.disconnect(); } catch { /* ignore */ }
        }
        activeBackend = backend;

        const data = await backend.load();
        const timeStr = new Date().toLocaleTimeString();
        const state = useStore.getState();

        if (data && data.nodes.length > 0) {
            isRestoring = true;
            ctx.loadGraph(data.nodes, data.edges);
            isRestoring = false;
            if (state.setLocalLastSaved) state.setLocalLastSaved(timeStr);
            if (state.setLocalDirty) state.setLocalDirty(false);
            if (state.setLocalError) state.setLocalError(null);
        } else {
            // Folder is empty — start fresh by clearing the canvas
            const currentState = ctx.getState();
            if (currentState.nodes.length > 0) {
                ctx.loadGraph([], []);
            }
            if (state.setLocalLastSaved) state.setLocalLastSaved(null);
            if (state.setLocalDirty) state.setLocalDirty(false);
            if (state.setLocalError) state.setLocalError(null);
        }

        ctx.setStorageStatus(true, backend.displayName ?? 'Local Folder');
        return { success: true };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx.setStorageStatus(false, null);
        return { success: false, error: errorMsg };
    }
}

export async function disconnectBackend(
    setStorageStatus: (connected: boolean, dirName: string | null) => void
): Promise<void> {
    try { await activeBackend.disconnect(); } catch { /* ignore */ }
    activeBackend = fileSystemBackend;
    setStorageStatus(false, null);

    const state = useStore.getState();
    if (state.setLocalLastSaved) state.setLocalLastSaved(null);
    if (state.setLocalDirty) state.setLocalDirty(false);
    if (state.setLocalError) state.setLocalError(null);
}

export function getActiveBackendKind(): BackendKind {
    return activeBackend.kind;
}

export function isStorageConnected(): boolean {
    return activeBackend.isConnected;
}

export function getDirectoryName(): string | undefined {
    return activeBackend.displayName ?? undefined;
}
