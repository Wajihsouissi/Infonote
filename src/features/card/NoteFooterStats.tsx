import { useMemo } from 'react';
import { Image as ImageIcon, StickyNote, Video, FileText, Layers } from '../../components/icons';
import styles from './NoteCard.module.css';
import type { Block } from '../editor/types';

interface NoteFooterStatsProps {
    content: Block[] | string | null | undefined;
    date?: string;
}

/**
 * Footer section with content statistics and creation date.
 * Displays counts of nested cards, blocks, images, videos, and files.
 */
export function NoteFooterStats({ content, date }: NoteFooterStatsProps) {
    const stats = useMemo(() => {
        if (!content || !Array.isArray(content)) {
            return null;
        }

        const total = content.length;
        const cards = content.filter(b => b && b.type === 'page').length;
        const images = content.filter(b => b && b.type === 'image').length;
        const videos = content.filter(b => b && b.type === 'video').length;
        const pdfs = content.filter(b => b && b.type === 'file').length;

        return { total, cards, images, videos, pdfs };
    }, [content]);

    return (
        <div className={styles.expandedFooter}>
            {/* Left Stats */}
            <div className={styles.footerStats}>
                {stats && stats.cards > 0 && (
                    <span className={styles.statItem} title={`${stats.cards} Nested Cards`}>
                        <StickyNote size={14} /> {stats.cards}
                    </span>
                )}
                {stats && stats.total > 0 && (
                    <span className={styles.statItem} title={`${stats.total} Total Blocks`}>
                        <Layers size={14} /> {stats.total}
                    </span>
                )}
                {stats && stats.images > 0 && (
                    <span className={styles.statItem} title={`${stats.images} Images`}>
                        <ImageIcon size={14} /> {stats.images}
                    </span>
                )}
                {stats && stats.videos > 0 && (
                    <span className={styles.statItem} title={`${stats.videos} Videos`}>
                        <Video size={14} /> {stats.videos}
                    </span>
                )}
                {stats && stats.pdfs > 0 && (
                    <span className={styles.statItem} title={`${stats.pdfs} PDFs/Files`}>
                        <FileText size={14} /> {stats.pdfs}
                    </span>
                )}
            </div>

            <div className={styles.footerDateBadge}>
                <span style={{ opacity: 0.5 }}>Created</span>
                <span>
                    {new Date(date || new Date()).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    })}
                </span>
            </div>
        </div>
    );
}
