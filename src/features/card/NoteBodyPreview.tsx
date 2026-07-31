import { memo, type CSSProperties } from 'react';
import type { Block } from '../editor/types';
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
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <Lines count={linesFor(block.content, 62)} />
                    </div>
                </div>
            );

        case 'quote':
            return (
                <div className={styles.quote} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Lines count={linesFor(block.content, 70)} />
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
            const rows = block.metadata?.rows || [];
            const cols = Math.min(5, rows[0]?.length || 2);
            const shown = Math.min(5, Math.max(1, rows.length));
            return (
                <div className={styles.table}>
                    {Array.from({ length: shown }, (_, r) => (
                        <div key={r} className={`${styles.tableRow} ${r === 0 ? styles.tableHead : ''}`}>
                            {Array.from({ length: cols }, (_, c) => (
                                <div key={c} className={styles.tableCell} />
                            ))}
                        </div>
                    ))}
                </div>
            );
        }

        case 'image':
        case 'video':
        case 'file':
            return <div className={styles.media} />;

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
                    {(block.metadata?.blocks || []).slice(0, 5).map((b) => (
                        <BlockShape key={b.id} block={b} />
                    ))}
                </div>
            );

        case 'link':
            return <div className={styles.media} style={{ height: 30 }} />;

        case 'ai':
            return <div className={styles.bar} style={{ width: '54%' }} />;

        default:
            return (
                <div className={indent} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
}

export const NoteBodyPreview = memo(function NoteBodyPreview({ content, loading }: NoteBodyPreviewProps) {
    return (
        <div
            className={`${styles.preview} ${loading ? styles.loading : ''}`}
            aria-hidden="true"
        >
            {content.slice(0, MAX_BLOCKS).map((block, i) => (
                // Index drives the stagger so the sweep runs down the card.
                <div key={block.id} style={{ "--wf-i": i } as CSSProperties}>
                    <BlockShape block={block} />
                </div>
            ))}
        </div>
    );
});
