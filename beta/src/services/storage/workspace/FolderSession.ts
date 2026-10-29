import { FolderWorkspace, type FolderGraph } from './FolderWorkspace';
import { storedFolderBinding, type FolderBinding, type FolderDirectory } from './folderBinding';

interface Status {
    name: string | null;
    phase: 'off' | 'permission' | 'connecting' | 'saving' | 'saved' | 'error';
    error: string | null;
}
interface GraphAccess {
    getGraph(): FolderGraph;
    replaceGraph(graph: FolderGraph): void;
}

/** Owns one folder session: reconnect, switching, queued writes and status.
 * FolderWorkspace owns disk commits; the caller supplies the live graph. */
export class FolderSession {
    private status: Status = { name: null, phase: 'off', error: null };
    private listeners = new Set<() => void>();
    private binding: FolderBinding | null = null;
    private workspace: FolderWorkspace | null = null;
    private epoch = 0;
    private pending: { graph: FolderGraph; epoch: number } | null = null;
    private running: Promise<void> | null = null;
    private switching = false;
    private initializing: Promise<FolderGraph | null> | null = null;
    private loadedGraph: FolderGraph | null = null;
    private graph: GraphAccess;

    constructor(graph: GraphAccess) { this.graph = graph; }

    getStatus = () => this.status;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    private publish(patch: Partial<Status>) {
        this.status = { ...this.status, ...patch };
        this.listeners.forEach(fn => fn());
    }
    folderSupported = () => 'showDirectoryPicker' in window && !!navigator.locks;
    folderHasPendingChanges = () => this.status.phase === 'saving' || this.status.phase === 'error';

    markFolderDirty = () => {
        this.epoch++;
        if (this.workspace) this.publish({ phase: 'saving', error: null });
    };
    queueFolderSave = (graph: FolderGraph): void => {
        if (!this.workspace || this.switching) return;
        this.pending = { graph, epoch: this.epoch };
        if (this.running) return;
        this.running = (async () => {
            while (this.pending && this.workspace) {
                const job = this.pending; this.pending = null;
                try {
                    await this.workspace.save(job.graph);
                    if (this.binding) {
                        this.binding = { ...this.binding, commit: this.workspace.commit };
                        await storedFolderBinding(this.binding);
                    }
                    if (job.epoch === this.epoch) this.publish({ phase: 'saved', error: null });
                } catch (e) {
                    this.pending = null;
                    this.publish({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
                }
            }
        })().finally(() => {
            this.running = null;
            if (this.pending) this.queueFolderSave(this.pending.graph);
        });
    };

    /** A remembered folder never replaces a newer browser draft or prompts at
     * startup. An external revision requires the explicit open/replace flow. */
    reconnectFolder = (browserGraph: FolderGraph | null): Promise<FolderGraph | null> => {
        if (this.workspace) return Promise.resolve(browserGraph ? null : this.loadedGraph);
        if (this.initializing) return this.initializing;
        this.initializing = this.reconnect(browserGraph).finally(() => { this.initializing = null; });
        return this.initializing;
    };
    private async reconnect(browserGraph: FolderGraph | null): Promise<FolderGraph | null> {
        if (!this.folderSupported()) return null;
        try {
            this.binding = await storedFolderBinding();
            if (!this.binding) return null;
            this.publish({ name: this.binding.handle.name, phase: 'permission' });
            if (await this.binding.handle.queryPermission({ mode: 'readwrite' }) !== 'granted') return null;
            this.publish({ phase: 'connecting', error: null });
            const candidate = new FolderWorkspace(this.binding.handle);
            const graph = await candidate.load();
            if (candidate.commit !== this.binding.commit) throw new Error('The folder changed outside this tab. Reopen the folder to choose its saved workspace.');
            this.workspace = candidate;
            this.loadedGraph = graph;
            this.publish({ phase: 'saving' });
            // The browser can be edited while folder I/O is pending. Commit
            // the live graph, never the snapshot taken before reconnection.
            if (browserGraph) this.queueFolderSave(this.graph.getGraph());
            else this.publish({ phase: 'saved' });
            return browserGraph ? null : graph;
        } catch (e) {
            this.publish({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
            return null;
        }
    }

    connectFolder = async (): Promise<void> => {
        if (this.initializing) throw new Error('Your saved folder is still connecting. Try again shortly.');
        if (!this.folderSupported()) throw new Error('Folder autosave needs Chrome or Edge on this device. You can still save a backup file.');
        // Keep the picker in the direct user gesture, before awaiting any work.
        const picker = (window as unknown as { showDirectoryPicker: (options: { mode: string; id: string }) => Promise<FolderDirectory> }).showDirectoryPicker;
        const handle = await picker.call(window, { mode: 'readwrite', id: 'chnk-it-workspace' });
        if (this.switching) return;
        this.switching = true;
        try {
            await this.running;
            const candidate = new FolderWorkspace(handle);
            const graph = await candidate.load();
            if (graph && !window.confirm(`Open the saved workspace from “${handle.name}”? This replaces your current canvas. Save a backup first if you want to keep it.`)) return;
            if (graph) this.graph.replaceGraph(graph);
            this.binding = { handle, commit: candidate.commit };
            await storedFolderBinding(this.binding);
            this.workspace = candidate;
            this.loadedGraph = graph;
            this.pending = null;
            this.epoch++;
            this.publish({ name: handle.name, phase: 'saving', error: null });
        } finally { this.switching = false; }
        this.queueFolderSave(this.graph.getGraph());
        await this.running;
        if (this.status.phase === 'error') throw new Error(this.status.error ?? 'Folder save failed.');
    };
    disconnectFolder = async (): Promise<void> => {
        if (this.initializing) throw new Error('Your saved folder is still connecting. Try again shortly.');
        this.switching = true;
        try {
            await this.running;
            if (this.status.phase === 'saving' || this.status.phase === 'error') throw new Error('The folder has unsaved changes. Retry saving before disconnecting.');
            await storedFolderBinding(null);
            this.workspace = null; this.binding = null; this.pending = null; this.loadedGraph = null;
            this.publish({ name: null, phase: 'off', error: null });
        } finally { this.switching = false; }
    };
    retryFolderSave = async (): Promise<void> => {
        if (!this.workspace && this.binding) {
            if (await this.binding.handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Folder permission was not granted.');
            await this.reconnectFolder(this.graph.getGraph());
        }
        this.queueFolderSave(this.graph.getGraph());
        await this.running;
        if (this.status.phase === 'error') throw new Error(this.status.error ?? 'Folder save failed.');
    };
}
