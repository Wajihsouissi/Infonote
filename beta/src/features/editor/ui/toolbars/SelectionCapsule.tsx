import { Trash, Copy, Scissors, X } from '../../../../shared/icons';
import styles from './SelectionCapsule.module.css';

interface SelectionCapsuleProps {
    count: number;
    onClear: () => void;
    onDelete: () => void;
    onCopy?: () => void;
    onCut?: () => void;
}

export function SelectionCapsule({ count, onClear, onDelete, onCopy, onCut }: SelectionCapsuleProps) {
    return (
        <div
            className={styles.capsule}
            role="toolbar"
            aria-label="Selected blocks"
        >
            <div className={styles.content}>
                <span className={styles.countText}>
                    {count} Block{count !== 1 ? 's' : ''} Selected
                </span>

                <div className={styles.actions}>
                    <div className={styles.divider} />

                    <button
                        type="button"
                        className={`${styles.actionBtn} icon-hover`}
                        onClick={onCopy}
                        title="Copy"
                    >
                        <Copy size={16} />
                    </button>

                    <button
                        type="button"
                        className={`${styles.actionBtn} icon-hover`}
                        onClick={onCut}
                        title="Cut"
                    >
                        <Scissors size={16} />
                    </button>

                    <button
                        type="button"
                        className={`${styles.actionBtn} icon-hover`}
                        onClick={onDelete}
                        title="Delete" // added title
                    >
                        <Trash size={16} />
                    </button>
                </div>

                <div className={styles.divider} />

                <button
                    type="button"
                    className={`${styles.closeBtn} icon-hover`}
                    onClick={onClear}
                    title="Clear Selection" // added title
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
