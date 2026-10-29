import type { AppNode } from '../types';
import type { Block } from '../features/editor/types';

/* Graph helpers shared by the node slices. */

interface PendingParentSync {
    quiet: number;
    maximum: number;
    run: () => void;
}
const pendingSyncs = new Map<string, PendingParentSync>();

function flushParentSync(parentId: string): void {
    const pending = pendingSyncs.get(parentId);
    if (!pending) return;
    pendingSyncs.delete(parentId);
    window.clearTimeout(pending.quiet);
    window.clearTimeout(pending.maximum);
    pending.run();
}

/** Quiet debounce with a maximum wait, always executing the latest callback. */
export function scheduleParentSync(parentId: string, syncFn: () => void, delayMs = 250) {
    const pending = pendingSyncs.get(parentId);
    if (pending) window.clearTimeout(pending.quiet);
    pendingSyncs.set(parentId, {
        run: syncFn,
        quiet: window.setTimeout(() => flushParentSync(parentId), delayMs),
        maximum: pending?.maximum ?? window.setTimeout(() => flushParentSync(parentId), 1500),
    });
}

/** Drain before persistence, including newly scheduled ancestors. A malformed
 * cycle cannot lock the page: each parent is flushed at most once per drain. */
export function flushParentSyncs(): void {
    const visited = new Set<string>();
    while (pendingSyncs.size) {
        const parentId = [...pendingSyncs.keys()].find(id => !visited.has(id));
        if (!parentId) break;
        visited.add(parentId);
        flushParentSync(parentId);
    }
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
