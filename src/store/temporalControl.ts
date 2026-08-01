import type { StoreApi } from 'zustand';
import type { TemporalState } from 'zundo';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types';

/** The slice of state we track for undo/redo (see `partialize` in useStore). */
export type HistoryState = { nodes: AppNode[]; edges: Edge[] };
type TemporalApi = StoreApi<TemporalState<HistoryState>>;

// Bound once at store creation. Kept in a standalone module so slices can drive
// the temporal store without importing useStore (which would be a cycle).
let temporalStore: TemporalApi | null = null;

export function bindTemporal(store: TemporalApi) {
    temporalStore = store;
}

/** Drop the entire undo/redo timeline (e.g. after loading a different graph). */
export function clearHistory() {
    temporalStore?.getState().clear();
}

/**
 * Run `fn` without recording any of its store mutations into undo history.
 *
 * Use for writes the user did not perform directly — graph loads, parent /
 * content reconciliation, and remote (collaboration) updates. While paused,
 * zundo records nothing AND does not clear the redo stack, so these background
 * writes can't corrupt the timeline or silently disable redo.
 *
 * Nesting-safe: only resumes if history was actually tracking on entry.
 */
export function withoutHistory<T>(fn: () => T): T {
    const wasTracking = temporalStore?.getState().isTracking ?? false;
    if (wasTracking) temporalStore?.getState().pause();
    try {
        return fn();
    } finally {
        if (wasTracking) temporalStore?.getState().resume();
    }
}
