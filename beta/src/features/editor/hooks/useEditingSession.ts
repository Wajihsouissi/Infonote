import { useCallback, useState } from 'react';
import { useStore } from '../../../store/useStore';

/** One selection/panel policy shared by canvas admission and direct promotion.
 * Subscribe to this node's boolean so other cards' selection changes stay cheap. */
export function useNodeEditingOwnership(nodeId: string): boolean {
    return useStore(useCallback(
        state => state.selectedCanvasNodeIds.size === 1 && state.selectedCanvasNodeIds.has(nodeId)
            && !state.fullscreenId && !state.centerPanelId && !state.rightSidePanelId && !state.leftSidePanelId,
        [nodeId],
    ));
}

/** Local editing intent and composition retention for an expanded note.
 * The host keeps mount pacing, synchronous event boundaries and DOM focus. */
export function useEditingSession(nodeId: string, showLiveEditor: boolean) {
    const [editingRequested, setEditingRequested] = useState(false);
    const [composing, setComposing] = useState(false);
    const ownsEditing = useNodeEditingOwnership(nodeId);
    const immediate = editingRequested && ownsEditing;

    const requestEditing = () => {
        useStore.getState().setSelectedCanvasNodeIds(new Set([nodeId]));
        setEditingRequested(true);
    };

    return {
        // Keep the existing priority: direct intent and composition can retain
        // the editor when ordinary canvas admission falls away.
        wantsEditor: showLiveEditor || immediate || composing,
        immediate,
        requestEditing,
        beginComposition: () => setComposing(true),
        endComposition: () => setComposing(false),
    };
}
