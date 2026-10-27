import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { scheduleReading } from '../hooks/mountScheduler';
import type { RenderTicket } from './CommitQueue';
import { nextReadingCount } from './readingBudget';

/** Bound initial commits; already mounted content stays for native selection. */
export function useProgressiveCount(costs: readonly number[], budget: number, enabled = true): number {
    const total = costs.length;
    const small = useMemo(() => costs.reduce((sum, cost) => sum + cost, 0) <= budget * 2, [costs, budget]);
    const [released, setReleased] = useState(() => nextReadingCount(costs, 0, budget));
    const ticketRef = useRef<RenderTicket | null>(null);
    const count = !enabled || small ? total : Math.min(total, released);
    useLayoutEffect(() => {
        ticketRef.current?.commit();
        ticketRef.current = null;
    }, [released]);
    useEffect(() => {
        if (count >= total) return;
        const ticket = scheduleReading(() => setReleased(previous => nextReadingCount(costs, previous, budget)));
        ticketRef.current = ticket;
        return () => {
            ticket.cancel();
            if (ticketRef.current === ticket) ticketRef.current = null;
        };
    }, [count, total, costs, budget]);
    return count;
}
