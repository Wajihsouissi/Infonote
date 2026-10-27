import { useSyncExternalStore } from 'react';
import { isOverview, subscribeOverview } from '../viewport/viewportStreamingStore';

const noOverview = () => false;
const subscribeNothing = () => () => {};

/** Full expanded content does not change presentation at overview zoom.
 * Keep those trees out of threshold notifications instead of rebuilding every
 * paragraph/table just to ignore the resulting snapshot. */
export function useCanvasOverview(enabled = true): boolean {
    return useSyncExternalStore(enabled ? subscribeOverview : subscribeNothing,
        enabled ? isOverview : noOverview, noOverview);
}
