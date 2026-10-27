import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { scheduleMount } from './mountScheduler';
import type { RenderTicket } from '../reading/CommitQueue';

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
export function useScheduledMount(desired: boolean, immediate = false): boolean {
    const [mounted, setMounted] = useState(false);
    const [lastDesired, setLastDesired] = useState(desired);
    const ticketRef = useRef<RenderTicket | null>(null);

    /* Render-phase reset on the falling edge (React's documented pattern for
       adjusting state when a prop changes). It has to happen: without it a card
       that was mounted, scrolled away and came back would report ready
       instantly, so a zoom-out/zoom-in would mount every editor in one commit
       again — the exact freeze the scheduler exists to prevent. */
    if (lastDesired !== desired) {
        setLastDesired(desired);
        if (!desired && mounted) setMounted(false);
    }

    // A directly requested editor has really mounted too. Retain that fact
    // when composition temporarily keeps it alive after ownership changes.
    if (desired && immediate && !mounted) setMounted(true);

    useEffect(() => {
        ticketRef.current?.cancel();
        ticketRef.current = null;

        if (!desired || mounted || immediate) return;

        const ticket = scheduleMount(() => setMounted(true));
        ticketRef.current = ticket;

        return () => {
            ticket.cancel();
            if (ticketRef.current === ticket) ticketRef.current = null;
        };
    }, [desired, mounted, immediate]);

    /* Report back once the mount has actually committed. The scheduler holds
       the next card until this lands, which is what stops a heavy canvas from
       batching a whole queue into one render. */
    useLayoutEffect(() => {
        if (mounted) {
            ticketRef.current?.commit();
            ticketRef.current = null;
        }
    }, [mounted]);

    return desired && (immediate || mounted);
}
