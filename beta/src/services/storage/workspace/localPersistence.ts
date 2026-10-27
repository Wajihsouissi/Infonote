/**
 * Keeps this browser's saved copy of the workspace in step with the store.
 *
 * Start it once at app boot. It loads the saved workspace into the store, then
 * saves after every real change: debounced so typing is not a write per key,
 * but capped so continuous typing still reaches disk, and deferred during a
 * drag until the card is dropped. Saves are serialized by the store module, so
 * they commit in the order they were made.
 */
import { useStore } from '../../../store/useStore';
import { historyEquality } from '../../../store/historyConfig';
import { flushParentSyncs } from '../../../store/graphHelpers';
import { LOCAL_WORKSPACE_KEY, loadLocalWorkspace, saveLocalWorkspace, subscribeLocalWorkspaceChanges } from './LocalWorkspaceStore';
import { hasBeenWelcomed, markWelcomed, welcomeCanvas } from './welcomeCanvas';
import { folderHasPendingChanges, getFolderStatus, markFolderDirty, queueFolderSave, reconnectFolder } from './folderPersistence';
import { flushPendingEditorWrites, hasPendingEditorWrites, subscribePendingEditorWrites } from './pendingEditorWrites';

/** Quiet period before a save. */
const SAVE_DELAY_MS = 350;
/** Longest a change may wait while edits keep arriving. */
const MAX_SAVE_DELAY_MS = 1500;

const timeLabel = (time = Date.now()): string => new Date(time).toISOString();
const errorMessage = (error: unknown): string => error instanceof Error && error.name === 'QuotaExceededError'
    ? 'This browser’s storage is full. Download your changes, free some space, then retry saving.'
    : error instanceof Error ? error.message : String(error);

export interface LocalPersistenceOptions {
    /** Called once a verified browser/folder graph is ready for editing. */
    onReady: () => void;
    onError?: (message: string) => void;
}

