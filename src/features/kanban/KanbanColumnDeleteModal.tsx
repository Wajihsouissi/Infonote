/**
 * Confirmation for deleting a board column.
 *
 * Worth a modal rather than an undo toast because the blast radius is not
 * obvious from the button: the column is one click to recreate, but the cards
 * standing in it are real notes that live on the canvas. So the dialog leads
 * with what happens to *them* — they are never deleted, only unfiled — and says
 * how many there are, which is the number that decides whether this is a
 * harmless tidy-up or something the user wants to think about.
 */

import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import styles from './KanbanColumnDeleteModal.module.css';

export interface KanbanColumnDeleteModalProps {
    columnLabel: string;
    /** Cards standing in the column. They are unfiled, never deleted. */
    cardCount: number;
    /** Where those cards land — the board's catch-all lane. */
    unsortedLabel: string;
    onCancel: () => void;
    onConfirm: () => void;
}

export const KanbanColumnDeleteModal = ({
    columnLabel, cardCount, unsortedLabel, onCancel, onConfirm,
}: KanbanColumnDeleteModalProps) => {
    // Escape closes. A confirmation you cannot back out of with the key everyone
    // reaches for is a confirmation that will get clicked through.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCancel();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onCancel]);

    return createPortal(
        <div
            className={styles.backdrop}
            role="dialog"
            aria-modal="true"
            aria-label={`Delete column ${columnLabel}`}
            onClick={onCancel}
            /* The board lives inside the canvas, which reads pointer and key
               events globally; without this the click that dismisses the dialog
               also lands on whatever is behind it. */
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className={styles.card} onClick={(e) => e.stopPropagation()}>
                <div className={styles.iconWrapper}><Trash2 size={22} /></div>

                <h2 className={styles.title}>Delete “{columnLabel}”?</h2>

                <p className={styles.body}>
                    {cardCount === 0
                        ? 'The column is empty, so nothing moves.'
                        : <>
                            {cardCount === 1 ? 'The card' : `All ${cardCount} cards`} in this column
                            {' '}will move to <strong>{unsortedLabel}</strong>. Nothing is deleted —
                            they stay on the canvas and keep everything else about them.
                        </>}
                </p>

                <div className={styles.actions}>
                    <button className={styles.dangerButton} type="button" onClick={onConfirm}>
                        Delete column
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={onCancel}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
