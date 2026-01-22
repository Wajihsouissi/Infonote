import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, StorageSlice } from '../types';
import type { AppNode } from '../../types';

export const createStorageSlice: StateCreator<AppState, [], [], StorageSlice> = (set, get) => ({
    storage: {
        isConnected: false,
        directoryName: null,
        lastSaved: null,
        isSaving: false
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
    loadGraph: (nodes, edges) => {
        console.log('loadGraph called with:', { nodesCount: nodes.length, edgesCount: edges.length });

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
                if (!Array.isArray((newNode.data as any).content)) {
                    // Check for legacy string content or undefined
                    const legacyContent = (newNode.data as any).content;
                    if (typeof legacyContent === 'string') {
                        (newNode.data as any).content = [{ id: uuidv4(), type: 'text', content: legacyContent }];
                    } else {
                        (newNode.data as any).content = [];
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

        set({
            nodes: validNodes,
            edges: validEdges,
        });

        // Reconstruct breadcrumbs if we restored a parent ID from localStorage
        get().reconstructBreadcrumbs();
    },
});
