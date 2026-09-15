/**
 * LimitNoticeModal — shown when creation is blocked by the anonymous nesting
 * safeguard or when a file cannot be stored. Existing content is never
 * deleted or locked.
 */
import React, { useEffect, useId, useRef } from 'react';
import { UserPlus, ArrowRight, AlertTriangle } from '../../components/icons';
import styles from './LimitNoticeModal.module.css';
import { useStore } from '../../store/useStore';

interface NoticeCopy {
    icon: React.ReactNode;
    title: string;
    body: string;
    showSignIn: boolean;
}

export const LimitNoticeModal: React.FC = () => {
    const notice = useStore((s) => s.limitNotice);
    const setLimitNotice = useStore((s) => s.setLimitNotice);
    const setCurrentView = useStore((s) => s.setCurrentView);
    const dialogRef = useRef<HTMLDivElement>(null);
    const primaryActionRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();

    useEffect(() => {
        if (!notice) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const focusPrimaryAction = () => primaryActionRef.current?.focus();
        const frame = window.requestAnimationFrame(focusPrimaryAction);

        const keepFocusInDialog = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setLimitNotice(null);
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ));
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
    const signIn = () => {
        setLimitNotice(null);
        setCurrentView('login');
    };

    /* A switch, not a lookup table: the variants no longer share one shape —
       a rejected file carries a reason where the quotas carry a number — and
       an eagerly-built record would have to evaluate every branch against the
       wrong one. */
    const copyFor = (): NoticeCopy => {
        switch (notice.kind) {
            case 'anon-depth-limit':
                return {
                    icon: <UserPlus size={24} />,
                    title: 'Deeper nesting needs an account',
                    body: `Canvases nest ${notice.limit} levels deep without an account. Sign in to nest as deep as you like.`,
                    showSignIn: true,
                };
            case 'file-rejected':
                return {
                    icon: <AlertTriangle size={24} />,
                    title: 'That file could not be added',
                    // Already written for the user by services/assets/ingest.
                    body: notice.reason,
                    showSignIn: false,
                };
        }
    };

    const copy = copyFor();

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
                    {copy.showSignIn ? (
                        <>
                            <button ref={primaryActionRef} className={styles.primaryButton} type="button" onClick={signIn}>
                                Sign in
                                <ArrowRight size={15} />
                            </button>
                            <button className={styles.secondaryButton} type="button" onClick={close}>
                                Not now
                            </button>
                        </>
                    ) : (
                        <button ref={primaryActionRef} className={styles.primaryButton} type="button" onClick={close}>
                            Got it
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
