/**
 * Keeps this browser's saved copy of the workspace in step with the store.
 *
 * Start it once at app boot. It loads the saved workspace into the store, then
 * saves after every real change: debounced so typing is not a write per key,
 * but capped so continuous typing still reaches disk, and deferred during a
 * drag until the card is dropped. Saves are serialized by the store module, so
 * they commit in the order they were made.
 */
import { useStore } from '../../store/useStore';
import { historyEquality } from '../../store/historyConfig';
import { LOCAL_WORKSPACE_KEY, loadLocalWorkspace, saveLocalWorkspace } from './LocalWorkspaceStore';
import { hasBeenWelcomed, markWelcomed, welcomeCanvas } from './welcomeCanvas';

/** Quiet period before a save. */
const SAVE_DELAY_MS = 350;
/** Longest a change may wait while edits keep arriving. */
const MAX_SAVE_DELAY_MS = 1500;

const timeLabel = (time = Date.now()): string => new Date(time).toLocaleTimeString();
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export interface LocalPersistenceOptions {
    /** Called once the saved workspace is in the store (or loading failed and
     *  the app should carry on in memory). Editing before this would be lost. */
    onReady: () => void;
}

/** Starts loading and autosaving; returns the stop function (safe to call twice). */
export function startLocalPersistence({ onReady }: LocalPersistenceOptions): () => void {
    let stopped = false;
    let hydrated = false;
    let quietTimer: number | null = null;
    let maxTimer: number | null = null;
    /** Bumped per scheduled change: a save only clears "dirty" if nothing
     *  newer arrived while it was being written. */
    let generation = 0;
    const unsubscribes: Array<() => void> = [];

    const clearTimers = () => {
        if (quietTimer !== null) window.clearTimeout(quietTimer);
        if (maxTimer !== null) window.clearTimeout(maxTimer);
        quietTimer = maxTimer = null;
    };

    const persist = async (): Promise<void> => {
        clearTimers();
        const savedGeneration = generation;
        const { nodes, edges } = useStore.getState();
        try {
            await saveLocalWorkspace({ key: LOCAL_WORKSPACE_KEY, nodes, edges, updatedAt: Date.now() });
            if (stopped) return;
            const state = useStore.getState();
            state.setLocalLastSaved(timeLabel());
            if (savedGeneration === generation) state.setLocalDirty(false);
            state.setLocalError(null);
        } catch (error) {
            if (stopped) return;
            console.error('[localPersistence] Save failed:', error);
            const state = useStore.getState();
            state.setLocalError(errorMessage(error));
            state.setLocalDirty(true);
        }
    };

    const scheduleSave = () => {
        generation++;
        useStore.getState().setLocalDirty(true);
        if (quietTimer !== null) window.clearTimeout(quietTimer);
        quietTimer = window.setTimeout(() => void persist(), SAVE_DELAY_MS);
        maxTimer ??= window.setTimeout(() => void persist(), MAX_SAVE_DELAY_MS);
    };

    const flush = () => {
        if (hydrated && useStore.getState().storage.isLocalDirty) void persist();
    };

    const watchChanges = () => {
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
                state.setLocalLastSaved(timeLabel(stored.updatedAt));
            } else if (!hasBeenWelcomed()) {
                const welcome = welcomeCanvas();
                state.loadGraph(welcome.nodes, welcome.edges);
                markWelcomed();
            }
            hydrated = true;
            watchChanges();
            if (!stored) await persist();
        } catch (error) {
            if (stopped) return;
            // Storage is unavailable (private mode, blocked site data…). The app
            // still works; the error tells the user their work is not being kept.
            console.error('[localPersistence] Load failed:', error);
            useStore.getState().setLocalError(errorMessage(error));
        } finally {
            if (!stopped) onReady();
        }
    };

    const handleVisibility = () => {
        if (document.visibilityState === 'hidden') flush();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
        if (!hydrated || !useStore.getState().storage.isLocalDirty) return;
        flush();
        // The write is asynchronous; ask the browser to hold the page so it can land.
        event.preventDefault();
    };

    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    void start();

    return () => {
        if (stopped) return;
        stopped = true;
        clearTimers();
        unsubscribes.forEach((unsubscribe) => unsubscribe());
        window.removeEventListener('pagehide', flush);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('visibilitychange', handleVisibility);
        // Capture the final graph even if the app is torn down before the
        // debounce fires. Never before hydration: that would overwrite the
        // saved workspace with an empty store.
        if (hydrated) {
            const { nodes, edges } = useStore.getState();
            void saveLocalWorkspace({ key: LOCAL_WORKSPACE_KEY, nodes, edges, updatedAt: Date.now() })
                .catch((error) => console.error('[localPersistence] Final save failed:', error));
        }
    };
}
