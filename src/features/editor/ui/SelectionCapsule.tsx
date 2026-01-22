import { useState } from 'react';
import { Trash, Copy, X } from 'lucide-react';
import styles from './SelectionCapsule.module.css';

interface SelectionCapsuleProps {
    count: number;
    onClear: () => void;
    onDelete: () => void;
    onCopy?: () => void;
}

export function SelectionCapsule({ count, onClear, onDelete, onCopy }: SelectionCapsuleProps) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className={`${styles.capsule} ${isHovered ? styles.expanded : ''}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className={styles.content}>
                <span className={styles.countText}>
                    {count} Block{count !== 1 ? 's' : ''} Selected
                </span>

                <div className={styles.actions}>
                    <div className={styles.divider} />

                    <button
                        className={styles.actionBtn}
                        onClick={onCopy}
                        title="Copy" // added title
                    >
                        <Copy size={16} />
                    </button>

                    <button
                        className={styles.actionBtn}
                        onClick={onDelete}
                        title="Delete" // added title
                    >
                        <Trash size={16} />
                    </button>
                </div>

                <div className={styles.divider} />

                <button
                    className={styles.closeBtn}
                    onClick={onClear}
                    title="Clear Selection" // added title
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
