import { useCallback, useEffect, useRef, useState } from 'react';
import { getGalleryItems } from '../galleryTypes';
import type { Block } from '../types';

/** A removed picture and the place it came from. */
export interface RemovedItem {
    item: Block;
    index: number;
}

/**
 * Removing pictures, and taking it back.
 *
 * Removing is one click with no confirmation, which is right — a board is
 * arranged by trying things — but only if it can be taken back. Each removed
 * picture is held with the position it came from, so undo restores the
 * composition and not merely the files. A confirm dialog would be the wrong
 * trade: it taxes every deletion to protect against the rare one, and it
 * interrupts exactly the fast, unthinking pruning that arranging a moodboard
 * is made of.
 */
export function useRemovalUndo({ block, items, setItems }: {
    block: Block;
    items: Block[];
    setItems: (next: Block[]) => void;
}) {
    const undoTimer = useRef<number | undefined>(undefined);
    /* A list, because a removal can be a whole selection. */
    const [undoable, setUndoable] = useState<RemovedItem[] | null>(null);

    const clearUndo = useCallback(() => {
        window.clearTimeout(undoTimer.current);
        undoTimer.current = undefined;
        setUndoable(null);
    }, []);

    useEffect(() => () => window.clearTimeout(undoTimer.current), []);

    const removeMany = useCallback((ids: string[]) => {
        const set = new Set(ids);
        const taken = items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => set.has(item.id));
        if (taken.length === 0) return;
        setItems(items.filter((i) => !set.has(i.id)));
        window.clearTimeout(undoTimer.current);
        setUndoable(taken);
        // Long enough to notice and reach, short enough that it isn't a
        // permanent bar across the bottom of the board.
        undoTimer.current = window.setTimeout(() => setUndoable(null), 7000);
    }, [items, setItems]);

    const removeItem = useCallback((id: string) => removeMany([id]), [removeMany]);

    const undoRemove = useCallback(() => {
        if (!undoable) return;
        /* Rebuilt from the live board, not from the list captured at removal:
           anything added or reordered since must survive the undo. Restored in
           ascending index order so each splice lands where the one before it
           left the list, and clamped because the board may now be shorter. */
        let next = getGalleryItems(block);
        for (const { item, index } of [...undoable].sort((a, b) => a.index - b.index)) {
            const at = Math.min(index, next.length);
            next = [...next.slice(0, at), item, ...next.slice(at)];
        }
        setItems(next);
        clearUndo();
    }, [undoable, block, setItems, clearUndo]);

    return { undoable, removeMany, removeItem, undoRemove, clearUndo };
}
