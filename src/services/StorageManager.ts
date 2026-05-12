/**
 * StorageManager - Module-level storage synchronization.
 *
 * Now backend-agnostic: holds a GraphBackend reference (file-system by default,
 * can be swapped to Supabase at runtime). The subscribe/debounce/immediate-save
 * logic is unchanged, so existing local-folder behavior is preserved.
 */

import { fileSystemBackend } from './storage/FileSystemBackend';
import { supabaseBackend } from './storage/SupabaseBackend';
import type { GraphBackend, BackendKind } from './storage/types';

let isInitialized = false;
let saveTimeout: number | null = null;

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

    // Auto-reconnect the file-system backend on startup (Supabase cloud mode
    // requires an explicit sign-in + connect click).
    autoReconnect();

    // Subscribe to store changes for auto-save.
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
                    // Immediate save for structural changes.
                    performSave();
                } else {
                    // Debounce content changes.
                    saveTimeout = window.setTimeout(performSave, 500);
                }
            }
        }
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
        if (data && data.nodes.length > 0) {
            storeCallbacks.loadGraph(data.nodes, data.edges);
        }
        storeCallbacks.setStorageStatus(true, activeBackend.displayName ?? 'Local Folder');
    } catch {
        // Silently fail on auto-reconnect; user can still connect manually.
    }
}

async function performSave(): Promise<void> {
    if (!storeCallbacks || !activeBackend.isConnected) return;

    try {
        const { nodes, edges } = storeCallbacks.getState();
        await activeBackend.save({ nodes, edges });
        storeCallbacks.setLastSaved(new Date().toLocaleTimeString());
    } catch {
        // If the backend dropped its connection, surface that to the UI.
        if (!activeBackend.isConnected) {
            storeCallbacks.setStorageStatus(false, null);
        }
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
    const backend: GraphBackend = kind === 'supabase' ? supabaseBackend : fileSystemBackend;

    try {
        const connected = await backend.connect();
        if (!connected) {
            return { success: false, error: kind === 'supabase'
                ? 'Cloud connection was cancelled or not signed in'
                : 'Directory selection was cancelled' };
        }

        // Disconnect the previously active backend (if it was a different one)
        // so auto-save does not double-write.
        if (activeBackend !== backend) {
            try { await activeBackend.disconnect(); } catch { /* ignore */ }
        }
        activeBackend = backend;

        const data = await backend.load();
        if (data && data.nodes.length > 0) {
            ctx.loadGraph(data.nodes, data.edges);
        } else {
            const currentState = ctx.getState();
            if (currentState.nodes.length > 0) {
                await backend.save({ nodes: currentState.nodes, edges: currentState.edges });
            }
        }

        ctx.setStorageStatus(true, backend.displayName ?? (kind === 'supabase' ? 'Cloud' : 'Local Folder'));
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
