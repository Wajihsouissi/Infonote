import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '../../../components/icons';
import { getGalleryItems } from '../galleryTypes';
import styles from '../GalleryBlock.module.css';
import presentStyles from './BoardPresenter.module.css';
import type { Block } from '../types';

/**
 * The board, full screen, with nothing else on the wall.
 *
 * Boards get shown to people, and the lightbox shows one picture at a time —
 * everything except the thing a moodboard actually is: the arrangement. This
 * shows the composition. Its owner renders a read-only `GalleryBlock` inside
 * rather than a second layout engine, so bento, grid and masonry present
 * exactly as they were arranged and pictures still open into the lightbox. The
 * stored board height is dropped on the way in — a height dragged to fit inside
 * a card is meaningless against a whole screen — and the title moves into the
 * presenter's own bar.
 */
interface BoardPresenterProps {
    block: Block;
    onClose: () => void;
    /** The board itself, rendered read-only by its owner. */
    children: ReactNode;
}

export function BoardPresenter({ block, onClose, children }: BoardPresenterProps) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            /* Capture phase and stopped here: the editor and the canvas both
               listen for Escape, and without this closing the presentation
               would also clear the selection behind it. */
            e.stopPropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        // The page behind must not scroll under a full-screen surface.
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey, true);
            document.body.style.overflow = prev;
        };
    }, [onClose]);

    const count = getGalleryItems(block).length;

    return createPortal(
        <div
            className={presentStyles.present}
            role="dialog"
            aria-modal="true"
            aria-label={block.content || 'Board'}
        >
            <div className={presentStyles.presentBar}>
                <span className={presentStyles.presentTitle}>{block.content || 'Untitled board'}</span>
                <span className={presentStyles.presentCount}>{count}</span>
                <button
                    ref={closeRef}
                    type="button"
                    className={presentStyles.presentClose}
                    onClick={onClose}
                    aria-label="Close presentation"
                    title="Close (Esc)"
                >
                    <X size={16} />
                </button>
            </div>
            <div className={styles.presentStage}>{children}</div>
        </div>,
        document.body,
    );
}

/**
 * Where `cover` should crop from. Absent means centred, which is the browser's
 * own default, so an untouched picture carries no inline style at all.
 */
