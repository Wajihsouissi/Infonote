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
        console.log('loadGraph called with:', { nodesCount: nodes.length, edgesCount: edges.length });

        // Snapshot current state before overwriting (for data-loss recovery)
        const prevNodes = get().nodes;
        const prevEdges = get().edges;

        // Validate and sanitize nodes
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
                const noteContent = (newNode.data as any).content;
                if (!Array.isArray(noteContent)) {
                    console.warn(`[storageSlice] Node ${newNode.id} (${newNode.type}) content is not an array. Type: ${typeof noteContent}`);

                    if (typeof noteContent === 'string') {
                        console.log(`[storageSlice] Converting legacy string content for node ${newNode.id}`);
                        (newNode.data as any).content = [{ id: uuidv4(), type: 'text', content: noteContent }];
                    } else if (!noteContent) {
                        // null or undefined
                        (newNode.data as any).content = [];
                    } else {
                        // It's some other object/truthy value. Keep it but warn? 
                        // Or wrap it?
                        // If we wipe it, we lose data. Let's try to wrap it if it looks like a block, or keep as is?
                        // Safest is to log and initialize empty only if we are sure it's garbage.
                        // For now, let's assuming it MIGHT be valid but strangely typed, so we default to empty but log heavily.
                        // Actually, let's try to preserve it in a 'raw' field if we wipe it?
                        console.error(`[storageSlice] Unknown content format for node ${newNode.id}. Resetting to empty. Original:`, noteContent);
                        (newNode.data as any)._lostContent = noteContent; // Backup
                        (newNode.data as any).content = [];
                    }
                } else {
                    // Content is valid array
                    if ((newNode.data as any).content.length > 0) {
                        // console.log(`[storageSlice] Node ${newNode.id} loaded with ${(newNode.data as any).content.length} blocks`);
                    }
                }
            }
            return newNode;
        }).filter(n => n !== null) as AppNode[];

        // Validate edges
        const validEdges = edges.filter(edge => {
            if (!edge || typeof edge !== 'object') return false;
            if (!edge.id || !edge.source || !edge.target) return false;
            return true;
        });

        console.log(`Validated: ${validNodes.length}/${nodes.length} nodes, ${validEdges.length}/${edges.length} edges`);

        set((state) => ({
            nodes: validNodes,
            edges: validEdges,
            storage: {
                ...state.storage,
                backupNodes: prevNodes,
                backupEdges: prevEdges,
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
