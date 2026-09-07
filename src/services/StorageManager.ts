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
import { historyEquality } from '../store/historyConfig';
import type { AppState } from '../store/types';
import type { AppNode } from '../types';
import type { Edge } from '@xyflow/react';

let isInitialized = false;
let saveTimeout: number | null = null;
let isRestoring = false;
let autoReconnectPromise: Promise<void> | null = null;

let activeBackend: GraphBackend = fileSystemBackend;

let storeCallbacks: {
    getState: () => { nodes: AppNode[]; edges: Edge[] };
    loadGraph: (nodes: AppNode[], edges: Edge[]) => void;
    setStorageStatus: (connected: boolean, dirName: string | null) => void;
    setIsSaving: (isSaving: boolean) => void;
    setLastSaved: (time: string | null) => void;
} | null = null;

export function initStorageManager(
    getState: () => { nodes: AppNode[]; edges: Edge[] },
    subscribe: <T>(selector: (state: AppState) => T, listener: (curr: T, prev: T) => void, options?: { equalityFn?: (a: T, b: T) => boolean }) => () => void,
    loadGraph: (nodes: AppNode[], edges: Edge[]) => void,
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
    autoReconnectPromise = autoReconnect();

    // Subscribe to store changes for auto-save.
    subscribe(
        (state: AppState) => ({
            nodes: state.nodes,
            edges: state.edges,
            isConnected: state.storage.isConnected,
        }),
        (curr, prev) => {
            const nodesChanged = curr.nodes !== prev.nodes;
            const edgesChanged = curr.edges !== prev.edges;

            if (nodesChanged || edgesChanged) {
                /* A drag rewrites the nodes array on every frame. None of what
                   follows — dirty flags and backend saves — describes
                   anything the user has finished doing yet, and all of it is
                   charged to the frame. The drop is a nodes change too, so
                   nothing is lost by waiting for it. */
                if (useStore.getState().interactionState.draggedNodeId) return;
                if (isRestoring) return;

                /* React Flow replaces the nodes array whenever it measures,
                   selects or resizes — none of which is a document edit. A
                   reference check counts them all, so merely opening the canvas
                   latched the app "unsaved": this marked it dirty, the sync
                   coordinator correctly saw no real change and never ran a save
                   to clear it, and the flag stayed set for the session. The
                   indicator then read "Saving to this device…" over a saved
                   workspace and every tab close raised a "Leave site?" prompt.
                   Judge a real change the same way the coordinator does. */
                if (historyEquality(
                    { nodes: prev.nodes, edges: prev.edges },
                    { nodes: curr.nodes, edges: curr.edges },
                )) return;

                /* Durability state belongs to the sync coordinator, which sets
                   it when it schedules a write and clears it when the write
                   lands. Setting it here — from a manager that only mirrors an
                   optional folder — meant two owners for one flag and no
                   agreement on when it was satisfied. */

                if (!curr.isConnected) return;

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

    // Only attempt file-system auto-reconnect from IndexedDB-stored handle.
    // NEVER prompt the user here — showDirectoryPicker requires a direct user
    // gesture and will throw a SecurityError if called during startup.
    // Cloud reconnect is an explicit user action because it requires auth.
    try {
        const connected = await fileSystemBackend.reconnect().catch(() => false);
        if (!connected) {
            return;
        }

        activeBackend = fileSystemBackend;

        const data = await fileSystemBackend.load();
        const timeStr = new Date().toLocaleTimeString();
        const state = useStore.getState();
        if (data && data.nodes.length > 0) {
            isRestoring = true;
            storeCallbacks.loadGraph(data.nodes, data.edges);
            isRestoring = false;
            if (state.setLastSaved) state.setLastSaved(timeStr);
            if (state.setFolderError) state.setFolderError(null);
        }
        storeCallbacks.setStorageStatus(true, activeBackend.displayName ?? 'Local Folder');
    } catch (err) {
        console.warn('[StorageManager] Auto-reconnect failed:', err);
        const state = useStore.getState();
        if (state.setFolderError) state.setFolderError(
            err instanceof Error ? err.message : 'Failed to reconnect to local storage'
        );
    }
}

export function getAutoReconnectPromise(): Promise<void> {
    return autoReconnectPromise || Promise.resolve();
}

async function performSave(): Promise<void> {
    if (!storeCallbacks || !activeBackend.isConnected) return;

    try {
        const { nodes, edges } = storeCallbacks.getState();
        await activeBackend.save({ nodes, edges });
        
        const timeStr = new Date().toLocaleTimeString();
        storeCallbacks.setLastSaved(timeStr);
        
        // Update the optional folder mirror status
        useStore.getState().setFolderError(null);
        // The folder mirror must not acknowledge an IndexedDB write that is
        // still pending (or clear its error). Its timestamp is lastSaved.
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const state = useStore.getState();
        if (state.setFolderError) state.setFolderError(errorMsg);

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
 * Generic entry point for any backend kind. Used by the new cloud button.
 */
export async function connectBackend(
    kind: BackendKind,
    ctx: {
        getState: () => { nodes: AppNode[]; edges: Edge[] };
        loadGraph: (nodes: AppNode[], edges: Edge[]) => void;
        setStorageStatus: (connected: boolean, dirName: string | null) => void;
        mode?: 'load' | 'save';
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

        const state = useStore.getState();

        if (ctx.mode === 'save') {
            // Force save the current state without loading
            const currentState = ctx.getState();
            await backend.save({ nodes: currentState.nodes, edges: currentState.edges });
            const timeStr = new Date().toLocaleTimeString();
            
            if (state.setLastSaved) state.setLastSaved(timeStr);
            if (state.setFolderError) state.setFolderError(null);
            ctx.setStorageStatus(true, backend.displayName ?? 'Local Folder');
            return { success: true };
        }

        const data = await backend.load();
        const timeStr = new Date().toLocaleTimeString();

        if (data) {
            isRestoring = true;
            ctx.loadGraph(data.nodes, data.edges);
            isRestoring = false;
            if (state.setLastSaved) state.setLastSaved(timeStr);
            if (state.setFolderError) state.setFolderError(null);
        } else {
            // Picking an empty or unreadable folder is not an instruction to
            // erase the current document.
            return { success: false, error: 'No saved workspace was found in this folder. Your current canvas was kept.' };
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
    if (saveTimeout) window.clearTimeout(saveTimeout);
    saveTimeout = null;
    setStorageStatus(false, null);
    try { await activeBackend.disconnect(); } catch { /* ignore */ }
    activeBackend = fileSystemBackend;
    setStorageStatus(false, null);

    const state = useStore.getState();
    if (state.setLastSaved) state.setLastSaved(null);
    if (state.setFolderError) state.setFolderError(null);
}

export function getActiveBackendKind(): BackendKind {
    return activeBackend.kind;
}

