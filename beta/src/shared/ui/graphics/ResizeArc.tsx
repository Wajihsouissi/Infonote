import { useId } from 'react';

interface ResizeArcProps {
    /** Class on the stroke, so the owner can style hover and drag states. */
    pathClassName?: string;
    from?: string;
    to?: string;
}

/**
 * The corner arc every resizable thing is dragged by: cards, canvas blocks,
 * fused notes, gallery tiles. The gradient id is per instance. A fixed id
 * repeats as soon as two of these are on screen, and `url(#id)` then resolves
 * to whichever copy comes first in the document.
 */
export function ResizeArc({
    pathClassName,
    from = 'var(--resize-handle-start)',
    to = 'var(--resize-handle-end)',
}: ResizeArcProps) {
    const gradientId = `resize-arc-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
    return (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={from} />
                    <stop offset="100%" stopColor={to} />
                </linearGradient>
            </defs>
            <path
                d="M 8 32 A 24 24 0 0 1 32 8"
                stroke={`url(#${gradientId})`}
                strokeWidth="6"
                strokeLinecap="round"
                className={pathClassName}
            />
        </svg>
    );
}
