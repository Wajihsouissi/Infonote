import { useState } from 'react';
import { Image as ImageIcon, Edit3, Trash2 } from '../../../../shared/icons';
import { AssetImage } from '../../../../services/assets';
import { CoverPicker } from './CoverPicker';
import styles from './CardCover.module.css';

interface CardCoverProps {
    cover?: string;
    /** '' removes the cover. */
    onChange: (cover: string) => void;
    readOnly?: boolean;
    /** No rounded top when the card fills a peek or the full screen. */
    flatCorners?: boolean;
    variant?: 'banner' | 'thumbnail';
}

/**
 * A card's cover picture, and the way to put one there.
 *
 * With no cover the card shows nothing but an "Add cover" button that appears
 * on hover — the picture is the point, and a permanent empty band at the top of
 * every card would cost more space than it earns.
 */
export function CardCover({ cover, onChange, readOnly, flatCorners, variant = 'banner' }: CardCoverProps) {
    const [picking, setPicking] = useState(false);
    const compact = variant === 'thumbnail';

    if (readOnly && !cover) return null;

    return (
        <>
            {cover ? (
                <div className={`${styles.cover} ${compact ? styles.thumbnail : ''} custom-drag-handle`} style={flatCorners && !compact ? { borderRadius: 0 } : undefined}>
                    <AssetImage className={styles.image} src={cover} alt="" loading="lazy" draggable={false} />
                    {!readOnly && (
                        <div className={styles.actions} onMouseDown={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                className={styles.action}
                                onClick={(e) => { e.stopPropagation(); setPicking(true); }}
                                title="Change cover"
                                aria-label="Change cover"
                            >
                                <Edit3 size={14} />
                            </button>
                            <button
                                type="button"
                                className={styles.action}
                                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                                title="Remove cover"
                                aria-label="Remove cover"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className={compact ? styles.compactAdd : styles.addRow}>
                    <button
                        type="button"
                        className={`${styles.addBtn} nodrag`}
                        title="Add cover"
                        aria-label="Add cover"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setPicking(true); }}
                    >
                        <ImageIcon size={14} />
                        {!compact && 'Add cover'}
                    </button>
                </div>
            )}

            {picking && (
                <CoverPicker
                    currentCover={cover}
                    onSelect={onChange}
                    onClose={() => setPicking(false)}
                />
            )}
        </>
    );
}
