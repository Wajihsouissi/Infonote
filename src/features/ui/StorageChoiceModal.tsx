/**
 * StorageChoiceModal — first-device storage decision.
 *
 * Shown once on first app launch, with NO pre-selected option. Local saving is
 * always enabled; the choice only decides whether this device also syncs.
 *
 *   local — this device only (IndexedDB always; folder optional)
 *   sync  — IndexedDB first, then background cloud sync
 */
import React, { useState } from 'react';
import { HardDrive, Cloud, Check } from '../../components/icons';
import styles from './StorageChoiceModal.module.css';
import { useStore } from '../../store/useStore';
import {
    readStorageMode,
    writeStorageMode,
    type StorageMode,
} from '../../services/storage/storagePreference';

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
        body: 'Saves automatically in this browser and keeps working offline. A folder backup remains optional.',
    },
    {
        mode: 'sync',
        icon: <Cloud size={20} />,
        title: 'This device + cloud',
        body: 'Saves on this device first, then syncs quietly so your workspace follows you across devices.',
    },
];

/**
 * Views where this question has a meaning. It used to render over every route,
 * so someone reading the marketing page was stopped by a modal asking how their
 * workspace should save before they had seen a workspace — and the canvas, when
 * it was the route underneath, painted fully behind the backdrop and swallowed
 * every click, looking ready while nothing responded.
 */
const STORAGE_RELEVANT_VIEWS = new Set(['canvas', 'landing']);

export const StorageChoiceModal: React.FC = () => {
    const userId = useStore((s) => s.auth.userId);
    const isAuthLoading = useStore((s) => s.auth.isAuthLoading);
    const showWelcomeModal = useStore((s) => s.showWelcomeModal);
    const currentView = useStore((s) => s.currentView);
    const setCurrentView = useStore((s) => s.setCurrentView);
    const [chosen, setChosen] = useState<StorageMode | null>(null);
    const [done, setDone] = useState(false);

    if (done || isAuthLoading || showWelcomeModal) return null;
    if (!STORAGE_RELEVANT_VIEWS.has(currentView)) return null;
    if (readStorageMode(userId)) return null;

    const confirm = (mode: StorageMode) => {
        setChosen(mode);
        // Never let a persistence failure strand the user behind this dialog:
        // the choice is recorded in memory regardless, and the modal closes on
        // its own state either way.
        try {
            writeStorageMode(mode);
            if (mode === 'sync' && !useStore.getState().auth.isAuthenticated) {
                // Remember the choice now; after authentication the root
                // coordinator resumes it without asking a second time.
                setCurrentView('login');
            }
        } catch (error) {
            console.warn('[StorageChoice] Could not persist the storage choice', error);
        }
        // Brief confirmation beat, then unmount deterministically.
        window.setTimeout(() => setDone(true), 450);
    };

    return (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="How do you want to save?">
            <div className={styles.card}>
                <h2 className={styles.title}>How do you want to save?</h2>
                <p className={styles.subtitle}>
                    Your work always saves locally first. Choose whether this device should also sync to the cloud.
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
