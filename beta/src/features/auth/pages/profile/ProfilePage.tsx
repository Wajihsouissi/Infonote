import { useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, Download, LogOut, Trash2, Upload, User } from '../../../../shared/icons';
import { Button } from '../../../../shared/ui/controls/button/Button';
import { useStore } from '../../../../store/useStore';
import { downloadBackup, restoreBackup } from '../../../../services/storage/workspace/workspaceBackup';
import { authErrorMessage, isSupabaseConfigured, signOut, updateDisplayName } from '../../session';
import styles from './ProfilePage.module.css';
import { FolderSettings } from './FolderSettings';

/**
 * The account page: a name, a way out, and the backup file. Guests reach it
 * too — the backup matters most to someone with no account at all.
 *
 * The backup is here rather than buried in settings because in a local-first
 * app it is the single most consequential control on the page — the only thing
 * standing between a user and a lost laptop. It is also the honest answer to
 * "what does my account do with my work": nothing, yet. This page says so.
 */
export function ProfilePage() {
    const setView = useStore((s) => s.setView);
    const auth = useStore((s) => s.auth);
    const nodeCount = useStore((s) => s.nodes.length);

    const [name, setName] = useState(auth.displayName ?? '');
    const [savingName, setSavingName] = useState(false);
    const [busy, setBusy] = useState<null | 'backup' | 'restore'>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const say = (message: string) => { setError(null); setNotice(message); };
    const fail = (err: unknown) => { setNotice(null); setError(authErrorMessage(err)); };

    const saveName = async () => {
        setSavingName(true);
        try {
            await updateDisplayName(name);
            say('Name saved.');
        } catch (err) {
            fail(err);
        } finally {
            setSavingName(false);
        }
    };

    const backUp = async () => {
        setBusy('backup');
        try {
            const filename = await downloadBackup();
            say(`Saved ${filename}.`);
        } catch (err) {
            fail(err);
        } finally {
            setBusy(null);
        }
    };

    const restore = async (file: File) => {
        /* A restore replaces what is on the canvas, so it asks first. The
           browser's own confirm is deliberate here: this is the one action on
           the page that can destroy work, and it should not be possible to
           style it into something that looks routine. */
        const ok = window.confirm(
            `Restore “${file.name}”?\n\nThis replaces the ${nodeCount} card${nodeCount === 1 ? '' : 's'} currently on your canvas. Save a backup first if you want to keep them.`,
        );
        if (!ok) return;

        setBusy('restore');
        try {
            const result = await restoreBackup(file);
            say(`Restored ${result.nodes} card${result.nodes === 1 ? '' : 's'}${result.files ? ` and ${result.files} file${result.files === 1 ? '' : 's'}` : ''}.`);
        } catch (err) {
            fail(err);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <button type="button" className={styles.back} onClick={() => setView(auth.isAuthenticated ? 'home' : 'canvas')}>
                    <ArrowLeft size={14} />
                    Back
                </button>
            </header>

            <main className={styles.main}>
                <h1 className={styles.title}>{auth.isAuthenticated ? 'Your account' : 'Your workspace'}</h1>

                {error && <p className={styles.error} role="alert"><AlertCircle size={15} /><span>{error}</span></p>}
                {notice && <p className={styles.notice} role="status"><Check size={15} /><span>{notice}</span></p>}

                {auth.isAuthenticated ? (
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Signed in</h2>
                        <p className={styles.sectionText}>{auth.email}</p>

                        <label className={styles.field}>
                            <span>What we call you</span>
                            <span data-input-shell="" className={styles.inputWrap}>
                                <User size={14} />
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your name"
                                    disabled={savingName}
                                />
                            </span>
                        </label>
                        <div className={styles.actions}>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void saveName()}
                                loading={savingName}
                                disabled={savingName || name.trim() === (auth.displayName ?? '')}
                            >
                                Save name
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void signOut().then(() => setView('marketing'))}
                                leadingIcon={<LogOut size={14} />}
                            >
                                Sign out
                            </Button>
                        </div>
                    </section>
                ) : (
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Not signed in</h2>
                        <p className={styles.sectionText}>
                            You are working as a guest. Your canvas is saved in this browser.
                        </p>
                        <div className={styles.actions}>
                            <Button variant="primary" size="sm" onClick={() => setView('login')}>Sign in</Button>
                        </div>
                    </section>
                )}

                <FolderSettings />
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Your work</h2>
                    <p className={styles.sectionText}>
                        Saved work stays in this browser. Unsaved changes are not part of its recovery copy.
                        Connect a folder above to save them automatically on your computer.
                        Keep a backup on another device to protect against losing this computer.
                        {' '}This browser workspace is shared across its tabs and accounts. Signing in or out does not separate it or create a cloud backup.
                    </p>
                    <div className={styles.actions}>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => void backUp()}
                            loading={busy === 'backup'}
                            disabled={busy !== null}
                            leadingIcon={<Download size={14} />}
                        >
                            Save a backup file
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => fileRef.current?.click()}
                            loading={busy === 'restore'}
                            disabled={busy !== null}
                            leadingIcon={<Upload size={14} />}
                        >
                            Restore from a backup
                        </Button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/json,.json"
                            className={styles.fileInput}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) void restore(file);
                            }}
                        />
                    </div>
                    <p className={styles.footnote}>
                        The backup holds every card, every connection and every file you uploaded, in one
                        file you keep.
                    </p>
                </section>

                {isSupabaseConfigured && (
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>When something breaks</h2>
                        <p className={styles.sectionText}>
                            If the app crashes it sends us the error and which page you were on —
                            never what you wrote, and never the contents of a card. It is how a
                            beta finds the faults nobody gets round to reporting.
                        </p>
                    </section>
                )}

                {auth.isAuthenticated && (
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Delete your account</h2>
                        <p className={styles.sectionText}>
                            Accounts are deleted by hand during the beta — email us and it is done within a
                            day. Your cards are not affected: they are on this device, and deleting the
                            account does not touch them.
                        </p>
                        <div className={styles.actions}>
                            <Button
                                variant="ghost"
                                size="sm"
                                leadingIcon={<Trash2 size={14} />}
                                onClick={() => { window.location.href = 'mailto:hello@chnkit.com?subject=Delete%20my%20Chnk%20it%20account'; }}
                            >
                                Request deletion
                            </Button>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
