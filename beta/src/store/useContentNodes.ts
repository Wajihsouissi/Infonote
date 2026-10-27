import { useShallow } from 'zustand/react/shallow';
import { useStore } from './useStore';

/**
 * Subscribe to canvas nodes without waking for position-only drag frames.
 *
 * Panels, counters, search and command surfaces care about node identity,
 * hierarchy, content and dimensions, but not the transient x/y written while a
 * card follows the pointer. Their old `state.nodes` subscriptions caused every
 * hidden panel (including Motion layout trees) to render on every drag event.
 *
 * The shallow semantic signature suppresses those renders. Returning the live
 * array imperatively means a later prop/local-state render still sees current
 * positions; this hook only controls when a store write itself wakes the
 * component.
 */
export function useContentNodes() {
    useStore(useShallow(state => state.nodes.flatMap(node => [
        node.id,
        node.type,
        node.parentId,
        node.data,
        node.style,
    ])));

    return useStore.getState().nodes;
}
