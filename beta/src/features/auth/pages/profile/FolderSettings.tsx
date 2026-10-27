import { useState } from 'react';
import { Folder } from '../../../../shared/icons';
import { Button } from '../../../../shared/ui/controls/button/Button';
import { connectFolder, disconnectFolder, folderSupported, retryFolderSave, useFolderStatus } from '../../../../services/storage/workspace/folderPersistence';
import styles from './ProfilePage.module.css';

export function FolderSettings() {
    const status = useFolderStatus();
    const connecting = status.phase === 'connecting';
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const run = async (action: () => Promise<void>) => {
        setBusy(true); setError(null);
        try { await action(); }
        catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e)); }
        finally { setBusy(false); }
    };
    return <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Autosave to a folder</h2>
        <p className={styles.sectionText}>Choose a folder on your computer. Changes and uploaded files save there automatically, with a recovery copy in this browser. Open that folder to bring your workspace back.</p>
        {status.name && <p className={styles.sectionText} style={{ overflowWrap: 'anywhere' }} role="status">{status.name} — {connecting ? 'Connecting your folder…' : status.phase === 'saved' ? 'Saved to folder' : status.phase === 'saving' ? 'Saving to folder…' : status.phase === 'permission' ? 'Reconnect to allow folder access' : 'Folder save paused'}</p>}
        {(error || status.error) && <p className={styles.error} role="alert">{error || status.error}</p>}
        <div className={styles.actions}>
            <Button variant="primary" size="sm" leadingIcon={<Folder size={14} />} disabled={busy || connecting || !folderSupported()} loading={busy} onClick={() => void run(connectFolder)}>Choose or open folder</Button>
            {status.name && <>
                <Button variant="secondary" size="sm" disabled={busy || connecting} onClick={() => void run(retryFolderSave)}>Retry folder save</Button>
                <Button variant="ghost" size="sm" disabled={busy || connecting || status.phase === 'saving'} onClick={() => void run(disconnectFolder)}>Disconnect folder</Button>
            </>}
        </div>
        {!folderSupported() && <p className={styles.footnote}>Folder autosave is available in Chrome and Edge. Use a backup file in this browser.</p>}
        <p className={styles.footnote}>Keep the chnk-it-workspace folder and its files together. A folder on this computer is not a backup against losing the computer.</p>
    </section>;
}
