import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { temporal } from 'zundo';
import { createNodeSlice } from './slices/nodeSlice';
import { createNavigationSlice } from './slices/navigationSlice';
import { createStorageSlice } from './slices/storageSlice';
import { createUISlice } from './slices/uiSlice';
import type { AppState } from './types';
import { initStorageManager } from '../services/StorageManager';

export const useStore = create<AppState>()(
    subscribeWithSelector(
        temporal(
            (...a) => ({
                ...createNodeSlice(...a),
                ...createNavigationSlice(...a),
                ...createStorageSlice(...a),
                ...createUISlice(...a),
            }),
            {
                limit: 50, // Limit history stack size
                partialize: (state) => {
                    const { nodes, edges } = state;
                    return { nodes, edges };
                },
                // Use a more efficient equality check or remove to use default
            }
        )
    )
);

// Initialize storage manager ONCE at module load (outside React)
if (typeof window !== 'undefined') {
    // Use setTimeout to ensure store is fully created
    setTimeout(() => {
        const state = useStore.getState();
        
        initStorageManager(
            () => ({ nodes: useStore.getState().nodes, edges: useStore.getState().edges }),
            useStore.subscribe,
            state.loadGraph,
            {
                onStatusChange: (connected, dirName) => {
                    useStore.getState().setStorageStatus(connected, dirName);
                },
                onSaveStart: () => {
                    useStore.getState().setIsSaving(true);
                },
                onSaveEnd: (time) => {
                    useStore.getState().setIsSaving(false);
                    useStore.getState().setLastSaved(time);
                }
            }
        );
        
        // One-time cleanup: Remove duplicate nodes
        const nodes = state.nodes;
        const seenIds = new Set<string>();
        const duplicates: string[] = [];
        nodes.forEach(node => {
            if (seenIds.has(node.id)) {
                duplicates.push(node.id);
            }
            seenIds.add(node.id);
        });
        
        if (duplicates.length > 0) {
            console.warn('[Store Cleanup] Found duplicate node IDs:', duplicates);
            const cleanedNodes = nodes.filter((node, index) => {
                const firstIndex = nodes.findIndex(n => n.id === node.id);
                return firstIndex === index;
            });
            
            if (cleanedNodes.length !== nodes.length) {
                console.warn('[Store Cleanup] Removing', nodes.length - cleanedNodes.length, 'duplicate nodes');
                state.setNodes(cleanedNodes);
            }
        }
    }, 100);
}

