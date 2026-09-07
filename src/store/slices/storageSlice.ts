import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, StorageSlice } from '../types';
import { isAppNodeType, type AppNode } from '../../types';
import { withoutHistory, clearHistory } from '../temporalControl';
import {
    DEFAULT_COLUMNS,
    GROUP_FIELDS as KANBAN_GROUP_FIELDS,
    type KanbanGroupField,
} from '../../features/kanban/kanbanTypes';

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
        cloudLastLoaded: null,
        isLocalDirty: false,
        isCloudDirty: false,
        isCloudSyncing: false,
        localError: null,
        folderError: null,
        cloudError: null,

        // Backup — saved before loadGraph overwrites current state
        backupNodes: [],
        backupEdges: [],

        cloudLoad: { phase: 'idle', progress: null },

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
    /* Real writes only. `cloudLastSaveTimeMs` is what the realtime listener
       uses to recognise its own save echoing back from Supabase, so stamping
       it on a load would suppress genuine collaborator events for 5s. */
    setCloudLastSaved: (date) => set((state) => ({
        storage: {
            ...state.storage,
            cloudLastSaved: date,
            cloudLastSaveTimeMs: Date.now()
        }
    })),
    setCloudLastLoaded: (date) => set((state) => ({
        storage: { ...state.storage, cloudLastLoaded: date }
    })),
    setLocalDirty: (dirty) => set((state) => ({
        storage: { ...state.storage, isLocalDirty: dirty }
    })),
    setCloudDirty: (dirty) => set((state) => {
        const hasPending =
            state.storage.dirtyNodeIds.size > 0 ||
            state.storage.dirtyEdgeIds.size > 0 ||
            state.storage.deletedNodeIds.size > 0 ||
            state.storage.deletedEdgeIds.size > 0;
        return {
            storage: { ...state.storage, isCloudDirty: dirty || hasPending }
        };
    }),
    setCloudSyncing: (syncing) => set((state) => ({
        storage: { ...state.storage, isCloudSyncing: syncing }
    })),
    setLocalError: (err) => set((state) => ({
        storage: { ...state.storage, localError: err }
    })),
    setFolderError: (err) => set((state) => ({
        storage: { ...state.storage, folderError: err }
    })),
    setCloudError: (err) => set((state) => ({
        storage: { ...state.storage, cloudError: err }
    })),
    setCloudLoad: (phase, progress) => set((state) => {
        const current = state.storage.cloudLoad;
        /* More than one caller can report on the same load (the canvas view and
           the storage controls both watch it). A blocking load outranks a
           background one, so a second reporter can never quietly dismiss the
           full-screen loader while data is still arriving. Only 'idle' — which
           means the load is genuinely over — clears the rank. */
        const nextPhase =
            phase !== 'idle' && current.phase === 'blocking' ? 'blocking' : phase;
        return {
            storage: {
                ...state.storage,
                cloudLoad: {
                    phase: nextPhase,
                    // Going idle drops the progress so a later load never starts
                    // by flashing the previous one's percentage.
                    progress: nextPhase === 'idle' ? null : progress ?? current.progress,
                },
            },
        };
    }),

    markNodesDirty: (ids) => set((state) => {
        const next = new Set(state.storage.dirtyNodeIds);
        const deleted = new Set(state.storage.deletedNodeIds);
        const live = new Set(state.nodes.map((node) => node.id));
        ids.forEach(id => {
            next.add(id);
            // An undo/resurrection cancels a deletion that has not reached the
            // cloud yet. Without this, the save path upserts and then deletes
            // the same id.
            if (live.has(id)) deleted.delete(id);
        });
        return { storage: { ...state.storage, dirtyNodeIds: next, deletedNodeIds: deleted } };
    }),
    markEdgesDirty: (ids) => set((state) => {
        const next = new Set(state.storage.dirtyEdgeIds);
        const deleted = new Set(state.storage.deletedEdgeIds);
        const live = new Set(state.edges.map((edge) => edge.id));
        ids.forEach(id => {
            next.add(id);
            if (live.has(id)) deleted.delete(id);
        });
        return { storage: { ...state.storage, dirtyEdgeIds: next, deletedEdgeIds: deleted } };
    }),
    markNodesDeleted: (ids) => set((state) => {
        const next = new Set(state.storage.deletedNodeIds);
        const dirty = new Set(state.storage.dirtyNodeIds);
        ids.forEach(id => {
            next.add(id);
            dirty.delete(id);
        });
        return { storage: { ...state.storage, deletedNodeIds: next, dirtyNodeIds: dirty } };
    }),
    markEdgesDeleted: (ids) => set((state) => {
        const next = new Set(state.storage.deletedEdgeIds);
        const dirty = new Set(state.storage.dirtyEdgeIds);
        ids.forEach(id => {
            next.add(id);
            dirty.delete(id);
        });
        return { storage: { ...state.storage, deletedEdgeIds: next, dirtyEdgeIds: dirty } };
    }),
    replaceSyncTracking: (tracking) => set((state) => {
        const dirtyNodeIds = new Set(tracking.dirtyNodeIds);
        const dirtyEdgeIds = new Set(tracking.dirtyEdgeIds);
        const deletedNodeIds = new Set(tracking.deletedNodeIds);
        const deletedEdgeIds = new Set(tracking.deletedEdgeIds);
        return {
            storage: {
                ...state.storage,
                dirtyNodeIds,
                dirtyEdgeIds,
                deletedNodeIds,
                deletedEdgeIds,
                isCloudDirty:
                    dirtyNodeIds.size > 0 || dirtyEdgeIds.size > 0 ||
                    deletedNodeIds.size > 0 || deletedEdgeIds.size > 0,
            },
        };
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

        const hasPending =
            nextDirtyNodes.size > 0 || nextDirtyEdges.size > 0 ||
            nextDeletedNodes.size > 0 || nextDeletedEdges.size > 0;
        return {
            storage: {
                ...state.storage,
                dirtyNodeIds: nextDirtyNodes,
                dirtyEdgeIds: nextDirtyEdges,
                deletedNodeIds: nextDeletedNodes,
                deletedEdgeIds: nextDeletedEdges,
                // New edits may have arrived while a network save was in
                // flight. Never clear the trigger while any uncaptured work
                // remains.
                isCloudDirty: hasPending,
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

            if (!isAppNodeType(node.type)) {
                console.warn('Invalid node type:', node.type);
                return null;
            }

            if (!node.data || typeof node.data !== 'object') return null;

            // Sanitize Note Data
            const newNode = { ...node, data: { ...node.data } } as AppNode;

            /* A board carries no content of its own — its cards are separate
               nodes that load on their own account. What it must not load
               without is a group field and a lane list, because a board with
               neither has nowhere to put the cards that still point at it. */
            if (newNode.type === 'kanban') {
                const boardData = newNode.data as Record<string, unknown>;
                if (!KANBAN_GROUP_FIELDS.includes(boardData.groupBy as KanbanGroupField)) {
                    boardData.groupBy = 'status';
                }
                if (!Array.isArray(boardData.columns)) {
                    boardData.columns = DEFAULT_COLUMNS[boardData.groupBy as KanbanGroupField] ?? [];
                }
                if (!Array.isArray(boardData.cardOrder)) boardData.cardOrder = [];
            }
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
                nodes: validNodes,
                edges: validEdges,
                storage: {
                    ...state.storage,
                    isRestoringGraph: true,
                    backupNodes: prevNodes,
                    backupEdges: prevEdges,
                    /* No timestamp here. `loadGraph` is generic — it serves the
                       cloud load, a local folder load, a backup restore and the
                       Notion import alike, so it cannot claim anything about
                       the cloud. The cloud read paths stamp `cloudLastLoaded`
                       themselves. */
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
