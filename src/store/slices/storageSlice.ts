import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, StorageSlice } from '../types';
import type { AppNode } from '../../types';
import { withoutHistory, clearHistory } from '../temporalControl';

export const createStorageSlice: StateCreator<AppState, [], [], StorageSlice> = (set, get) => ({
    storage: {
        isConnected: false,
        directoryName: null,
        lastSaved: null,
        isSaving: false,
        isRestoringGraph: false,
        
        // Dynamic Save States initialization:
        localLastSaved: null,
        cloudLastSaved: null,
        isLocalDirty: false,
        isCloudDirty: false,
        localError: null,
        cloudError: null,

        // Backup — saved before loadGraph overwrites current state
        backupNodes: [],
        backupEdges: [],

        isInitialCloudLoading: false,

        // Delta Tracking
        dirtyNodeIds: new Set<string>(),
        dirtyEdgeIds: new Set<string>(),
        deletedNodeIds: new Set<string>(),
        deletedEdgeIds: new Set<string>(),
    },
    setStorageStatus: (isConnected, directoryName) => set((state) => ({
        storage: { ...state.storage, isConnected, directoryName }
    })),
    setLastSaved: (date) => set((state) => ({
        storage: { ...state.storage, lastSaved: date }
    })),
    setIsSaving: (isSaving) => set((state) => ({
        storage: { ...state.storage, isSaving }
    })),
    setLocalLastSaved: (date) => set((state) => ({
        storage: { ...state.storage, localLastSaved: date }
    })),
    setCloudLastSaved: (date) => set((state) => ({
        storage: { 
            ...state.storage, 
            cloudLastSaved: date,
            cloudLastSaveTimeMs: Date.now() 
        }
    })),
    setLocalDirty: (dirty) => set((state) => ({
        storage: { ...state.storage, isLocalDirty: dirty }
    })),
    setCloudDirty: (dirty) => set((state) => ({
        storage: { ...state.storage, isCloudDirty: dirty }
    })),
    setLocalError: (err) => set((state) => ({
        storage: { ...state.storage, localError: err }
    })),
    setCloudError: (err) => set((state) => ({
        storage: { ...state.storage, cloudError: err }
    })),
    setInitialCloudLoading: (loading) => set((state) => ({
        storage: { ...state.storage, isInitialCloudLoading: loading }
    })),

    markNodesDirty: (ids) => set((state) => {
        const next = new Set(state.storage.dirtyNodeIds);
        ids.forEach(id => next.add(id));
        return { storage: { ...state.storage, dirtyNodeIds: next } };
    }),
    markEdgesDirty: (ids) => set((state) => {
        const next = new Set(state.storage.dirtyEdgeIds);
        ids.forEach(id => next.add(id));
        return { storage: { ...state.storage, dirtyEdgeIds: next } };
    }),
    markNodesDeleted: (ids) => set((state) => {
        const next = new Set(state.storage.deletedNodeIds);
        ids.forEach(id => {
            next.add(id);
            // If it was marked dirty, it doesn't matter anymore, it's deleted.
            // But we don't necessarily have to remove it from dirty here, we can just handle deletes first in sync.
        });
        return { storage: { ...state.storage, deletedNodeIds: next } };
    }),
    markEdgesDeleted: (ids) => set((state) => {
        const next = new Set(state.storage.deletedEdgeIds);
        ids.forEach(id => next.add(id));
        return { storage: { ...state.storage, deletedEdgeIds: next } };
    }),
    clearSyncTracking: (syncedNodes, syncedEdges, deletedNodes, deletedEdges) => set((state) => {
        const nextDirtyNodes = new Set(state.storage.dirtyNodeIds);
        const nextDirtyEdges = new Set(state.storage.dirtyEdgeIds);
        const nextDeletedNodes = new Set(state.storage.deletedNodeIds);
        const nextDeletedEdges = new Set(state.storage.deletedEdgeIds);

        syncedNodes.forEach(id => nextDirtyNodes.delete(id));
        syncedEdges.forEach(id => nextDirtyEdges.delete(id));
        deletedNodes.forEach(id => nextDeletedNodes.delete(id));
        deletedEdges.forEach(id => nextDeletedEdges.delete(id));

        return {
            storage: {
                ...state.storage,
                dirtyNodeIds: nextDirtyNodes,
                dirtyEdgeIds: nextDirtyEdges,
                deletedNodeIds: nextDeletedNodes,
                deletedEdgeIds: nextDeletedEdges,
            }
        };
    }),

    loadGraph: (nodes, edges) => {
        // Guard: nodes must be an array
        if (!Array.isArray(nodes)) {
            console.warn('[storageSlice] loadGraph called with non-array nodes, ignoring.');
            return;
        }

        // Default edges to empty array if undefined/null
        const safeEdges = Array.isArray(edges) ? edges : [];

        // Snapshot current state BEFORE overwriting (for data-loss recovery)
        const prevNodes = get().nodes;
        const prevEdges = get().edges;

        // Validate and sanitize nodes (no node-count cap — canvases of any
        // size load and save in full).
        const validNodes = nodes.map(node => {
            // Basic structure check
            if (!node || typeof node !== 'object') return null;
            if (!node.id || !node.type) return null;

            if (!['note', 'block', 'fused-note', 'kanban'].includes(node.type)) {
                console.warn('Invalid node type:', node.type);
                return null;
            }

            if (!node.data || typeof node.data !== 'object') return null;

            // Sanitize Note Data
            const newNode = { ...node };
            if (newNode.type === 'note' || newNode.type === 'fused-note') {
                // Ensure content is an array
                const noteData = newNode.data as Record<string, unknown>;
                const noteContent = noteData.content;
                if (!Array.isArray(noteContent)) {
                    console.warn(`[storageSlice] Node ${newNode.id} (${newNode.type}) content is not an array. Type: ${typeof noteContent}`);

                    if (typeof noteContent === 'string') {
                        noteData.content = [{ id: uuidv4(), type: 'text', content: noteContent }];
                    } else if (!noteContent) {
                        // null or undefined
                        noteData.content = [];
                    } else {
                        // It's some other object/truthy value. Keep it but warn? 
                        // Or wrap it?
                        // If we wipe it, we lose data. Let's try to wrap it if it looks like a block, or keep as is?
                        // Safest is to log and initialize empty only if we are sure it's garbage.
                        // For now, let's assuming it MIGHT be valid but strangely typed, so we default to empty but log heavily.
                        // Actually, let's try to preserve it in a 'raw' field if we wipe it?
                        console.error(`[storageSlice] Unknown content format for node ${newNode.id}. Resetting to empty. Original:`, noteContent);
                        noteData._lostContent = noteContent; // Backup
                        noteData.content = [];
                    }
                } else {
                    // Content is valid array
                    if ((noteData.content as unknown[]).length > 0) {
                        // console.log(`[storageSlice] Node ${newNode.id} loaded with ${(noteData.content as unknown[]).length} blocks`);
                    }
                }
            }
            return newNode;
        }).filter(n => n !== null) as AppNode[];

        // Validate edges
        const validEdges = safeEdges.filter(edge => {
            if (!edge || typeof edge !== 'object') return false;
            if (!edge.id || !edge.source || !edge.target) return false;
            return true;
        });

        // Loading a graph wholesale is not a user edit: don't record it, and
        // wipe any existing timeline since undo steps from the previous graph
        // are meaningless against the newly loaded one.
        withoutHistory(() => {
            set((state) => ({
                isRestoringGraph: true, // Wait, it needs to be inside storage: { ... }
                nodes: validNodes,
                edges: validEdges,
                storage: {
                    ...state.storage,
                    isRestoringGraph: true,
                    backupNodes: prevNodes,
                    backupEdges: prevEdges,
                    cloudLastSaved: new Date().toLocaleTimeString(),
                    cloudError: null,
                },
            }));

            // Give the diff subscriber a chance to run synchronously, then clear the flag
            set((state) => ({
                storage: { ...state.storage, isRestoringGraph: false }
            }));
        });
        clearHistory();

        // Reconstruct breadcrumbs if we restored a parent ID from localStorage
        get().reconstructBreadcrumbs();
    },

    restoreFromBackup: () => {
        const { storage } = get();
        if (!storage.backupNodes || storage.backupNodes.length === 0) return;

        const confirmed = window.confirm(
            'Restore the previous canvas state from backup? This replaces the current canvas.'
        );
        if (!confirmed) return;

        // A full-canvas restore replaces everything; reset the timeline rather
        // than leaving stale steps that would corrupt subsequent undos.
        withoutHistory(() => {
            set((state) => ({
                nodes: storage.backupNodes,
                edges: storage.backupEdges,
                storage: {
                    ...state.storage,
                    backupNodes: [],
                    backupEdges: [],
                },
            }));
        });
        clearHistory();
    },
});
