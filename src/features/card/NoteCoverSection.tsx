import { Image as ImageIcon, EyeOff, X } from 'lucide-react';
import styles from './NoteCard.module.css';

interface NoteCoverSectionProps {
    coverImage?: string;
    showMetadata: boolean;
    setShowMetadata: (show: boolean) => void;
    onCoverClick: () => void;
    onClose?: () => void;
}

/**
 * Cover image section.
 * Displays cover image and view controls.
 */
export function NoteCoverSection({
    coverImage,
    showMetadata,
    setShowMetadata,
    onCoverClick,
    onClose,
}: NoteCoverSectionProps) {
    return (
        <div className={`${styles.coverImage} custom-drag-handle`} onClick={onCoverClick}>
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

            {/* Controls Overlay (Top Right) */}
            <div className={styles.coverMetadataOverlay}>
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
