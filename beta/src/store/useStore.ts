import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { temporal } from 'zundo';
import { createNodeSlice } from './slices/nodeSlice';
import { createNodeContentSlice } from './slices/nodeContentSlice';
import { createNodeBulkSlice } from './slices/nodeBulkSlice';
import { createEdgeSlice } from './slices/edgeSlice';
import { createNestedCanvasSlice } from './slices/nestedCanvasSlice';
import { createLayoutSlice } from './slices/layoutSlice';
import { createNavigationSlice } from './slices/navigationSlice';
import { createStorageSlice } from './slices/storageSlice';
import { createUISlice } from './slices/uiSlice';
import { createAuthSlice } from './slices/authSlice';
import { createAISlice } from './slices/aiSlice';
import type { AppState } from './types';
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
                ...createNodeContentSlice(...a),
                ...createNodeBulkSlice(...a),
                ...createEdgeSlice(...a),
                ...createNestedCanvasSlice(...a),
                ...createLayoutSlice(...a),
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

// Let slices pause/clear history for programmatic writes without a circular
// import back into this module.
bindTemporal(useStore.temporal as Parameters<typeof bindTemporal>[0]);

// Dev-only handle so QA harnesses can drive the REAL store instance from the
// page console (a dynamic import() in an eval sandbox gets a separate copy).
if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as { __appStore?: typeof useStore }).__appStore = useStore;
}
