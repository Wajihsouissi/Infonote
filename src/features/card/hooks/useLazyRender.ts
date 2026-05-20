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

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setHasRendered(true);
                        observer.disconnect();
                    }
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
        hasRendered,
        containerRef,
    };
}
