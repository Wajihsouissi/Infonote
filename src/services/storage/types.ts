import type { Edge } from '@xyflow/react';
import type { AppNode } from '../../types';

/**
 * Storage backend contract. Both the local File System Access API backend and
 * the Supabase cloud backend implement this, so StorageManager does not care
 * which one is active.
 */
export type GraphData = { nodes: AppNode[]; edges: Edge[] };

export type BackendKind = 'filesystem' | 'supabase';

export interface GraphBackend {
    readonly kind: BackendKind;
    readonly isConnected: boolean;
    readonly displayName: string | null;

    /**
     * Attempt to connect. Returns true if connected (either freshly or via
     * a saved/stored handle). Implementations may show a picker or a modal.
     */
    connect(): Promise<boolean>;

    /**
     * Release the current connection without deleting remote data.
     */
    disconnect(): Promise<void>;

    load(): Promise<GraphData | null>;

    save(data: GraphData): Promise<void>;
}
