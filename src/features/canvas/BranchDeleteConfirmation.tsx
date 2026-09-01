import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Trash2, Undo2, X } from '../../components/icons';
import { useStore } from '../../store/useStore';
import styles from './BranchDeleteConfirmation.module.css';

/**
 * Deleting a card can mean deleting a whole knowledge branch. Keep that
 * consequence inside the product's vocabulary and make the safe choice the
 * first, focused action instead of relying on an opaque browser confirm.
 */
export function BranchDeleteConfirmation() {
    const pending = useStore((state) => state.pendingNodeDeletion);
    const lastDeletion = useStore((state) => state.lastNodeDeletion);
    const cancel = useStore((state) => state.cancelNodeDeletion);
    const confirm = useStore((state) => state.confirmNodeDeletion);
    const undo = useStore((state) => state.undoLastNodeDeletion);
    const dismiss = useStore((state) => state.dismissLastNodeDeletion);
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        if (!pending) return;
        const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const frame = requestAnimationFrame(() => cancelRef.current?.focus());

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ));
            const index = focusable.indexOf(document.activeElement as HTMLElement);
            if (focusable.length === 0) return;
            if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === focusable.length - 1)) {
                event.preventDefault();
                focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', onKeyDown);
            if (returnFocus?.isConnected) returnFocus.focus();
        };
    }, [pending, cancel]);

    useEffect(() => {
        if (!lastDeletion) return;
        const timer = window.setTimeout(dismiss, 10_000);
        return () => window.clearTimeout(timer);
    }, [lastDeletion, dismiss]);

    return (
        <>
            {pending && (
                <div className={styles.backdrop} onMouseDown={cancel}>
                    <div
                        ref={dialogRef}
                        className={styles.dialog}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={descriptionId}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className={styles.icon}><AlertTriangle size={23} aria-hidden="true" /></div>
                        <h2 id={titleId}>Delete this knowledge branch?</h2>
                        <p id={descriptionId}>
                            This removes {pending.selectedCount} selected card{pending.selectedCount === 1 ? '' : 's'}
                            {pending.nestedCount > 0 ? ` and ${pending.nestedCount} nested card${pending.nestedCount === 1 ? '' : 's'}` : ''}.
                            Connections touching them will be removed too.
                        </p>
                        <p className={styles.reassurance}>You can undo this immediately after deleting.</p>
                        <div className={styles.actions}>
                            <button ref={cancelRef} type="button" className={styles.cancel} onClick={cancel}>
                                Keep cards
                            </button>
                            <button type="button" className={styles.delete} onClick={confirm}>
                                <Trash2 size={15} aria-hidden="true" />
                                Delete {pending.totalCount} card{pending.totalCount === 1 ? '' : 's'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {lastDeletion && !pending && (
                <div className={styles.undoToast} role="status" aria-live="polite">
                    <span>{lastDeletion.message}</span>
                    <button type="button" onClick={undo}>
                        <Undo2 size={15} aria-hidden="true" />
                        Undo
                    </button>
                    <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Dismiss deletion notice">
                        <X size={15} aria-hidden="true" />
                    </button>
                </div>
            )}
        </>
    );
}
