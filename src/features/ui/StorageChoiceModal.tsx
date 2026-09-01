/**
 * StorageChoiceModal — first-login storage decision (see BETA_SCOPE.md).
 *
 * Shown once per user per device after signing in, with NO pre-selected
 * option: the user must actively pick how their work is saved.
 *
 *   local  — this device only (IndexedDB always; folder optional)
 *   cloud  — auto-sync to the workspace
 *   both   — local-first: device write first, cloud syncs in background
 *
 * The choice is stored per user (chnk-it-storage-mode-<userId>) and drives
 * the per-workspace autosync flag that StorageControls reads. Changeable
 * later from the storage menu. Kept as a clean enum so cloud can be gated
 * behind a paid plan post-beta.
 */
import React, { useEffect, useState } from 'react';
import { HardDrive, Cloud, RefreshCw, Check } from '../../components/icons';
import styles from './StorageChoiceModal.module.css';
import { useStore } from '../../store/useStore';

export type StorageMode = 'local' | 'cloud' | 'both';

export const storageModeKey = (userId: string) => `chnk-it-storage-mode-${userId}`;

const OPTIONS: Array<{
    mode: StorageMode;
    icon: React.ReactNode;
    title: string;
    body: string;
}> = [
    {
        mode: 'local',
        icon: <HardDrive size={20} />,
        title: 'Local',
        body: 'Saves on this device. You can also connect a folder from the storage menu (Chromium browsers).',
    },
    {
        mode: 'cloud',
        icon: <Cloud size={20} />,
        title: 'Cloud',
        body: 'Auto-syncs to your workspace, so your notes follow you across devices.',
    },
    {
        mode: 'both',
        icon: <RefreshCw size={20} />,
        title: 'Local + cloud sync',
        body: 'Local-first: saves on this device instantly, then syncs to the cloud in the background.',
    },
];

export const StorageChoiceModal: React.FC = () => {
    const userId = useStore((s) => s.auth.userId);
    const isAuthLoading = useStore((s) => s.auth.isAuthLoading);
    const showWelcomeModal = useStore((s) => s.showWelcomeModal);
    const [chosen, setChosen] = useState<StorageMode | null>(null);
    const [done, setDone] = useState(false);

    // A different account signing in during the same session gets a fresh ask.
    useEffect(() => {
        setChosen(null);
        setDone(false);
    }, [userId]);

    if (done || !userId || isAuthLoading || showWelcomeModal) return null;
    if (localStorage.getItem(storageModeKey(userId))) return null;

    const confirm = (mode: StorageMode) => {
        // Read auth fresh — never trust a render-time closure for the write.
        const state = useStore.getState();
        const uid = state.auth.userId;
        if (!uid) return;
        setChosen(mode);
        localStorage.setItem(storageModeKey(uid), mode);
        // Cloud participation is what the autosync flag controls: on for
        // cloud/both, off for local-only.
        const autosyncKey = `chnk-it-cloud-autosync-${state.auth.activeWorkspaceId || 'default'}`;
        localStorage.setItem(autosyncKey, mode === 'local' ? 'false' : 'true');
        window.dispatchEvent(new CustomEvent('chnk-it-storage-mode-changed'));
        // Brief confirmation beat, then unmount deterministically.
        window.setTimeout(() => setDone(true), 450);
    };

    return (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="How do you want to save?">
            <div className={styles.card}>
                <h2 className={styles.title}>How do you want to save?</h2>
                <p className={styles.subtitle}>
                    Pick one to continue — you can change it anytime from the storage menu.
                </p>
                <div className={styles.options}>
                    {OPTIONS.map((opt) => (
                        <button
                            key={opt.mode}
                            type="button"
                            className={`${styles.option} ${chosen === opt.mode ? styles.optionChosen : ''}`}
                            onClick={() => !chosen && confirm(opt.mode)}
                            disabled={!!chosen && chosen !== opt.mode}
                        >
                            <div className={styles.optionIcon}>
                                {chosen === opt.mode ? <Check size={20} /> : opt.icon}
                            </div>
                            <div className={styles.optionText}>
                                <div className={styles.optionTitle}>{opt.title}</div>
                                <div className={styles.optionBody}>{opt.body}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
