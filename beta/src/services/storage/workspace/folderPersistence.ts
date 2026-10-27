import { useSyncExternalStore } from 'react';
import { useStore } from '../../../store/useStore';
import { FolderSession } from './FolderSession';

// One application-scoped session survives React effect stop/restart. No I/O
// starts on construction; initialization remains an explicit autosave action.
const session = new FolderSession({
    getGraph: () => {
        const { nodes, edges } = useStore.getState();
        return { nodes, edges };
    },
    replaceGraph: graph => useStore.getState().loadGraph(graph.nodes, graph.edges),
});

export const useFolderStatus = () => useSyncExternalStore(session.subscribe, session.getStatus);
export const getFolderStatus = session.getStatus;

// Bound operations preserve the existing public entry points for UI/autosave.
export const {
    folderSupported, folderHasPendingChanges, markFolderDirty, queueFolderSave,
    reconnectFolder, connectFolder, disconnectFolder, retryFolderSave,
} = session;
