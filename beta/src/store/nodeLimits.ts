/**
 * Node-creation safeguards.
 *
 * Cards, nodes and blocks are unlimited for everyone. Guests may nest canvases
 * only three levels deep; signing in lifts that safeguard.
 */

export const ANON_MAX_NESTING_DEPTH = 3;

export type LimitViolation =
    | { kind: 'anon-depth-limit'; limit: number }
    /* A file that could not be stored — too large for the asset store, or the
       browser is out of room. `reason` is already written for the user by
       services/assets/ingest, so it is shown as-is. */
    | { kind: 'file-rejected'; reason: string };

interface LimitCheckNode {
    id: string;
    parentId?: string | null;
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
    isAuthenticated: boolean;
}): LimitViolation | null {
    const { nodes, targetParentId, isAuthenticated } = args;
    if (!isAuthenticated && getCanvasLevel(nodes, targetParentId) > ANON_MAX_NESTING_DEPTH) {
        return { kind: 'anon-depth-limit', limit: ANON_MAX_NESTING_DEPTH };
    }
    return null;
}

/** How many canvas levels hang below a node: 0 for a card with no cards inside. */
function subtreeHeight(nodes: LimitCheckNode[], rootId: string): number {
    const children = new Map<string, string[]>();
    for (const n of nodes) {
        if (!n.parentId) continue;
        const list = children.get(n.parentId);
        if (list) list.push(n.id);
        else children.set(n.parentId, [n.id]);
    }
    let height = 0;
    let frontier = [rootId];
    const seen = new Set(frontier);
    while (frontier.length) {
        const next = frontier.flatMap((id) => children.get(id) ?? []).filter((id) => !seen.has(id));
        if (!next.length) break;
        next.forEach((id) => seen.add(id));
        height++;
        frontier = next;
    }
    return height;
}

/**
 * Moving a card carries every card inside it along, so the question is not
 * where the card lands but where its deepest descendant does. Checking only the
 * landing level let a guest drag a three-deep stack into another card and end
 * up four levels down.
 */
export function checkNodeMoveLimits(args: {
    nodes: LimitCheckNode[];
    nodeId: string;
    targetParentId: string | null;
    isAuthenticated: boolean;
}): LimitViolation | null {
    const { nodes, nodeId, targetParentId, isAuthenticated } = args;
    if (isAuthenticated) return null;
    const deepest = getCanvasLevel(nodes, targetParentId) + subtreeHeight(nodes, nodeId);
    if (deepest > ANON_MAX_NESTING_DEPTH) {
        return { kind: 'anon-depth-limit', limit: ANON_MAX_NESTING_DEPTH };
    }
    return null;
}
