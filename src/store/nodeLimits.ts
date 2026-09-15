/**
 * Node-creation safeguards (see BETA_SCOPE.md).
 *
 * Card and per-canvas node quotas are temporarily disabled for everyone.
 * Anonymous canvases may still be nested only three levels deep; signing in
 * lifts that nesting safeguard.
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
    type?: string;
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
    newNodeType?: string;
    isAuthenticated: boolean;
    /** Retained for call-site compatibility while quotas are disabled. */
    addedCount?: number;
}): LimitViolation | null {
    const { nodes, targetParentId, isAuthenticated } = args;

    if (!isAuthenticated) {
        if (getCanvasLevel(nodes, targetParentId) > ANON_MAX_NESTING_DEPTH) {
            return { kind: 'anon-depth-limit', limit: ANON_MAX_NESTING_DEPTH };
        }
    }

    return null;
}
