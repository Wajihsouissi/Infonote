/**
 * LimitNoticeModal — shown when node creation is blocked by a beta limit
 * (see BETA_SCOPE.md): canvas full (everyone), or the anonymous card /
 * nesting quota. Anonymous limits carry a sign-in CTA; existing content
 * is never deleted or locked.
 */
import React from 'react';
import { Layers, UserPlus, ArrowRight } from '../../components/icons';
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

    if (!notice) return null;

    const close = () => setLimitNotice(null);
    const signIn = () => {
        setLimitNotice(null);
        setCurrentView('login');
    };

    const copyByKind: Record<typeof notice.kind, NoticeCopy> = {
        'canvas-full': {
            icon: <Layers size={24} />,
            title: 'This canvas is full',
            body: `A canvas holds up to ${notice.limit} nodes during the beta. Open a card and nest a canvas inside it, or continue on another canvas — nothing you made is lost.`,
            showSignIn: false,
        },
        'anon-card-limit': {
            icon: <UserPlus size={24} />,
            title: `You've reached ${notice.limit} cards`,
            body: `That's the free limit without an account. Sign in to create unlimited cards — and to keep your work safe beyond this browser.`,
            showSignIn: true,
        },
        'anon-depth-limit': {
            icon: <UserPlus size={24} />,
            title: 'Deeper nesting needs an account',
            body: `Canvases nest ${notice.limit} levels deep without an account. Sign in to nest as deep as you like.`,
            showSignIn: true,
        },
    };

    const copy = copyByKind[notice.kind];

    return (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={copy.title} onClick={close}>
            <div className={styles.card} onClick={(e) => e.stopPropagation()}>
                <div className={styles.iconWrapper}>{copy.icon}</div>
                <h2 className={styles.title}>{copy.title}</h2>
                <p className={styles.body}>{copy.body}</p>
                <div className={styles.actions}>
                    {copy.showSignIn ? (
                        <>
                            <button className={styles.primaryButton} type="button" onClick={signIn}>
                                Sign in
                                <ArrowRight size={15} />
                            </button>
                            <button className={styles.secondaryButton} type="button" onClick={close}>
                                Not now
                            </button>
                        </>
                    ) : (
                        <button className={styles.primaryButton} type="button" onClick={close}>
                            Got it
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
