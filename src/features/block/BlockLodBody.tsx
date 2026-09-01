import { memo } from 'react';
import type { Block } from '../editor/types';
import { NoteBodyPreview } from '../card/NoteBodyPreview';
import styles from './BlockLodBody.module.css';

interface BlockLodBodyProps {
    /** Blocks to represent. */
    blocks: Block[];
    /** Match the editor mode and content inset of the hosting canvas node. */
    surface?: 'canvas' | 'single' | 'fused';
}

/**
 * Cheap stand-in for a block or fused node below full detail.
 *
 * The full cost of one of these nodes is the block editor: per-instance
 * `selectionchange` listener, dozens of effects, and a layout effect that
 * writes the node's measured style back into the store. At the default
 * zoomed-out "first LOD" a whole workspace is visible at once, so culling has
 * nothing to remove and the *per-card* cost decides whether navigation stays
 * at 60fps. Inactive nodes use a small semantic preview instead of a raster
 * capture, so navigation never triggers background screenshot work.
 */
export const BlockLodBody = memo(function BlockLodBody({
    blocks,
    surface = 'canvas',
}: BlockLodBodyProps) {
    return (
        <div className={`${styles.previewWrap} ${styles[surface]}`} data-block-lod-surface={surface}>
            <NoteBodyPreview
                content={blocks}
                scaleMode={surface === 'fused' ? 'card' : 'canvas'}
                nodeSurface={surface === 'single' ? 'single' : undefined}
            />
        </div>
    );
});
