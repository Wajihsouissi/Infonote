import { useEffect, useRef, useState } from 'react';
import { scheduleMount, notifyMountCommitted } from './mountScheduler';

/**
 * Follows `desired`, but takes its time turning on.
 *
 * Turning on is the expensive direction: a card body arriving means a whole
 * block editor is built. Two things flip a screenful of cards on at once — a
 * pan bringing them into view, and a zoom crossing the legibility threshold —
 * and either would otherwise put every mount in a single commit and freeze the
 * tab for seconds. Routing the rising edge through the shared frame budget
 * spreads them over a handful of frames instead.
 *
 * Turning off is immediate: dropping work should never wait.
 */
export function useScheduledMount(desired: boolean): boolean {
    const [mounted, setMounted] = useState(false);
    const [lastDesired, setLastDesired] = useState(desired);
    const cancelRef = useRef<(() => void) | null>(null);

    /* Render-phase reset on the falling edge (React's documented pattern for
       adjusting state when a prop changes). It has to happen: without it a card
       that was mounted, scrolled away and came back would report ready
       instantly, so a zoom-out/zoom-in would mount every editor in one commit
       again — the exact freeze the scheduler exists to prevent. */
    if (lastDesired !== desired) {
        setLastDesired(desired);
        if (!desired && mounted) setMounted(false);
    }

    useEffect(() => {
        cancelRef.current?.();
        cancelRef.current = null;

        if (!desired || mounted) return;

        cancelRef.current = scheduleMount(() => {
            cancelRef.current = null;
            setMounted(true);
        });

        return () => {
            cancelRef.current?.();
            cancelRef.current = null;
        };
    }, [desired, mounted]);

    /* Report back once the mount has actually committed. The scheduler holds
       the next card until this lands, which is what stops a heavy canvas from
       batching a whole queue into one render. */
    useEffect(() => {
        if (mounted) notifyMountCommitted();
    }, [mounted]);

    return desired && mounted;
}
