import { memo } from 'react';
import styles from './NoteCardMinimal.module.css';

interface NoteCardMinimalProps {
    label?: string;
    /** Card's own colour, used for the spine so a colour-coded canvas still reads. */
    color?: string;
}

/**
 * The `minimal` detail tier: a rectangle with a label.
 *
 * Deliberately two elements. When the canvas is zoomed out far enough to survey
 * a whole workspace, every card is on screen at once — culling has nothing to
 * remove — so the per-card cost is the only thing that decides whether the view
 * opens instantly or locks the tab. Everything the full card draws is a few
 * pixels tall at this zoom, so none of it is missed.
 */
export const NoteCardMinimal = memo(function NoteCardMinimal({ label, color }: NoteCardMinimalProps) {
    return (
        <div className={styles.minimal}>
            <div className={styles.spine} style={color ? { background: color } : undefined} />
            <div className={styles.label}>{label || 'Untitled'}</div>
        </div>
    );
});
