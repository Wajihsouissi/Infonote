import { useNodeEditingOwnership } from '../../../editor/hooks/useEditingSession';
import { useCanvasOverview } from '../navigation/useCanvasOverview';

/**
 * Whether a canvas node may pay the cost of a live block editor.
 *
 * A canvas can contain many expanded notes, but only one is being actively
 * edited at a time. Keeping every nearby editor mounted makes each pan and
 * zoom carry all of their selection listeners, effects, and editable DOM.
 * This deliberately observes only this node's boolean selection state, so a
 * selection change wakes the two affected nodes rather than every card on the
 * board. Keep an existing selected editor mounted through gestures: replacing
 * it with a complete reader and back incurs two large DOM/layout commits per
 * movement. The shared mount scheduler already parks NEW editors while moving.
 *
 * `interactionReady` preserves the short post-selection guard used by canvas
 * nodes: React Flow finishes its click/drag bookkeeping before the editor can
 * claim pointer events.
 */
export function useCanvasEditorEligibility(nodeId: string, interactionReady: boolean): boolean {
    const isSoleSelection = useNodeEditingOwnership(nodeId);
    const overview = useCanvasOverview(interactionReady && isSoleSelection);
    return interactionReady && isSoleSelection && !overview;
}
