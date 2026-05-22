import { useCallback, useState, useEffect } from 'react';
import { Cloud, CloudDownload, Undo2, Loader2, CheckCircle2, AlertCircle, LogIn } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { saveCanvasToCloud, loadCanvasFromCloud } from '../../services/cloudSync';
import { isSupabaseConfigured } from '../../services/supabase/client';
import styles from './CloudSyncControls.module.css';

type Status =
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'loading' }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string };

/**
 * Save Cloud + Reload Saved Data — the two explicit buttons the user wants
 * in the canvas workspace overlay. They're hidden when Supabase isn't
 * configured. When the user is signed-out, both buttons act as a hint to
 * sign in (opens the AuthModal).
 */
export function CloudSyncControls() {
    const userId = useStore((s) => s.auth.userId);
    const isAuthenticated = useStore((s) => s.auth.isAuthenticated);
    const setAuthModalOpen = useStore((s) => s.setAuthModalOpen);
    const loadGraph = useStore((s) => s.loadGraph);

    // Sync setters for global state
    const setCloudLastSaved = useStore((s) => s.setCloudLastSaved);
    const setCloudDirty = useStore((s) => s.setCloudDirty);
    const setCloudError = useStore((s) => s.setCloudError);

    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    // Detect if a cloud reload backup exists in localStorage
    const [hasCloudBackup, setHasCloudBackup] = useState(false);
    useEffect(() => {
        setHasCloudBackup(localStorage.getItem('infonote-cloud-reload-backup') !== null);
    }, []);

    const flashStatus = useCallback((next: Status, ms = 2400) => {
        setStatus(next);
        if (next.kind === 'success' || next.kind === 'error') {
            window.setTimeout(() => {
                setStatus((curr) => (curr === next ? { kind: 'idle' } : curr));
            }, ms);
        }
    }, []);

    const handleSave = useCallback(async () => {
        if (!isSupabaseConfigured) {
            flashStatus({ kind: 'error', message: 'Cloud is not configured.' });
            return;
        }
        if (!isAuthenticated) {
            setAuthModalOpen(true);
            return;
        }

        setStatus({ kind: 'saving' });
        const { nodes, edges } = useStore.getState();
        const result = await saveCanvasToCloud(userId, nodes, edges);
        if (result.ok) {
            const timeStr = new Date().toLocaleTimeString();
            if (setCloudLastSaved) setCloudLastSaved(timeStr);
            if (setCloudDirty) setCloudDirty(false);
            if (setCloudError) setCloudError(null);
            flashStatus({
                kind: 'success',
                message: `Saved ${result.counts.nodes} nodes / ${result.counts.edges} edges`,
            });
        } else {
            const errMsg = result.error || 'Cloud save failed';
            if (setCloudError) setCloudError(errMsg);
            flashStatus({ kind: 'error', message: errMsg });
        }
    }, [isAuthenticated, userId, setAuthModalOpen, flashStatus, setCloudLastSaved, setCloudDirty, setCloudError]);

    const handleReload = useCallback(async () => {
        if (!isSupabaseConfigured) {
            flashStatus({ kind: 'error', message: 'Cloud is not configured.' });
            return;
        }
        if (!isAuthenticated) {
            setAuthModalOpen(true);
            return;
        }

        // Confirm because reload wipes local state.
        const confirmed = window.confirm(
            'Reloading replaces the current canvas with your last saved cloud snapshot. Continue?'
        );
        if (!confirmed) return;

        // Backup current in-memory state to localStorage before overwriting
        try {
            const current = useStore.getState();
            const backup = {
                nodes: current.nodes,
                edges: current.edges,
                timestamp: Date.now(),
            };
            localStorage.setItem('infonote-cloud-reload-backup', JSON.stringify(backup));
        } catch {
            // Backup is best-effort; localStorage may be full
        }

        setStatus({ kind: 'loading' });
        const result = await loadCanvasFromCloud(userId);
        if (result.ok) {
            loadGraph(result.nodes, result.edges);
            flashStatus({
                kind: 'success',
                message: `Loaded ${result.nodes.length} nodes / ${result.edges.length} edges`,
            });
        } else {
            flashStatus({ kind: 'error', message: result.error });
        }
    }, [isAuthenticated, userId, setAuthModalOpen, loadGraph, flashStatus]);

    const handleRestoreBackup = useCallback(() => {
        try {
            const raw = localStorage.getItem('infonote-cloud-reload-backup');
            if (!raw) {
                flashStatus({ kind: 'error', message: 'No cloud reload backup found.' });
                return;
            }
            const backup = JSON.parse(raw);
            if (!backup.nodes || !backup.edges) {
                flashStatus({ kind: 'error', message: 'Cloud reload backup is corrupt.' });
                return;
            }
            const confirmed = window.confirm(
                `Restore canvas from backup saved at ${new Date(backup.timestamp).toLocaleString()}?`
            );
            if (!confirmed) return;
            loadGraph(backup.nodes, backup.edges);
            localStorage.removeItem('infonote-cloud-reload-backup');
            setHasCloudBackup(false);
            flashStatus({ kind: 'success', message: 'Restored from cloud reload backup.' });
        } catch {
            localStorage.removeItem('infonote-cloud-reload-backup');
            setHasCloudBackup(false);
            flashStatus({ kind: 'error', message: 'Failed to restore backup. It has been cleared.' });
        }
    }, [loadGraph, flashStatus]);

    if (!isSupabaseConfigured) return null;

    const saving = status.kind === 'saving';
    const loadingFromCloud = status.kind === 'loading';
    const busy = saving || loadingFromCloud;

    return (
        <div className={styles.wrap} role="group" aria-label="Cloud sync">
            {hasCloudBackup && (
                <button
                    type="button"
                    className={`${styles.btn} ${styles.warning}`}
                    onClick={handleRestoreBackup}
                    title="Restore canvas from backup taken before last cloud reload"
                >
                    <Undo2 size={14} />
                    <span>Restore Backup</span>
                </button>
            )}
            <button
                type="button"
                className={`${styles.btn} ${styles.primary}`}
                onClick={handleSave}
                disabled={busy}
                title={isAuthenticated ? 'Save the canvas to your cloud account' : 'Sign in to enable cloud sync'}
            >
                {saving ? <Loader2 size={14} className="animate-spin" />
                    : !isAuthenticated ? <LogIn size={14} />
                    : <Cloud size={14} />}
                <span>{saving ? 'Saving…' : 'Save Cloud'}</span>
            </button>

            <button
                type="button"
                className={`${styles.btn} ${styles.secondary}`}
                onClick={handleReload}
                disabled={busy}
                title={isAuthenticated ? 'Reload the canvas from cloud' : 'Sign in to enable cloud sync'}
            >
                {loadingFromCloud ? <Loader2 size={14} className="animate-spin" />
                    : !isAuthenticated ? <LogIn size={14} />
                    : <CloudDownload size={14} />}
                <span>{loadingFromCloud ? 'Loading…' : 'Reload Saved Data'}</span>
            </button>

            {status.kind === 'success' && (
                <div className={`${styles.statusPill} ${styles.success}`} role="status">
                    <CheckCircle2 size={12} />
                    <span>{status.message}</span>
                </div>
            )}
            {status.kind === 'error' && (
                <div className={`${styles.statusPill} ${styles.error}`} role="alert">
                    <AlertCircle size={12} />
                    <span>{status.message}</span>
                </div>
            )}
        </div>
    );
}
