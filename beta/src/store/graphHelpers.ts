import type { AppNode } from '../types';
import type { Block } from '../features/editor/types';

/* Graph helpers shared by the node slices. */

// Debounce map for parent content sync to prevent thrashing
const pendingSyncTimers = new Map<string, number>();

// Helper to schedule debounced sync
export function scheduleParentSync(parentId: string, syncFn: () => void, delayMs: number = 250) {
    // Clear existing timer for this parent
    const existingTimer = pendingSyncTimers.get(parentId);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }
    
    // Schedule new sync
    const timerId = window.setTimeout(() => {
        pendingSyncTimers.delete(parentId);
        syncFn();
    }, delayMs);
    
    pendingSyncTimers.set(parentId, timerId);
}

/** Return a selected branch in document order, including every descendant.
 *
 * Canvas membership is represented by `parentId`, not by React Flow's visual
 * tree. Treating a selected parent as a single record leaves cards in its
 * nested canvases permanently orphaned after a delete or duplicate.
 */
export function collectNodeBranch(nodes: AppNode[], rootIds: Iterable<string>): AppNode[] {
    const childrenByParent = new Map<string, string[]>();
    for (const node of nodes) {
        if (!node.parentId) continue;
        const children = childrenByParent.get(node.parentId) ?? [];
        children.push(node.id);
        childrenByParent.set(node.parentId, children);
    }

    const ids = new Set<string>();
    const pending = [...rootIds];
    while (pending.length > 0) {
        const id = pending.pop()!;
        if (ids.has(id)) continue;
        ids.add(id);
        childrenByParent.get(id)?.forEach((childId) => pending.push(childId));
    }

    return nodes.filter((node) => ids.has(node.id));
}

/** Update page-block links after cloning a nested canvas branch.
 *
 * Page links can occur inside any supported nested block container, so the
 * remap intentionally walks metadata rather than only top-level blocks.
 */
function remapNodeReferences(value: unknown, idMap: Map<string, string>): unknown {
    if (Array.isArray(value)) return value.map((item) => remapNodeReferences(item, idMap));
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
            key,
            key === 'nodeId' && typeof item === 'string' ? (idMap.get(item) ?? item) : remapNodeReferences(item, idMap),
        ]),
    );
}

export function remapBlockNodeReferences(blocks: Block[], idMap: Map<string, string>): Block[] {
    return blocks.map((block) => ({
        ...block,
        ...(block.metadata
            ? { metadata: remapNodeReferences(block.metadata, idMap) as typeof block.metadata }
            : {}),
    }));
}
