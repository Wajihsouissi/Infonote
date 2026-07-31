import type { AppNode } from '../types';

/**
 * O(1) node lookup by id, for use inside store selectors.
 *
 * Zustand re-runs *every* subscriber's selector on *every* store change. A
 * selector that does `s.nodes.find(...)` therefore costs O(total nodes), and
 * with many subscribers mounted the cost of a single store write becomes
 * O(nodes × subscribers). On a canvas of 1000 cards with ~160 mounted editors
 * that measured as 161,000 array elements walked per update, and it was the
 * dominant cost of opening or editing a large canvas.
 *
 * The index is cached against the identity of the nodes array, so it is rebuilt
 * once per store change (by whichever selector runs first) and then shared —
 * turning the same work into O(nodes) once plus O(1) per subscriber. A WeakMap
 * keeps stale arrays collectable.
 */
const indexCache = new WeakMap<readonly AppNode[], Map<string, AppNode>>();

export function getNodeById(nodes: readonly AppNode[], id: string | undefined): AppNode | undefined {
    if (!id) return undefined;

    let index = indexCache.get(nodes);
    if (!index) {
        index = new Map(nodes.map((n) => [n.id, n]));
        indexCache.set(nodes, index);
    }
    return index.get(id);
}
