import { useEffect, useState } from 'react';
import { Button } from '../../shared/ui/controls/button/Button';
import { LOCAL_WORKSPACE_KEY, loadLocalWorkspace, readLocalWorkspaceSummary, type LocalWorkspaceSummary } from '../../services/storage/workspace/LocalWorkspaceStore';
import { downloadGraphBackup } from '../../services/storage/workspace/backupExport';
import { storedFolderBinding, type FolderBinding } from '../../services/storage/workspace/folderBinding';
import styles from './RecoveryPage.module.css';

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Independent entry point: no application store, autosave, renderer or auth
 * bootstrap is imported. Export always reads the saved graph, never an empty
 * UI projection left behind by an interrupted startup. */
export function RecoveryPage() {
    const [summary, setSummary] = useState<LocalWorkspaceSummary | null | undefined>();
    const [folder, setFolder] = useState<FolderBinding | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [folderError, setFolderError] = useState<string | null>(null);
    const [busy, setBusy] = useState<'backup' | 'permission' | null>(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let stopped = false;
        // Folder permission metadata must not block exporting browser work.
        readLocalWorkspaceSummary(LOCAL_WORKSPACE_KEY)
            .then(summary => { if (!stopped) setSummary(summary); })
            .catch(cause => { if (!stopped) setError(message(cause)); });
        storedFolderBinding()
            .then(folder => { if (!stopped) setFolder(folder); })
            .catch(cause => { if (!stopped) setFolderError(message(cause)); });
        return () => { stopped = true; };
    }, [attempt]);

    const backup = async () => {
        setBusy('backup'); setError(null); setNotice(null);
        try {
            const graph = await loadLocalWorkspace(LOCAL_WORKSPACE_KEY);
            if (!graph) throw new Error('No saved browser workspace was found. Your folder files were not changed.');
            const name = await downloadGraphBackup(graph);
            setNotice(`Backup prepared: ${name}`);
        } catch (cause) { setError(message(cause)); }
        finally { setBusy(null); }
    };
    const allowFolder = async () => {
        if (!folder) return;
        setBusy('permission'); setError(null); setNotice(null);
        try {
            // Keep the permission request inside this explicit user gesture.
            const permission = await folder.handle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') throw new Error('Folder access was not granted. Your saved files have not been changed.');
            setNotice('Folder access is ready. You can try opening your workspace again.');
        } catch (cause) { setError(message(cause)); }
        finally { setBusy(null); }
    };
    return <main className={styles.page}><div className={styles.content}>
        <h1>Workspace recovery</h1>
        <p>Back up the work saved in this browser without opening the canvas. Exporting a backup does not replace or delete your workspace.</p>
        {summary === undefined && !error && <p role="status">Checking for saved work…</p>}
        {summary && <dl className={styles.details}>
            <dt>Saved items</dt><dd>{summary.nodes.toLocaleString()}</dd>
            <dt>Connections</dt><dd>{summary.edges.toLocaleString()}</dd>
            <dt>Last saved</dt><dd>{new Date(summary.updatedAt).toLocaleString()}</dd>
        </dl>}
        {summary === null && <p>No workspace is saved in this browser. {folder ? 'Reconnect the saved folder, then try opening your workspace.' : 'If your work is saved in another browser, open recovery there.'}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {folderError && <p role="status">Saved folder access could not be checked: {folderError} You can still export browser work when available.</p>}
        {notice && <p role="status">{notice}</p>}
        <div className={styles.actions}>
            <Button variant="primary" disabled={!summary || busy !== null} loading={busy === 'backup'} onClick={() => void backup()}>Download saved backup</Button>
            {folder && <Button disabled={busy !== null} loading={busy === 'permission'} onClick={() => void allowFolder()}>Allow saved folder access</Button>}
            <a className={styles.link} href="/canvas">Try opening workspace</a>
        </div>
        {(error || folderError) && <Button variant="ghost" disabled={busy !== null} onClick={() => { setError(null); setFolderError(null); setSummary(undefined); setFolder(null); setAttempt(value => value + 1); }}>Check saved work again</Button>}
        <p className={styles.note}>Use the same address and browser where you saved your work. Keep this backup somewhere you can find again.</p>
    </div></main>;
}
