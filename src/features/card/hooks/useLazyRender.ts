import { useState, useEffect, useRef } from 'react';

/**
 * Reports whether an element is at or near the viewport, via IntersectionObserver.
 *
 * The observer stays connected after the first hit so the flag can drop back to
 * false when the element leaves again. It used to disconnect on first
 * intersection, which meant one zoom-out — where every card intersects at once —
 * permanently mounted every card body on the canvas, and the cost never came
 * back down however the user panned afterwards.
 *
 * This reports proximity only. Deciding *when* to act on it (so a screenful of
 * cards does not all mount in one commit) is useScheduledMount's job.
 */
export function useLazyRender(rootMargin = '400px') {
    const [isNearViewport, setIsNearViewport] = useState(false);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    /* Never report away a subtree that holds the caret: the user
                       would lose focus, and any edit not yet flushed to the
                       store, mid-keystroke. */
                    if (!entry.isIntersecting && entry.target.contains(document.activeElement)) {
                        return;
                    }
                    setIsNearViewport(entry.isIntersecting);
                });
            },
            { rootMargin }
        );

        observer.observe(containerRef.current);
        observerRef.current = observer;

        return () => {
            observer.disconnect();
        };
    }, [rootMargin]);

    return {
        isNearViewport,
        containerRef,
    };
}
