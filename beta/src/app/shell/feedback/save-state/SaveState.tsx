import { AlertTriangle, Check, Cloud } from '../../../../shared/icons';
import { useId, useState } from 'react';
import { useStore } from '../../../../store/useStore';
import styles from './SaveState.module.css';
import { useFolderStatus } from '../../../../services/storage/workspace/folderPersistence';
import { downloadBackup } from '../../../../services/storage/workspace/workspaceBackup';
import { flushPendingEditorWrites } from '../../../../services/storage/workspace/pendingEditorWrites';
import { flushParentSyncs } from '../../../../store/graphHelpers';
import { Button } from '../../../../shared/ui/controls/button/Button';

/**
 * Whether this browser has your latest change.
 *
 * In an app with a server, a save indicator is reassurance. Here it is the
 * whole safety story: nothing leaves this device, so "saved" means "saved on
 * this machine" — which is exactly what the wording says, because a badge that
 * implies a cloud copy would be a lie told once a minute.
 */
export function SaveState() {
    const { isLocalDirty, localLastSaved, localError } = useStore((s) => s.storage);
    const folder = useFolderStatus();
    const titleId = useId();
    const [downloading, setDownloading] = useState(false);
    const [notice, setNotice] = useState('');

    const backup = async () => {
        setDownloading(true); setNotice('');
        try {
            flushPendingEditorWrites(); flushParentSyncs();
            const filename = await downloadBackup();
            setNotice(`Copy downloaded: ${filename}`);
        } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
        finally { setDownloading(false); }
    };
    const reopen = () => {
        flushPendingEditorWrites(); flushParentSyncs();
        if (useStore.getState().storage.isLocalDirty && !window.confirm('Reopen the saved workspace? Unsaved changes in this tab will be discarded. Download a copy first to keep them.')) return;
        window.location.reload();
    };

    if (localError) {
        return <details className={styles.recovery}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
                if (event.key !== 'Escape') return;
                event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
            }}>
            <summary role="button" className={`${styles.chip} ${styles.error}`} aria-label="Not saved. Open save recovery">
                <AlertTriangle size={13} aria-hidden="true" /><span className={styles.label} role="status">Not saved</span>
            </summary>
            <div className={styles.panel} role="dialog" aria-labelledby={titleId}>
                <h2 id={titleId}>Keep your changes safe</h2>
                <p>{localError}</p>
                <p>Keep this tab open until you save or download your changes.</p>
                <div className={styles.actions}>
                    <Button variant="primary" size="sm" loading={downloading} onClick={() => void backup()}>Download this tab’s backup</Button>
                    <Button size="sm" onClick={() => window.dispatchEvent(new Event('chnk-it-retry-local-save'))}>Retry saving</Button>
                    <Button variant="ghost" size="sm" onClick={reopen}>Reopen saved workspace</Button>
                </div>
                {notice && <p role="status">{notice}</p>}
                <a href="/recovery">Open saved-work recovery</a>
            </div>
        </details>;
    }

    if (folder.name) {
        const failed = folder.phase === 'error' || folder.phase === 'permission';
        const connecting = folder.phase === 'connecting';
        const saving = isLocalDirty || folder.phase === 'saving' || connecting;
        return <span className={`${styles.chip} ${failed ? styles.error : ''}`} role="status" aria-label={failed ? 'Folder save paused' : saving ? 'Saving to folder' : 'Saved to folder'} title={folder.error || folder.name}>
            {failed ? <AlertTriangle size={13} /> : saving ? <Cloud size={13} /> : <Check size={13} />}
            <span className={styles.label}>{failed ? 'Folder save paused' : connecting ? 'Connecting folder…' : saving ? 'Saving to folder…' : 'Saved to folder'}</span>
        </span>;
    }

    if (isLocalDirty || !localLastSaved) {
        return (
            <span className={styles.chip} role="status" aria-label="Saving changes on this device">
                <Cloud size={13} />
                <span className={styles.label}>Saving…</span>
            </span>
        );
    }

    const at = new Date(localLastSaved);
    const time = Number.isNaN(at.getTime())
        ? ''
        : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    return (
        <span className={styles.chip} role="status" aria-label="Saved on this device" title={time ? `Last saved at ${time}, in this browser` : undefined}>
            <Check size={13} />
            <span className={styles.label}>Saved on this device</span>
        </span>
    );
}
