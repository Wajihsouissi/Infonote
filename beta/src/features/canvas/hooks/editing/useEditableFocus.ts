import { useCallback, useEffect, useRef, useState } from 'react';
import { endBlockDrag } from '../../../editor/drag/blockDragLock';
import { isEditableElement } from '../../../../utils/editableTarget';

/**
 * Tracks whether the keyboard is in a text field, and gets it out again:
 * Escape leaves a field, and a press anywhere outside one blurs it.
 *
 * `isInEditableFieldRef` is for listeners registered once, which must read the
 * latest value without re-subscribing on every keystroke.
 */
export function useEditableFocus() {
    const [isInEditableField, setIsInEditableField] = useState(false);
    const isInEditableFieldRef = useRef(false);

    useEffect(() => {
        const update = () => {
            const next = isEditableElement(document.activeElement);
            isInEditableFieldRef.current = next;
            setIsInEditableField(next);
        };
        update();
        window.addEventListener('focusin', update);
        window.addEventListener('focusout', update);
        return () => {
            window.removeEventListener('focusin', update);
            window.removeEventListener('focusout', update);
        };
    }, []);

    const blurActiveEditable = useCallback((): boolean => {
        // Never mid-drag: the editor's drag cleanup restores focus itself.
        if (window.chnkItBlockDragging) return false;
        const el = document.activeElement;
        if (!(el instanceof HTMLElement) || !isEditableElement(el)) return false;
        el.blur();
        window.getSelection()?.removeAllRanges();
        return true;
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof Element && e.target.closest('[data-editor-command-menu]')) return;
            if (e.target instanceof Element && e.target.closest('[data-inline-formatting-toolbar]')) return;
            if (e.key === 'Escape' && e.target instanceof Element && e.target.closest('[data-block-selection-count]')) return;
            if (e.key !== 'Escape' || !blurActiveEditable()) return;
            e.preventDefault();
            e.stopPropagation();
        };
        const handlePointerDown = (e: PointerEvent) => {
            if (e.target instanceof Element && e.target.closest('[data-inline-formatting-toolbar]')) return;
            if (window.chnkItBlockDragging || !isInEditableFieldRef.current) return;
            if (isEditableElement(e.target)) return;
            blurActiveEditable();
        };
        // A block drag whose source unmounted mid-gesture never gets its own
        // dragend; release the drag lock from the window as a fallback.
        const handleGlobalDragEnd = () => {
            if (window.chnkItBlockDragging || document.body.classList.contains('chnk-it-block-dragging')) {
                endBlockDrag();
                document.body.classList.remove('chnk-it-node-dragging');
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        document.addEventListener('pointerdown', handlePointerDown, { capture: true });
        window.addEventListener('dragend', handleGlobalDragEnd, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('dragend', handleGlobalDragEnd, true);
        };
    }, [blurActiveEditable]);

    return { isInEditableField, isInEditableFieldRef, blurActiveEditable };
}
