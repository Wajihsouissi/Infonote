import { useCallback, useEffect, useRef } from 'react';
import type { OnSelectionChangeParams } from '@xyflow/react';
import { useStore } from '../../../../store/useStore';

/** How long after we change the selection to ignore React Flow's echo of it. */
const PROGRAMMATIC_SELECTION_GUARD_MS = 250;

const sameIds = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((id) => b.has(id));

/**
 * Keeps React Flow's selection and the store's in agreement.
 *
 * The store is the source of truth. React Flow reports selection changes
 * asynchronously, so two of its reports are ignored: the echo that follows our
 * own programmatic selection (it would revert it), and the empty selection it
 * publishes on mousedown between deselecting one card and selecting the next
 * (it would flash the selection toolbar out and back on every click-through).
 */
export function useSelectionSync() {
    const lastProgrammaticSelectionRef = useRef(0);
    const isBoxSelectingRef = useRef(false);

    useEffect(() => useStore.subscribe((state, previous) => {
        if (state.selectedCanvasNodeIds !== previous.selectedCanvasNodeIds
            && !sameIds(state.selectedCanvasNodeIds, previous.selectedCanvasNodeIds)) {
            lastProgrammaticSelectionRef.current = Date.now();
        }
    }), []);

    const onSelectionStart = useCallback(() => {
        isBoxSelectingRef.current = true;
        useStore.getState().setSelectedEdgeId(null);
    }, []);

    const onSelectionEnd = useCallback(() => {
        // React Flow publishes the box's result just after onSelectionEnd; keep
        // the gate open through that turn.
        requestAnimationFrame(() => {
            isBoxSelectingRef.current = false;
        });
    }, []);

    const onSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
        // A box grows over many frames. Its first result also updates the
        // store; treating that as a programmatic echo froze the box at the
        // first card for the next 250ms and lost the rest of a fast lasso.
        if (!isBoxSelectingRef.current && Date.now() - lastProgrammaticSelectionRef.current < PROGRAMMATIC_SELECTION_GUARD_MS) return;

        const { selectedCanvasNodeIds: currentIds, nodes, setSelectedCanvasNodeIds } = useStore.getState();
        const nextIds = new Set(selectedNodes.map((n) => n.id));
        if (sameIds(nextIds, currentIds)) return;

        // An empty report is honoured only when the selection really ended:
        // a box deselection, or the selected cards were deleted.
        if (nextIds.size === 0 && !isBoxSelectingRef.current) {
            const selectionStillExists = [...currentIds].some((id) => nodes.some((n) => n.id === id));
            if (selectionStillExists) return;
        }
        setSelectedCanvasNodeIds(nextIds);
    }, []);

    return { onSelectionStart, onSelectionEnd, onSelectionChange };
}
