import type { StateCreator } from 'zustand';
import type { Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, StorageSlice } from '../types';
import { isAppNodeType, type AppNode } from '../../types';
import { withoutHistory, clearHistory } from '../temporalControl';

/**
 * Bring one stored node into a shape the canvas can render, or reject it.
 *
 * Only structure is checked. Everything else in `data` — including fields the
 * beta does not know about — is carried through untouched.
 */
function sanitizeNode(raw: unknown): AppNode | null {
    if (!raw || typeof raw !== 'object') return null;
    const node = raw as Partial<AppNode>;
    if (!node.id || !isAppNodeType(node.type)) return null;
    if (!node.data || typeof node.data !== 'object') return null;

    const data: Record<string, unknown> = { ...node.data };
    if (node.type === 'note' || node.type === 'fused-note') {
        const content = data.content;
        if (typeof content === 'string') {
            // Very old notes stored their body as one plain string.
            data.content = content ? [{ id: uuidv4(), type: 'text', content }] : [];
        } else if (content == null) {
            data.content = [];
        } else if (!Array.isArray(content)) {
            // Unreadable body: keep the original beside an empty one rather than
            // lose it, so it can still be recovered from the stored record.
            console.error(`[loadGraph] Unknown content format on node ${node.id}; preserved as _lostContent.`);
            data._lostContent = content;
            data.content = [];
        }
    }
    return { ...node, data } as AppNode;
}

const isEdge = (raw: unknown): raw is Edge => {
    if (!raw || typeof raw !== 'object') return false;
    const edge = raw as Partial<Edge>;
    return Boolean(edge.id && edge.source && edge.target);
};

export const createStorageSlice: StateCreator<AppState, [], [], StorageSlice> = (set, get) => ({
    storage: {
        localLastSaved: null,
        isLocalDirty: false,
        localError: null,
    },
    setLocalLastSaved: (time) => set((state) => ({
        storage: { ...state.storage, localLastSaved: time },
    })),
    setLocalDirty: (dirty) => set((state) => ({
        storage: { ...state.storage, isLocalDirty: dirty },
    })),
    setLocalError: (err) => set((state) => ({
        storage: { ...state.storage, localError: err },
    })),

    loadGraph: (nodes, edges) => {
        if (!Array.isArray(nodes)) {
            console.warn('[loadGraph] Ignored a graph whose nodes are not an array.');
            return;
        }
        const validNodes = nodes.map(sanitizeNode).filter((n): n is AppNode => n !== null);
        const validEdges = (Array.isArray(edges) ? edges : []).filter(isEdge);

        // Loading a graph wholesale is not a user edit: don't record it, and
        // wipe the timeline, since undo steps from the previous graph are
        // meaningless against the one just loaded.
        withoutHistory(() => set({ nodes: validNodes, edges: validEdges }));
        clearHistory();

        // The remembered canvas may be inside the graph that just arrived.
        get().reconstructBreadcrumbs();
    },
});
