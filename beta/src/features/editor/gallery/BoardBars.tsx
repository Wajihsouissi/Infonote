import { X, Undo2 } from '../../../components/icons';
import { spanLabel, type GallerySpan } from '../galleryTypes';
import type { Block } from '../types';
import barStyles from './BoardBars.module.css';

/* The two bars that can appear under a board. Both keep mousedown from
   reaching the node, so pressing a button never starts dragging the card. */
const stop = (e: React.MouseEvent) => e.stopPropagation();

interface SelectionBarProps {
    count: number;
    /** Sizes are a bento idea; other layouts get only Remove. */
    showSizes: boolean;
    onSize: (span: GallerySpan | undefined) => void;
    onRemove: () => void;
    onClear: () => void;
}

/**
 * What can be done to the selected pictures.
 *
 * Under the board, where the undo bar goes — the actions belong to the
 * selection, not to any one picture, so putting them on a tile would be a lie
 * about their scope.
 */
export function SelectionBar({ count, showSizes, onSize, onRemove, onClear }: SelectionBarProps) {
    return (
        <div className={barStyles.selectionBar} role="status">
            <span className={barStyles.selectionCount}>{count} selected</span>
            {showSizes && (
                <div className={barStyles.selectionSizes}>
                    {(['sm', 'wide', 'tall', 'lg'] as GallerySpan[]).map((s) => (
                        <button
                            key={s}
                            type="button"
                            className={`${barStyles.selectionSize} nodrag`}
                            title={`Make ${count} ${spanLabel(s).toLowerCase()}`}
                            onMouseDown={stop}
                            onClick={() => onSize(s)}
                        >
                            {spanLabel(s)}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={`${barStyles.selectionSize} nodrag`}
                        title="Hand these back to the board's automatic rhythm"
                        onMouseDown={stop}
                        onClick={() => onSize(undefined)}
                    >
                        Auto
                    </button>
                </div>
            )}
            <button
                type="button"
                className={`${barStyles.selectionRemove} nodrag`}
                title="Remove these from the board"
                onMouseDown={stop}
                onClick={onRemove}
            >
                <X size={13} />
                Remove
            </button>
            <button
                type="button"
                className={`${barStyles.undoDismiss} nodrag`}
                aria-label="Clear selection"
                title="Clear selection (Esc)"
                onMouseDown={stop}
                onClick={onClear}
            >
                <X size={13} />
            </button>
        </div>
    );
}

interface UndoBarProps {
    removed: { item: Block }[];
    onUndo: () => void;
    onDismiss: () => void;
}

/**
 * The way back from a removal.
 *
 * `status`, not `alert`: a removal the user just performed is confirmation, not
 * an interruption, and `alert` would cut off whatever a screen reader was
 * already saying.
 */
export function UndoBar({ removed, onUndo, onDismiss }: UndoBarProps) {
    return (
        <div className={barStyles.undoBar} role="status">
            <span className={barStyles.undoText}>
                {removed.length === 1
                    ? `Removed ${removed[0].item.metadata?.name || 'picture'}`
                    : `Removed ${removed.length} pictures`}
            </span>
            <button type="button" className={`${barStyles.undoBtn} nodrag`} onMouseDown={stop} onClick={onUndo}>
                <Undo2 size={13} />
                Undo
            </button>
            <button type="button" className={`${barStyles.undoDismiss} nodrag`} aria-label="Dismiss" onMouseDown={stop} onClick={onDismiss}>
                <X size={13} />
            </button>
        </div>
    );
}
