import { Suspense, lazy, useEffect, useState } from 'react';
import { useStore } from '../../../../store/useStore';

/**
 * When the AI panel's code is downloaded.
 *
 * The panel is a third of the canvas bundle — the runner, the generator, the
 * markdown renderer, its own stylesheets — and a canvas that is never asked a
 * question needs none of it. So it loads on demand, and once it has loaded it
 * stays mounted: the transcript, the draft and the scroll position all live
 * inside it, and unmounting on close would throw away a conversation the user
 * can still see the results of on their canvas.
 *
 * The wait is hidden by fetching the chunk while the canvas is idle, so by the
 * time anyone presses Ctrl+J it is almost always already there.
 */
const AIPanel = lazy(() => import('./AIPanel').then((module) => ({ default: module.AIPanel })));

export function AIPanelMount() {
    const isOpen = useStore((s) => s.isAIPanelOpen);
    /* "Has it ever been opened", derived during render rather than set from an
       effect: the panel has to mount on the same commit that opens it, or the
       first Ctrl+J would paint one frame of empty canvas before it arrives. */
    const [mounted, setMounted] = useState(false);
    if (isOpen && !mounted) setMounted(true);

    // Warm the chunk once the canvas has settled. `requestIdleCallback` is not
    // in every browser; a timeout is a fine stand-in for "not now".
    useEffect(() => {
        if (mounted) return;
        // This download is speculative. Firefox can abort its dependent module
        // requests when navigation leaves the canvas; that must not surface as
        // an unhandled application error for a panel the user never opened.
        const prefetch = () => { void import('./AIPanel').catch(() => undefined); };
        const idle = window.requestIdleCallback?.(prefetch, { timeout: 4000 });
        const timer = idle === undefined ? window.setTimeout(prefetch, 2500) : undefined;
        return () => {
            if (idle !== undefined) window.cancelIdleCallback?.(idle);
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [mounted]);

    if (!mounted) return null;

    return (
        <Suspense fallback={null}>
            <AIPanel />
        </Suspense>
    );
}
