import { memo, type CSSProperties } from 'react';
import type { Block } from '../editor/types';
import { Image as ImageIcon, Video, File, Link2 } from '../../components/icons';
import styles from './NoteBodyPreview.module.css';

/**
 * Wireframe stand-in for a card's block editor, shown at middle zoom.
 *
 * It draws the *shape* of what the user actually wrote — heading weights, list
 * markers, the grid of a table, the bounds of an image — rather than text,
 * which is an illegible smudge at this size anyway. Cards stay recognisable by
 * their layout, and the cost per block is two or three plain divs instead of a
 * contenteditable (and, for tables, a textarea per cell).
 */

/** Rough line count for a block's text, so long paragraphs look long. */
const linesFor = (content: string, perLine: number): number => {
    const len = (content || '').replace(/[*_`~]/g, '').trim().length;
    if (len === 0) return 1;
    return Math.min(4, Math.max(1, Math.ceil(len / perLine)));
};

/** Last line of a paragraph is short, the way real text wraps. */
const lineWidth = (i: number, total: number) => (i === total - 1 && total > 1 ? '62%' : '100%');

/** Shape drawn for a table that has no rows yet, so it still reads as a table. */
const DEFAULT_TABLE_ROWS = [['', '', ''], ['', '', ''], ['', '', ''], ['', '', '']];

const Lines = ({ count, className }: { count: number; className?: string }) => (
    <>
        {Array.from({ length: count }, (_, i) => (
            <div
                key={i}
                className={`${styles.bar} ${className || ''}`}
                style={{ width: lineWidth(i, count) }}
            />
        ))}
    </>
);

const BlockShape = ({ block }: { block: Block }) => {
    const indent = block.indent ? styles.indent : '';

    switch (block.type) {
        case 'heading1':
            return <div className={`${styles.bar} ${styles.h1}`} style={{ width: '72%' }} />;
        case 'heading2':
            return <div className={`${styles.bar} ${styles.h2}`} style={{ width: '58%' }} />;
        case 'heading3':
            return <div className={`${styles.bar} ${styles.h3}`} style={{ width: '46%' }} />;

        case 'bullet':
        case 'numbered':
        case 'toggle':
            return (
                <div className={`${styles.row} ${indent}`}>
                    <div className={styles.marker} />
                    <div className={styles.bar} style={{ width: `${Math.min(94, 46 + (block.content?.length || 0) / 2)}%` }} />
                </div>
            );

        case 'todo':
            return (
                <div className={`${styles.row} ${indent}`}>
                    <div className={styles.markerSquare} />
                    <div className={styles.bar} style={{ width: `${Math.min(92, 44 + (block.content?.length || 0) / 2)}%` }} />
                </div>
            );

        case 'callout':
            return (
                <div className={styles.callout}>
                    <div className={styles.calloutIcon} />
                    <div className={styles.paragraph} style={{ flex: 1 }}>
                        <Lines count={linesFor(block.content, 62)} />
                    </div>
                </div>
            );

        case 'quote':
            return (
                <div className={styles.quote}>
                    <div className={styles.paragraph}>
                        <Lines count={linesFor(block.content, 70)} />
                    </div>
                </div>
            );

        case 'code': {
            const lines = Math.min(6, Math.max(2, (block.content || '').split('\n').length));
            return (
                <div className={styles.code}>
                    {Array.from({ length: lines }, (_, i) => (
                        <div key={i} className={styles.codeLine} style={{ width: `${88 - (i % 3) * 18}%` }} />
                    ))}
                </div>
            );
        }

        case 'table': {
            const rows = (block.metadata?.rows && block.metadata.rows.length > 0) ? block.metadata.rows : DEFAULT_TABLE_ROWS;
            /* Capped like every other shape here. This is the cheap stand-in
               drawn for cards that are *not* worth a real editor, so a wide or
               long table must not cost more in wireframe than it would as one:
               uncapped, a 200x30 table emits 6000 divs per card. */
            const cols = Math.min(5, rows[0]?.length || 3);
            const shown = Math.min(5, Math.max(4, rows.length));
            return (
                <div className={styles.tableContainer}>
                    <div className={styles.table}>
                        {Array.from({ length: shown }, (_, r) => (
                            <div key={r} className={`${styles.tableRow} ${r === 0 ? styles.tableHead : ''}`}>
                                {Array.from({ length: cols }, (_, c) => (
                                    <div key={c} className={styles.tableCell} />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        case 'image':
            return (
                <div className={styles.media}>
                    <ImageIcon className={styles.mediaIcon} />
                </div>
            );
        case 'video':
            return (
                <div className={styles.media}>
                    <Video className={styles.mediaIcon} />
                </div>
            );
        case 'media':
        case 'file':
            return (
                <div className={styles.media}>
                    <File className={styles.mediaIcon} />
                </div>
            );

        case 'gallery': {
            /* The wireframe of a board is the board: at this size the tiles are
               the only thing legible, and a card holding a moodboard has to be
               recognisable as one from across the canvas. Capped, like every
               other shape here — a 200-image board must not cost 200 divs. */
            const tiles = Array.isArray(block.metadata?.items) ? block.metadata.items : [];
            const shown = Math.min(6, Math.max(1, tiles.length));
            return (
                <div className={styles.gallery}>
                    {Array.from({ length: shown }, (_, i) => (
                        <div
                            key={tiles[i]?.id ?? i}
                            className={styles.galleryTile}
                            style={i === 0 && shown > 2 ? { gridColumn: 'span 2', gridRow: 'span 2' } : undefined}
                        />
                    ))}
                </div>
            );
        }

        case 'divider':
            return <div className={styles.divider} />;

        case 'color':
            return <div className={styles.swatch} style={{ background: block.content || 'var(--hover-wash)' }} />;

        case 'columns': {
            const cols = block.metadata?.columns || [];
            return (
                <div className={styles.columns}>
                    {cols.slice(0, 4).map((col, i) => (
                        <div key={col.id || i} className={styles.column}>
                            {(col.content || []).slice(0, 5).map((b) => (
                                <BlockShape key={b.id} block={b} />
                            ))}
                        </div>
                    ))}
                </div>
            );
        }

        case 'container':
            return (
                <div className={styles.column}>
                    {(block.metadata?.blocks || []).slice(0, 5).map((b: Block) => (
                        <BlockShape key={b.id} block={b} />
                    ))}
                </div>
            );

        case 'link':
            return (
                <div className={styles.media} style={{ height: 32 }}>
                    <Link2 className={styles.mediaIcon} style={{ width: 16, height: 16 }} />
                </div>
            );

        case 'ai':
            return <div className={styles.bar} style={{ width: '54%' }} />;

        default:
            return (
                <div className={`${styles.paragraph} ${indent}`}>
                    <Lines count={linesFor(block.content, 72)} />
                </div>
            );
    }
};

/** Enough shapes to fill a card; past this nothing is visible anyway. */
const MAX_BLOCKS = 22;

interface NoteBodyPreviewProps {
    content: Block[];
    /**
     * The card is queued to become editable. The wireframe animates instead of
     * a separate loading element — the skeleton *is* the loading state.
     */
    loading?: boolean;
    scaleMode?: 'card' | 'canvas';
}

export const NoteBodyPreview = memo(function NoteBodyPreview({ content, loading, scaleMode = 'card' }: NoteBodyPreviewProps) {
    const isCanvasScale = scaleMode === 'canvas';
    
    return (
        <div
            className={`${styles.preview} ${loading ? styles.loading : ''} ${isCanvasScale ? styles.canvasScale : ''}`}
            aria-hidden="true"
        >
            {content.slice(0, MAX_BLOCKS).map((block, i) => {
                // Determine if this block should fill edge-to-edge
                return (
                    <div 
                        key={block.id} 
                        style={{ "--wf-i": i } as CSSProperties}
                        className={content.length === 1 ? styles.singleBlockWrapper : undefined}
                    >
                        <BlockShape block={block} />
                    </div>
                );
            })}
        </div>
    );
});
