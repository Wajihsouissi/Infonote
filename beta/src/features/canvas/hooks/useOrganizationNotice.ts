import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store/useStore';

const NOTICE_MS = 5000;

type Notice = { count: number; historyDepth: number };

/**
 * The "N nodes organized — Undo" notice shown after "Organize canvas"
 * (dispatched as `chnk-it:canvas-organized`). Undo reverts the arrangement only
 * while it is still the latest step, so it can never undo something newer.
 */
export function useOrganizationNotice() {
    const [notice, setNotice] = useState<Notice | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const clearTimer = () => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    };

    useEffect(() => {
        const handleOrganized = (event: Event) => {
            setNotice((event as CustomEvent<Notice>).detail);
            clearTimer();
            timeoutRef.current = window.setTimeout(() => {
                setNotice(null);
                timeoutRef.current = null;
            }, NOTICE_MS);
        };
        window.addEventListener('chnk-it:canvas-organized', handleOrganized);
        return () => {
            window.removeEventListener('chnk-it:canvas-organized', handleOrganized);
            clearTimer();
        };
    }, []);

    const undo = useCallback(() => {
        if (!notice) return;
        const temporal = useStore.temporal.getState();
        if (temporal.pastStates.length === notice.historyDepth) temporal.undo();
        setNotice(null);
        clearTimer();
    }, [notice]);

    return { notice, undo };
}
