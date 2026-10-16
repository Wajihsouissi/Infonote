import { useCallback, useSyncExternalStore } from 'react';
import { isStreaming, subscribeStreaming } from './viewportStreamingStore';
import { useStore } from '../../../store/useStore';

/**
 * Whether a canvas node may pay the cost of a live block editor.
 *
 * A canvas can contain many expanded notes, but only one is being actively
 * edited at a time. Keeping every nearby editor mounted makes each pan and
 * zoom carry all of their selection listeners, effects, and editable DOM.
 * This deliberately observes only this node's boolean selection state, so a
 * selection change wakes the two affected nodes rather than every card on the
 * board. While the viewport is streaming, even the selected editor steps down
 * to its static preview so contenteditable/layout work cannot steal gesture
 * frames; the shared mount scheduler restores it after the quiet period.
 *
 * `interactionReady` preserves the short post-selection guard used by canvas
 * nodes: React Flow finishes its click/drag bookkeeping before the editor can
 * claim pointer events.
 */
export function useCanvasEditorEligibility(nodeId: string, interactionReady: boolean): boolean {
    const isSoleSelection = useStore(useCallback(
        state => state.selectedCanvasNodeIds.size === 1 && state.selectedCanvasNodeIds.has(nodeId),
        [nodeId],
    ));
    const viewportStreaming = useSyncExternalStore(subscribeStreaming, isStreaming, isStreaming);
    return interactionReady && isSoleSelection && !viewportStreaming;
}
