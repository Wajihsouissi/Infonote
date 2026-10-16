import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { placeCaret, revealBlock, type CaretTarget } from '../caret';

/** Frames to keep looking for a block that has not mounted yet. */
const MOUNT_ATTEMPTS = 5;
/** Frames to wait for a block that exists but is still hidden. ~1s: a new
 *  canvas node is measured within a few frames. */
const FOCUS_ATTEMPTS = 60;

interface UseBlockFocusOptions {
    blockRefs: React.RefObject<Record<string, HTMLElement | null>>;
}

/**
 * Moving the caret between blocks.
 *
 * Callers say "focus this block, caret there" and this puts it there once the
 * block exists, scrolling it into view unless the move was bookkeeping rather
 * than navigation (restoring focus after a drag).
 */
export function useBlockFocus({ blockRefs }: UseBlockFocusOptions) {
    const [focusId, setFocusId] = useState<string | null>(null);
    const caretRef = useRef<CaretTarget | null>(null);
    const silentRef = useRef(false);

    /**
     * Where the caret goes on the NEXT focus request, whoever makes it.
     * Some moves are two steps — set the caret, then convert a block, which
     * focuses whatever it created — so the two are separable.
     */
    const setCaret = useCallback((caret: CaretTarget | null) => {
        caretRef.current = caret;
    }, []);

    /** Focus `id`, putting the caret at `caret` (default: the end). */
    const focusBlock = useCallback((id: string, caret: CaretTarget | null = 'end', options?: { silent?: boolean }) => {
        caretRef.current = caret;
        if (options?.silent) silentRef.current = true;
        setFocusId(id);
    }, []);

    /* useLayoutEffect, not useEffect: the .focus() call has to commit
       synchronously after the DOM update, before the browser processes the
       next event. Blocks created by Enter hand off focus asynchronously (the
       new block's DOM node has to exist first), so with a passive effect fast
       typing could still reach the OLD block. */
    useLayoutEffect(() => {
        if (!focusId) return;

        let cancelled = false;
        let frame: number | null = null;

        const apply = (el: HTMLElement) => {
            el.focus({ preventScroll: true });
            const silent = silentRef.current;
            silentRef.current = false;
            if (!silent) revealBlock(el);
            placeCaret(el, caretRef.current);
            caretRef.current = null;
            setFocusId(null);
        };

        let hiddenFrames = 0;
        const attempt = (left: number) => {
            if (cancelled) return;
            const el = blockRefs.current[focusId];
            if (el?.isConnected) {
                /* Existing is not enough. A block spawned by Enter sits in a
                   canvas node React Flow keeps `visibility: hidden` until it
                   has measured it, and WebKit ignores focus() on a hidden
                   element where Chrome lets it through — so Safari's caret
                   stayed in the old block and the next words went there.
                   Wait out the hidden frames, then focus as usual. */
                if (getComputedStyle(el).visibility === 'hidden' && ++hiddenFrames <= FOCUS_ATTEMPTS) {
                    frame = requestAnimationFrame(() => attempt(left));
                    return;
                }
                apply(el);
                return;
            }
            /* A block created in the same update as this focus request (say,
               the text block that follows a new divider) can have its DOM node
               replaced by a follow-up render, leaving the registered ref stale
               for a frame. Retry a few times rather than dropping focus. */
            if (left > 0) frame = requestAnimationFrame(() => attempt(left - 1));
            else setFocusId(null);
        };

        attempt(MOUNT_ATTEMPTS);

        return () => {
            cancelled = true;
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [focusId, blockRefs]);

    return { focusId, focusBlock, setCaret };
}
