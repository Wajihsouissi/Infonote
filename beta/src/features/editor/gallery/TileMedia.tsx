import { FileText, ImageOff, Play } from '../../../components/icons';
import { AssetImage, AssetVideo } from '../../../services/assets';
import { displaySrc } from '../mediaThumbnail';
import styles from '../GalleryBlock.module.css';
import type { Block } from '../types';
import { focalStyle, type Focal } from './focalPoint';

/** The picture, video or file glyph a tile paints. */
export const TileMedia = ({ item, onRatio, focal }: {
    item: Block;
    onRatio?: (id: string, ratio: number) => void;
    /** Passed in rather than read off the item so a focal point being dragged
     *  can preview live without a store write per pointer move. */
    focal?: Focal;
}) => {
    if (!item.content) {
        return <div className={styles.tileFallback}><ImageOff size={18} /></div>;
    }
    if (item.type === 'video') {
        return (
            <>
                <AssetVideo
                    className={styles.tileMedia}
                    src={item.content}
                    preload="metadata"
                    muted
                    playsInline
                    style={focalStyle(focal)}
                    onLoadedMetadata={(e) => onRatio?.(
                        item.id, e.currentTarget.videoWidth / e.currentTarget.videoHeight,
                    )}
                />
                <span className={styles.playBadge}><Play size={12} fill="currentColor" /></span>
            </>
        );
    }
    if (item.type === 'image') {
        return (
            <AssetImage
                className={styles.tileMedia}
                /* The thumbnail when there is one. The original is still what
                   the lightbox opens — this is only what the tile paints. */
                src={displaySrc(item.content, item.metadata?.thumb)}
                alt={item.metadata?.name || ''}
                loading="lazy"
                draggable={false}
                style={focalStyle(focal)}
                onLoad={(e) => onRatio?.(
                    item.id, e.currentTarget.naturalWidth / e.currentTarget.naturalHeight,
                )}
            />
        );
    }
    return (
        <div className={styles.tileFile}>
            <FileText size={20} />
            <span>{item.metadata?.name || 'File'}</span>
        </div>
    );
};
