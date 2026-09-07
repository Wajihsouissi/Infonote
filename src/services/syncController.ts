import type { CloudSyncResult } from './cloudSync';

export interface WorkspaceSyncRequest {
    forceFull?: boolean;
    createManualVersion?: boolean;
    /** Persist the active IndexedDB outbox without contacting the cloud. */
    localOnly?: boolean;
}

type SyncHandler = (request: WorkspaceSyncRequest) => Promise<CloudSyncResult>;

let activeHandler: SyncHandler | null = null;

export function registerWorkspaceSyncHandler(handler: SyncHandler | null): () => void {
    activeHandler = handler;
    return () => {
        if (activeHandler === handler) activeHandler = null;
    };
}

export function requestWorkspaceSync(request: WorkspaceSyncRequest = {}): Promise<CloudSyncResult> {
    if (!activeHandler) {
        return Promise.resolve({ ok: false, error: 'Workspace sync is still starting. Try again in a moment.' });
    }
    return activeHandler(request);
}
