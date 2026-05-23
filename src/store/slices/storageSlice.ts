import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, StorageSlice } from '../types';
import type { AppNode } from '../../types';

export const createStorageSlice: StateCreator<AppState, [], [], StorageSlice> = (set, get) => ({
    storage: {
        isConnected: false,
        directoryName: null,
        lastSaved: null,
        isSaving: false,
        
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
        storage: { ...state.storage, cloudLastSaved: date }
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
    loadGraph: (nodes, edges) => {
        // Guard: nodes must be an array
        if (!Array.isArray(nodes)) {
            console.warn('[storageSlice] loadGraph called with non-array nodes, ignoring.');
            return;
        }

        // Default edges to empty array if undefined/null
        const safeEdges = Array.isArray(edges) ? edges : [];

        // Safety cap: limit nodes to 500 to prevent performance issues
        const cappedNodes = nodes.slice(0, 500);
        if (nodes.length > 500) {
            console.warn(`[storageSlice] Trimming nodes from ${nodes.length} to 500 (safety cap).`);
        }

        // Snapshot current state BEFORE overwriting (for data-loss recovery)
        const prevNodes = get().nodes;
        const prevEdges = get().edges;

        // Validate and sanitize nodes
        const validNodes = cappedNodes.map(node => {
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

        set((state) => ({
            nodes: validNodes,
            edges: validEdges,
            storage: {
                ...state.storage,
                backupNodes: prevNodes,
                backupEdges: prevEdges,
                cloudLastSaved: new Date().toLocaleTimeString(),
                cloudError: null,
            },
        }));

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

        set((state) => ({
            nodes: storage.backupNodes,
            edges: storage.backupEdges,
            storage: {
                ...state.storage,
                backupNodes: [],
                backupEdges: [],
            },
        }));
    },
});
