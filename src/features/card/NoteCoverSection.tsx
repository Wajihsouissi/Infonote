import { Image as ImageIcon, EyeOff, X } from 'lucide-react';
import styles from './NoteCard.module.css';

interface NoteCoverSectionProps {
    coverImage?: string;
    status?: string;
    priority?: string;
    tags?: string[];
    showMetadata: boolean;
    setShowMetadata: (show: boolean) => void;
    onCoverClick: () => void;
    onClose?: () => void;
}

/**
 * Cover image section with metadata chips overlay.
 * Displays cover image, status/priority/tags chips, and view controls.
 */
export function NoteCoverSection({
    coverImage,
    status,
    priority,
    tags,
    showMetadata,
    setShowMetadata,
    onCoverClick,
    onClose,
}: NoteCoverSectionProps) {
    return (
        <div className={styles.coverImage} onClick={onCoverClick}>
            {coverImage ? (
                <img src={coverImage} alt="Cover" loading="lazy" />
            ) : (
                <div className={styles.coverPlaceholder}>
                    <div className={styles.coverEmptyState}>
                        <ImageIcon size={24} />
                        <span>Add Cover</span>
                    </div>
                </div>
            )}

            {/* Cover Metadata Chips (Top Right) */}
            <div className={styles.coverMetadataOverlay}>
                {status && (
                    <span className={styles.metaChip} onClick={(e) => e.stopPropagation()}>
                        {status}
                    </span>
                )}
                {priority && (
                    <span className={`${styles.metaChip} ${styles.blue}`} onClick={(e) => e.stopPropagation()}>
                        {priority}
                    </span>
                )}
                {tags && tags.map(tag => (
                    <span key={tag} className={`${styles.metaChip} ${styles.purple}`} onClick={(e) => e.stopPropagation()}>
                        {tag}
                    </span>
                ))}

                {/* Top Controls */}
                <div className={styles.controlsGroup} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    <button
                        className={`${styles.controlBtn} ${showMetadata ? styles.active : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowMetadata(!showMetadata);
                        }}
                        title="Hide Metadata"
                    >
                        <EyeOff size={20} />
                    </button>
                    {onClose && (
                        <button
                            className={styles.controlBtn}
                            onClick={onClose}
                            title="Close"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
