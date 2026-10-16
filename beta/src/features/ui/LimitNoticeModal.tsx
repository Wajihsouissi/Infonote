/**
 * LimitNoticeModal — shown when creation is blocked by the guest nesting
 * safeguard or when a file cannot be stored. Existing content is never
 * deleted or locked.
 */
import React, { useEffect, useId, useRef } from 'react';
import { UserPlus, AlertTriangle } from '../../components/icons';
import styles from './LimitNoticeModal.module.css';
import { useStore } from '../../store/useStore';
import type { LimitViolation } from '../../store/nodeLimits';

interface NoticeCopy {
    icon: React.ReactNode;
    title: string;
    body: string;
    /** Only the limits an account lifts offer a way to lift them. */
    offerSignIn?: boolean;
}

/* A switch, not a lookup table: the variants do not share one shape — a
   rejected file carries a reason where the nesting limit carries a number. */
function copyFor(notice: LimitViolation): NoticeCopy {
    switch (notice.kind) {
        case 'anon-depth-limit':
            return {
                icon: <UserPlus size={24} />,
                title: 'Deeper nesting needs an account',
                body: `Canvases nest ${notice.limit} levels deep without an account. Sign in to nest as deep as you like.`,
                offerSignIn: true,
            };
        case 'file-rejected':
            return {
                icon: <AlertTriangle size={24} />,
                title: 'That file could not be added',
                // Already written for the user by services/assets/ingest.
                body: notice.reason,
            };
    }
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const LimitNoticeModal: React.FC = () => {
    const notice = useStore((s) => s.limitNotice);
    const setLimitNotice = useStore((s) => s.setLimitNotice);
    const setView = useStore((s) => s.setView);
    const dialogRef = useRef<HTMLDivElement>(null);
    const primaryActionRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();

    useEffect(() => {
        if (!notice) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const frame = window.requestAnimationFrame(() => primaryActionRef.current?.focus());

        // Escape closes; Tab stays inside the dialog.
        const keepFocusInDialog = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setLimitNotice(null);
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }
            const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
            const isLeavingAtStart = event.shiftKey && currentIndex <= 0;
            const isLeavingAtEnd = !event.shiftKey && currentIndex === focusable.length - 1;
            if (currentIndex === -1 || isLeavingAtStart || isLeavingAtEnd) {
                event.preventDefault();
                focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
            }
        };

        document.addEventListener('keydown', keepFocusInDialog);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener('keydown', keepFocusInDialog);
            if (previouslyFocused?.isConnected) previouslyFocused.focus();
        };
    }, [notice, setLimitNotice]);

    if (!notice) return null;

    const close = () => setLimitNotice(null);
    const copy = copyFor(notice);

    return (
        <div className={styles.backdrop} onMouseDown={close}>
            <div
                ref={dialogRef}
                className={styles.card}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className={styles.iconWrapper}>{copy.icon}</div>
                <h2 id={titleId} className={styles.title}>{copy.title}</h2>
                <p className={styles.body}>{copy.body}</p>
                <div className={styles.actions}>
                    {copy.offerSignIn && (
                        <button
                            ref={primaryActionRef}
                            className={styles.primaryButton}
                            type="button"
                            onClick={() => { close(); setView('login'); }}
                        >
                            Sign in
                        </button>
                    )}
                    <button
                        ref={copy.offerSignIn ? undefined : primaryActionRef}
                        className={copy.offerSignIn ? styles.secondaryButton : styles.primaryButton}
                        type="button"
                        onClick={close}
                    >
                        {copy.offerSignIn ? 'Not now' : 'Got it'}
                    </button>
                </div>
            </div>
        </div>
    );
};
