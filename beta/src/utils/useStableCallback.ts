import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A callback whose identity never changes but whose body is always the latest
 * render's.
 *
 * This is what keeps memoized children memoized. A handler built with
 * `useCallback` still changes whenever anything it closes over changes — the
 * block list, the current selection — so in the editor every keystroke handed
 * each block a new `onKeyDown`, `onPaste` and `onChange`, and `React.memo` had
 * no choice but to re-render every block in the document.
 *
 * Only for event handlers: reading `ref.current` during render would see the
 * previous render's closure, so this must never be called while rendering.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    const latest = useRef(fn);
    // Layout effect, not effect: a handler fired by a DOM event committed in
    // the same frame must already be the new one.
    useLayoutEffect(() => {
        latest.current = fn;
    });
    return useCallback((...args: A) => latest.current(...args), []);
}
