import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { temporal } from 'zundo';
import { createNodeSlice } from './slices/nodeSlice';
import { createNavigationSlice } from './slices/navigationSlice';
import { createStorageSlice } from './slices/storageSlice';
import { createUISlice } from './slices/uiSlice';
import { createAuthSlice } from './slices/authSlice';
import type { AppState } from './types';
import { initStorageManager, flushPendingSave } from '../services/StorageManager';

export const useStore = create<AppState>()(
    subscribeWithSelector(
        temporal(
            (...a) => ({
                ...createNodeSlice(...a),
                ...createNavigationSlice(...a),
                ...createStorageSlice(...a),
                ...createUISlice(...a),
                ...createAuthSlice(...a),
            }),
            {
                limit: 200,
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

    // Warn on page unload if there are unsaved changes, and flush pending saves.
    window.addEventListener('beforeunload', (e) => {
        const state = useStore.getState();
        const { isLocalDirty, isCloudDirty } = state.storage;

        if (isLocalDirty || isCloudDirty) {
            flushPendingSave();
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Compute explicit deltas for cloud sync
    useStore.subscribe(
        (state) => ({ nodes: state.nodes, edges: state.edges, isRestoring: state.storage.isRestoringGraph }),
        (curr, prev) => {
            if (curr.isRestoring) return;

            const state = useStore.getState();

            if (curr.nodes !== prev.nodes) {
                const prevNodesMap = new Map(prev.nodes.map(n => [n.id, n]));
                const currNodesMap = new Map(curr.nodes.map(n => [n.id, n]));
                
                const deleted: string[] = [];
                const dirty: string[] = [];

                prev.nodes.forEach(pn => {
                    if (!currNodesMap.has(pn.id)) deleted.push(pn.id);
                });

                curr.nodes.forEach(cn => {
                    const pn = prevNodesMap.get(cn.id);
                    if (!pn) {
                        dirty.push(cn.id);
                    } else if (pn !== cn) {
                        // Skip selection-only changes — `selected` is a UI concern
                        // and must not mark nodes dirty for cloud sync.
                        const { selected: _cs, ...cnRest } = cn as any;
                        const { selected: _ps, ...pnRest } = pn as any;
                        const isOnlySelectedChange = Object.keys(cnRest).length === Object.keys(pnRest).length &&
                            Object.keys(cnRest).every(k => (cnRest as any)[k] === (pnRest as any)[k]);
                        if (!isOnlySelectedChange) {
                            dirty.push(cn.id);
                        }
                    }
                });

                if (deleted.length > 0) state.markNodesDeleted(deleted);
                if (dirty.length > 0) state.markNodesDirty(dirty);
            }

            if (curr.edges !== prev.edges) {
                const prevEdgesMap = new Map(prev.edges.map(e => [e.id, e]));
                const currEdgesMap = new Map(curr.edges.map(e => [e.id, e]));

                const deleted: string[] = [];
                const dirty: string[] = [];

                prev.edges.forEach(pe => {
                    if (!currEdgesMap.has(pe.id)) deleted.push(pe.id);
                });

                curr.edges.forEach(ce => {
                    const pe = prevEdgesMap.get(ce.id);
                    if (!pe || pe !== ce) dirty.push(ce.id);
                });

                if (deleted.length > 0) state.markEdgesDeleted(deleted);
                if (dirty.length > 0) state.markEdgesDirty(dirty);
            }
        }
    );
}
