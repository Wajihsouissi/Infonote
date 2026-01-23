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
                limit: 50,
                partialize: (state) => {
                    const { nodes, edges } = state;
                    return { nodes, edges };
                },
            }
        )
    )
);

// Initialize storage manager ONCE at module load (outside React)
if (typeof window !== 'undefined') {
    setTimeout(() => {
        initStorageManager(
            () => ({ nodes: useStore.getState().nodes, edges: useStore.getState().edges }),
            useStore.subscribe,
            (nodes, edges) => useStore.getState().loadGraph(nodes, edges),
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
    }, 100);
}
