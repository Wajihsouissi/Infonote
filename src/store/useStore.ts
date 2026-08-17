import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { temporal } from 'zundo';
import { createNodeSlice } from './slices/nodeSlice';
import { createNavigationSlice } from './slices/navigationSlice';
import { createStorageSlice } from './slices/storageSlice';
import { createUISlice } from './slices/uiSlice';
import { createAuthSlice } from './slices/authSlice';
import { createAISlice } from './slices/aiSlice';
import type { AppState } from './types';
import { initStorageManager, flushPendingSave } from '../services/StorageManager';
import { bindTemporal, type HistoryState } from './temporalControl';
import { historyEquality, createCoalescingHandleSet } from './historyConfig';

// Collapse a burst of rapid mutations (a drag, a synchronous cascade of sets)
// into one undo step. Kept below the editor's 300ms write debounce so typing
// still records sentence-sized steps rather than one giant entry.
const HISTORY_COALESCE_MS = 150;

export const useStore = create<AppState>()(
    subscribeWithSelector(
        temporal(
            (...a) => ({
                ...createNodeSlice(...a),
                ...createNavigationSlice(...a),
                ...createStorageSlice(...a),
                ...createUISlice(...a),
                ...createAuthSlice(...a),
                ...createAISlice(...a),
            }),
            {
                limit: 200,
                // Only nodes/edges are undoable; everything else is UI/session state.
                partialize: (state): HistoryState => {
                    const { nodes, edges } = state;
                    return { nodes, edges };
                },
                // Skip pure selection/measurement changes so clicking a card
                // never creates (or, after an undo, never destroys) a step.
                equality: historyEquality,
                // One drag / one cascade = one undo step.
                handleSet: createCoalescingHandleSet(HISTORY_COALESCE_MS),
            }
        )
    )
);

// Let slices pause/clear history for programmatic & remote writes without a
// circular import back into this module.
bindTemporal(useStore.temporal as Parameters<typeof bindTemporal>[0]);

// Dev-only handle so QA harnesses can drive the REAL store instance from the
// page console (a dynamic import() in an eval sandbox gets a separate copy).
if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as { __appStore?: typeof useStore }).__appStore = useStore;
}

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

            /* Not while a card is in flight. This diff allocates two maps of
               the whole canvas and walks every node, and a drag would run it
               once per frame to learn what the drop will tell it anyway. */
            if (state.interactionState.draggedNodeId) return;

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
                        const { selected: _cs, ...cnRest } = cn;
                        const { selected: _ps, ...pnRest } = pn;
                        const isOnlySelectedChange = Object.keys(cnRest).length === Object.keys(pnRest).length &&
                            Object.keys(cnRest).every(k => (cnRest as Record<string, unknown>)[k] === (pnRest as Record<string, unknown>)[k]);
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
