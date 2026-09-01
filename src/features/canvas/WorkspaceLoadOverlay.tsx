/**
 * WorkspaceLoadOverlay — what the user sees while the canvas comes down from
 * the cloud.
 *
 * Two surfaces, deliberately different in weight:
 *
 *   <WorkspaceLoadOverlay/> blocks the shell, and is reserved for a genuine
 *   first open where there is nothing on the canvas to interact with anyway.
 *   Its bar is determinate and driven by `CloudLoadProgress`, so it advances
 *   when the request advances rather than on a timer.
 *
 *   <WorkspaceSyncPill/> is the non-blocking counterpart for every background
 *   refresh — a remount, a workspace revisit, a collaborator's edit arriving
 *   over realtime. The canvas stays fully usable underneath it.
 *
 * Both are gated by `useDelayedFlag` so a load that resolves quickly never
 * flashes an indicator on screen.
 */
import React from 'react';
import type { CloudLoadProgress, CloudLoadStage } from '../../services/cloudSync';
import styles from './WorkspaceLoadOverlay.module.css';

const STAGE_LABEL: Record<CloudLoadStage, string> = {
    authorizing: 'Verifying your session',
    fetching: 'Fetching your notes and connections',
    building: 'Rebuilding your canvas',
    ready: 'Ready',
};

/** Checkpoint each step is considered complete at. */
const STEPS: { id: CloudLoadStage; label: string; clearedAt: number }[] = [
    { id: 'authorizing', label: 'Session verified', clearedAt: 0.22 },
    { id: 'fetching', label: 'Notes downloaded', clearedAt: 0.86 },
    { id: 'building', label: 'Canvas rebuilt', clearedAt: 1 },
];

function formatCounts(progress: CloudLoadProgress): string | null {
    if (progress.nodeCount === undefined) return null;
    const notes = `${progress.nodeCount.toLocaleString()} ${progress.nodeCount === 1 ? 'note' : 'notes'}`;
    const links = `${(progress.edgeCount ?? 0).toLocaleString()} ${progress.edgeCount === 1 ? 'connection' : 'connections'}`;
    return `${notes} · ${links}`;
}

export const WorkspaceLoadOverlay: React.FC<{ progress: CloudLoadProgress }> = ({ progress }) => {
    const percent = Math.round(progress.value * 100);
    const counts = formatCounts(progress);

    return (
        <div
            className={styles.overlay}
            role="status"
            aria-live="polite"
            aria-label="Loading your workspace"
        >
            <div className={styles.card}>
                <h2 className={styles.heading}>Loading your workspace</h2>
                <p className={styles.stage}>{STAGE_LABEL[progress.stage]}</p>

                <div className={styles.meter}>
                    <div
                        className={styles.track}
                        role="progressbar"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Workspace load progress"
                    >
                        <div className={styles.fill} style={{ width: `${percent}%` }} />
                    </div>
                    <span className={styles.percent}>{percent}%</span>
                </div>

                <ul className={styles.steps}>
                    {STEPS.map((step) => {
                        const done = progress.value >= step.clearedAt;
                        const active = !done && progress.stage === step.id;
                        return (
                            <li
                                key={step.id}
                                className={`${styles.step} ${done ? styles.stepDone : ''} ${active ? styles.stepActive : ''}`}
                            >
                                <span className={styles.stepMark} aria-hidden="true" />
                                <span>{step.label}</span>
                            </li>
                        );
                    })}
                </ul>

                {counts && <p className={styles.counts}>{counts}</p>}
            </div>
        </div>
    );
};

export const WorkspaceSyncPill: React.FC<{ label?: string }> = ({ label = 'Syncing your workspace' }) => (
    <div className={styles.pill} role="status" aria-live="polite">
        <span className={styles.pillDot} aria-hidden="true" />
        <span>{label}</span>
    </div>
);
