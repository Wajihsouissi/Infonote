/**
 * Beta node-creation limits (see BETA_SCOPE.md).
 *
 * - Everyone: max 50 nodes on any single canvas. Applies to CREATION only —
 *   a canvas loaded with more nodes renders untouched (never trim on load).
 * - Anonymous only: max 25 cards total and canvases nested max 3 levels deep.
 *   Signing in lifts the anonymous limits.
 */

export const MAX_NODES_PER_CANVAS = 50;
export const ANON_MAX_CARDS = 25;
export const ANON_MAX_NESTING_DEPTH = 3;

export type LimitViolation =
    | { kind: 'canvas-full'; limit: number }
    | { kind: 'anon-card-limit'; limit: number }
    | { kind: 'anon-depth-limit'; limit: number }
    /* A file that could not be stored — too large for the asset store, or the
       browser is out of room. `reason` is already written for the user by
       services/assets/ingest, so it is shown as-is. */
    | { kind: 'file-rejected'; reason: string };

interface LimitCheckNode {
    id: string;
    type?: string;
    parentId?: string | null;
}

const sameCanvas = (a?: string | null, b?: string | null) => (a ?? null) === (b ?? null);

export function countNodesOnCanvas(nodes: LimitCheckNode[], parentId?: string | null): number {
    return nodes.reduce((n, node) => (sameCanvas(node.parentId, parentId) ? n + 1 : n), 0);
}

export function countCards(nodes: LimitCheckNode[]): number {
    return nodes.reduce((n, node) => (node.type === 'note' ? n + 1 : n), 0);
}

/** Nesting level of the canvas identified by parentId (root canvas = 1). */
export function getCanvasLevel(nodes: LimitCheckNode[], parentId?: string | null): number {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    let level = 1;
    let current = parentId ?? null;
    while (current) {
        if (seen.has(current)) break; // cycle guard
        seen.add(current);
        level++;
        current = byId.get(current)?.parentId ?? null;
    }
    return level;
}

export function checkNodeCreationLimits(args: {
    nodes: LimitCheckNode[];
    targetParentId?: string | null;
    newNodeType?: string;
    isAuthenticated: boolean;
    /** How many nodes the operation adds to the target canvas (default 1). */
    addedCount?: number;
}): LimitViolation | null {
    const { nodes, targetParentId, newNodeType, isAuthenticated, addedCount = 1 } = args;

    if (countNodesOnCanvas(nodes, targetParentId) + addedCount > MAX_NODES_PER_CANVAS) {
        return { kind: 'canvas-full', limit: MAX_NODES_PER_CANVAS };
    }

    if (!isAuthenticated) {
        if (newNodeType === 'note' && countCards(nodes) >= ANON_MAX_CARDS) {
            return { kind: 'anon-card-limit', limit: ANON_MAX_CARDS };
        }
        if (getCanvasLevel(nodes, targetParentId) > ANON_MAX_NESTING_DEPTH) {
            return { kind: 'anon-depth-limit', limit: ANON_MAX_NESTING_DEPTH };
        }
    }

    return null;
}
