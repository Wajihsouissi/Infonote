import { useState, useEffect, useRef } from 'react';

/**
 * Hook for lazy rendering content using IntersectionObserver.
 * Delays rendering until the element enters the viewport.
 */
export function useLazyRender(rootMargin = '400px') {
    const [hasRendered, setHasRendered] = useState(false);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !hasRendered) {
                        setHasRendered(true);
                    }
                });
            },
            { rootMargin }
        );

        observerRef.current.observe(containerRef.current);

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [hasRendered, rootMargin]);

    return {
        hasRendered,
        containerRef,
    };
}