/** Starts loading and autosaving; returns the stop function (safe to call twice). */
export function startLocalPersistence({ onReady, onError }: LocalPersistenceOptions): () => void {
    let stopped = false;
    let hydrated = false;
    let quietTimer: number | null = null;
    let maxTimer: number | null = null;
    /** Bumped per scheduled change: a save only clears "dirty" if nothing
     *  newer arrived while it was being written. */
    let generation = 0;
    let runningWrite: Promise<void> | null = null;
    let writeRequested = false;
    let forcedWriteRequested = false;
    const unsubscribes: Array<() => void> = [];

    const clearTimers = () => {
        if (quietTimer !== null) window.clearTimeout(quietTimer);
        if (maxTimer !== null) window.clearTimeout(maxTimer);
        quietTimer = maxTimer = null;
    };

    const writeCurrent = async (): Promise<void> => {
        try {
            flushPendingEditorWrites();
            flushParentSyncs();
            clearTimers();
            const savedGeneration = generation;
            const { nodes, edges } = useStore.getState();
            await saveLocalWorkspace({ key: LOCAL_WORKSPACE_KEY, nodes, edges, updatedAt: Date.now() });
            // A refused browser revision must never escape through folder autosave.
            queueFolderSave({ nodes, edges });
            if (stopped) return;
            const state = useStore.getState();
            state.setLocalLastSaved(timeLabel());
            if (savedGeneration === generation && !hasPendingEditorWrites() && state.interactionState.draggedNodeId === null) state.setLocalDirty(false);
            state.setLocalError(null);
        } catch (error) {
            if (stopped) return;
            if (!(error instanceof Error && error.name === 'LocalWorkspaceConflictError')) console.error('[localPersistence] Save failed:', error);
            const state = useStore.getState();
            state.setLocalError(errorMessage(error));
            state.setLocalDirty(true);
        }
    };

    /** One active write and one request for the latest live graph. Slow disk
     * must not retain a snapshot for every debounce in the storage FIFO. */
    const persist = (forced = false): Promise<void> => {
        if (stopped) return Promise.resolve();
        clearTimers();
        writeRequested = true;
        forcedWriteRequested ||= forced;
        if (runningWrite) return runningWrite;
        runningWrite = Promise.resolve().then(async () => {
            while (writeRequested && !stopped) {
                writeRequested = false;
                const mustWrite = forcedWriteRequested;
                forcedWriteRequested = false;
                const state = useStore.getState();
                // A debounce may have started before the drag. Its timer must
                // obey the same guard as newly observed movement. Lifecycle
                // flushes still capture the last graph if the page goes away.
                if (!mustWrite && state.interactionState.draggedNodeId !== null) {
                    state.setLocalDirty(true);
                    continue;
                }
                await writeCurrent();
            }
        }).finally(() => {
            runningWrite = null;
            // A lifecycle flush can arrive after the loop's last check but
            // before this promise settles. Join another drain rather than
            // stranding that final dirty graph with its timers already cleared.
            if (writeRequested && !stopped) return persist(forcedWriteRequested);
        });
        return runningWrite;
    };

    const scheduleSave = () => {
        generation++;
        markFolderDirty();
        if (!useStore.getState().storage.isLocalDirty) useStore.getState().setLocalDirty(true);
        if (quietTimer !== null) window.clearTimeout(quietTimer);
        quietTimer = window.setTimeout(() => void persist(), SAVE_DELAY_MS);
        maxTimer ??= window.setTimeout(() => void persist(), MAX_SAVE_DELAY_MS);
    };

    const flush = () => {
        if (!hydrated) return;
        flushPendingEditorWrites();
        if (hydrated && (useStore.getState().storage.isLocalDirty || folderHasPendingChanges())) void persist(true);
    };

    const watchChanges = () => {
        unsubscribes.push(subscribeLocalWorkspaceChanges(key => {
            if (key !== LOCAL_WORKSPACE_KEY || stopped) return;
            useStore.getState().setLocalError('Another tab has saved a newer workspace. Download any changes in this tab before reopening the saved workspace.');
        }));
        unsubscribes.push(subscribePendingEditorWrites(() => {
            if (hasPendingEditorWrites()) scheduleSave();
        }));
        if (hasPendingEditorWrites()) scheduleSave();
        // Graph edits. The drag guard lives in the equality function because
        // zustand runs it first, and `historyEquality` walks the whole graph:
        // guarding only the listener would still pay that walk every frame.
        unsubscribes.push(useStore.subscribe(
            (state) => ({ nodes: state.nodes, edges: state.edges }),
            scheduleSave,
            {
                equalityFn: (previous, current) =>
                    useStore.getState().interactionState.draggedNodeId !== null ||
                    historyEquality(previous, current),
            },
        ));
        // …and the other half of that guard: when a drag ends, save its result
        // instead of hoping some later change carries it.
        unsubscribes.push(useStore.subscribe(
            (state) => state.interactionState.draggedNodeId,
            (dragged, previous) => {
                if (dragged !== null && previous === null) {
                    generation++; markFolderDirty(); useStore.getState().setLocalDirty(true);
                }
                if (dragged === null && previous !== null) scheduleSave();
            },
        ));
    };

    const start = async () => {
        try {
            const stored = await loadLocalWorkspace(LOCAL_WORKSPACE_KEY);
            if (stopped) return;
            const state = useStore.getState();
            if (stored) {
                state.loadGraph(stored.nodes, stored.edges);
                const projection = useStore.getState();
                if (projection.nodes.length !== stored.nodes.length || projection.edges.length !== stored.edges.length) {
                    throw new Error('The saved workspace contains unsupported or incomplete items. Open workspace recovery to download its saved backup before continuing.');
                }
                state.setLocalLastSaved(timeLabel(stored.updatedAt));
                hydrated = true;
                watchChanges();
                onReady();
                // Persist a one-time identity repair before the next reload.
                // A valid document retains its array and incurs no extra save.
                const repaired = useStore.getState().nodes;
                if (repaired.length === stored.nodes.length && stored.nodes.some((node, index) =>
                    Array.isArray(node.data.content) && node.data.content !== repaired[index].data.content)) await persist();
                // Local edits are durable immediately. FolderSession joins its
                // initialization and reads the live graph when it can save.
                await reconnectFolder(stored);
                return;
            }
            // Without a browser copy, never expose an empty editable canvas
            // while a linked folder may still contain the only saved graph.
            const folder = await reconnectFolder(null);
            if (stopped) return;
            const folderStatus = getFolderStatus();
            if (!folder && (folderStatus.phase === 'error' || folderStatus.phase === 'permission')) {
                throw new Error(folderStatus.error || 'Your saved folder needs access before this workspace can open. Use workspace recovery to reconnect it.');
            }
            if (folder) state.loadGraph(folder.nodes, folder.edges);
            else if (!hasBeenWelcomed()) {
                const welcome = welcomeCanvas(); state.loadGraph(welcome.nodes, welcome.edges); markWelcomed();
            }
            hydrated = true;
            watchChanges();
            onReady();
            await persist();
        } catch (error) {
            if (stopped) return;
            // A failed load must not expose an empty editable projection or
            // allow autosave to replace the saved workspace.
            console.error('[localPersistence] Load failed:', error);
            useStore.getState().setLocalError(errorMessage(error));
            if (!hydrated) onError?.(errorMessage(error));
        }
    };

    const handleVisibility = () => {
        if (document.visibilityState === 'hidden') flush();
    };
    const retry = () => { if (hydrated) void persist(true); };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
        if (!hydrated || (!useStore.getState().storage.isLocalDirty && !folderHasPendingChanges())) return;
        flush();
        // The write is asynchronous; ask the browser to hold the page so it can land.
        event.preventDefault();
    };

    window.addEventListener('pagehide', flush);
    window.addEventListener('chnk-it-retry-local-save', retry);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    void start();

    return () => {
        if (stopped) return;
        stopped = true;
        writeRequested = forcedWriteRequested = false;
        clearTimers();
        unsubscribes.forEach((unsubscribe) => unsubscribe());
        window.removeEventListener('pagehide', flush);
        window.removeEventListener('chnk-it-retry-local-save', retry);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('visibilitychange', handleVisibility);
        // Capture the final graph even if the app is torn down before the
        // debounce fires. Never before hydration: that would overwrite the
        // saved workspace with an empty store.
        if (hydrated && (useStore.getState().storage.isLocalDirty || hasPendingEditorWrites())) {
            flushPendingEditorWrites();
            flushParentSyncs();
            const { nodes, edges } = useStore.getState();
            void saveLocalWorkspace({ key: LOCAL_WORKSPACE_KEY, nodes, edges, updatedAt: Date.now() })
                .catch((error) => console.error('[localPersistence] Final save failed:', error));
        }
    };
}
