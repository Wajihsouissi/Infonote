import { useEffect, useRef, useState } from 'react';

type Listener = () => void;
const targets = new Map<Element, Listener>();
let observer: IntersectionObserver | null = null;
function observe(target: Element, admit: Listener) {
    if (typeof IntersectionObserver === 'undefined') { admit(); return () => {}; }
    observer ??= new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) targets.get(entry.target)?.();
    }, { rootMargin: '10%' });
    targets.set(target, admit);
    observer.observe(target);
    return () => {
        targets.delete(target);
        observer?.unobserve(target);
        if (!targets.size) { observer?.disconnect(); observer = null; }
    };
}

/** Admit complete canvas readers only near the viewport at legible zoom.
 * Retain admitted trees until the card unmounts, preserving native selection
 * and scroll continuity. All targets share one observer. */
export function useReadingAdmission(defer: boolean, enabled = true) {
    const host = useRef<HTMLDivElement>(null);
    const [admitted, setAdmitted] = useState(false);
    useEffect(() => {
        if (!enabled || defer || admitted || !host.current) return;
        return observe(host.current, () => setAdmitted(true));
    }, [defer, admitted, enabled]);
    return { host, admitted: !enabled || admitted };
}
