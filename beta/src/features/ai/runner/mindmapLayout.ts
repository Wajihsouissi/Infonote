import type { AIStructuredAction } from '../../../services/ai/types';

/**
 * Where each node of a mind map goes.
 *
 * Two arrangements. `layoutMindmap` is the tidy two-sided tree used for a map
 * the user asked for; `layoutClusteredMindmap` is the tighter, pile-per-section
 * shape used when a map is made out of an answer that already has sections.
 * Both return coordinates relative to their own bounding box, so the caller can
 * reserve exactly the rectangle it is about to draw into.
 */

const MINDMAP_ROOT_SIZE = { width: 260, height: 80 };
const MINDMAP_NODE_SIZE = { width: 220, height: 70 };
/** Clear space between depth columns, and between stacked sibling rows. */
const MINDMAP_H_GAP = 90;
const MINDMAP_V_GAP = 22;

export type MindmapInput = NonNullable<AIStructuredAction['nodes']>[number];

export interface MindmapPlacement {
    id: string;
    /** Effective parent after orphan repair — the edge is drawn from this. */
    parent: string | null;
    /** Top-left, relative to the layout's own bounding box. */
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
    /** Top-level section within a compact answer-derived cluster. */
    clusterRoot?: boolean;
}

/**
 * Lay a mindmap out as a tidy two-sided tree: root in the middle, subtrees
 * marching left and right in fixed columns, siblings stacked in rows.
 *
 * This replaced a radial layout that placed every child on an arc around its
 * parent. Radial looks right for a handful of nodes and falls apart past that:
 * it positions nodes as if they were points, so a ring of 220px-wide boxes at
 * neighbouring angles overlaps badly, and a deep branch inherits a narrow arc
 * slice that crushes its own children together. The model routinely returns
 * 15-30 nodes, which is squarely in the range where that broke down.
 *
 * Vertical packing is the standard tidy-tree trick: only leaves consume vertical
 * space (one row each), and every parent is centred on the span of its children.
 * That gives each subtree a disjoint vertical band, so nodes in the same column
 * are always at least one row apart and can never collide, while the tree still
 * pulls tight around its own shape instead of spreading over a fixed radius.
 *
 * Coordinates come back relative to the layout's bounding box (top-left 0,0) so
 * the caller can both reserve exactly this rectangle and draw into it.
 */
export function layoutMindmap(nodes: MindmapInput[]): { placements: MindmapPlacement[]; width: number; height: number } {
    if (nodes.length === 0) return { placements: [], width: 0, height: 0 };

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const root = nodes.find((n) => !n.parentId) || nodes[0];

    // Resolve every node's parent, repairing anything that doesn't lead back to
    // the root: an id the model never defined, a self-reference, or a cycle.
    // All three orphan a branch from the root's traversal, and an orphaned
    // branch is simply never drawn — the nodes vanish with no error.
    const parentOf = new Map<string, string>();
    for (const node of nodes) {
        if (node.id === root.id) continue;
        const declared = node.parentId;
        parentOf.set(node.id, declared && declared !== node.id && byId.has(declared) ? declared : root.id);
    }

    const reachesRoot = (id: string): boolean => {
        const walked = new Set<string>([id]);
        let cursor = parentOf.get(id);
        while (cursor) {
            if (cursor === root.id) return true;
            if (walked.has(cursor)) return false;
            walked.add(cursor);
            cursor = parentOf.get(cursor);
        }
        return false;
    };

    for (const node of nodes) {
        if (node.id === root.id) continue;
        if (!reachesRoot(node.id)) parentOf.set(node.id, root.id);
    }

    const childrenMap = new Map<string, MindmapInput[]>();
    for (const node of nodes) {
        if (node.id === root.id) continue;
        const parentId = parentOf.get(node.id)!;
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId)!.push(node);
    }

    // The tree is acyclic by construction now; `seen` keeps traversal total
    // regardless, and marks which nodes each side has already claimed.
    const seen = new Set<string>([root.id]);
    const childrenOf = (id: string) => (childrenMap.get(id) || []).filter((c) => !seen.has(c.id));

    const leafCount = (id: string, guard = new Set<string>()): number => {
        if (guard.has(id)) return 1;
        guard.add(id);
        const kids = childrenMap.get(id) || [];
        if (kids.length === 0) return 1;
        return kids.reduce((sum, kid) => sum + leafCount(kid.id, guard), 0);
    };

    // Split the root's branches between the two sides, always feeding the
    // lighter one, so the map stays balanced rather than lopsided.
    const topLevel = [...(childrenMap.get(root.id) || [])]
        .sort((a, b) => leafCount(b.id) - leafCount(a.id));
    const sides: { branches: MindmapInput[]; weight: number }[] = [
        { branches: [], weight: 0 },
        { branches: [], weight: 0 },
    ];
    for (const branch of topLevel) {
        const target = sides[0].weight <= sides[1].weight ? sides[0] : sides[1];
        target.branches.push(branch);
        target.weight += leafCount(branch.id);
    }

    const placements: MindmapPlacement[] = [];
    const columnStep = MINDMAP_NODE_SIZE.width + MINDMAP_H_GAP;

    const layoutSide = (branches: MindmapInput[], direction: 1 | -1) => {
        const start = placements.length;
        let cursor = 0;

        const walk = (node: MindmapInput, parentId: string, depth: number): number => {
            seen.add(node.id);
            const kids = childrenOf(node.id);
            kids.forEach((kid) => seen.add(kid.id));

            let centerY: number;
            if (kids.length === 0) {
                centerY = cursor + MINDMAP_NODE_SIZE.height / 2;
                cursor += MINDMAP_NODE_SIZE.height + MINDMAP_V_GAP;
            } else {
                const childCenters = kids.map((kid) => walk(kid, node.id, depth + 1));
                centerY = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
            }

            placements.push({
                id: node.id,
                parent: parentId,
                x: direction * depth * columnStep - MINDMAP_NODE_SIZE.width / 2,
                y: centerY - MINDMAP_NODE_SIZE.height / 2,
                width: MINDMAP_NODE_SIZE.width,
                height: MINDMAP_NODE_SIZE.height,
                depth,
            });
            return centerY;
        };

        branches.forEach((branch) => walk(branch, root.id, 1));

        // Each side is packed from y=0 downward; recentre it on the root.
        const height = Math.max(0, cursor - MINDMAP_V_GAP);
        for (let i = start; i < placements.length; i++) placements[i].y -= height / 2;
    };

    layoutSide(sides[0].branches, 1);
    layoutSide(sides[1].branches, -1);

    placements.push({
        id: root.id,
        parent: null,
        x: -MINDMAP_ROOT_SIZE.width / 2,
        y: -MINDMAP_ROOT_SIZE.height / 2,
        width: MINDMAP_ROOT_SIZE.width,
        height: MINDMAP_ROOT_SIZE.height,
        depth: 0,
    });

    const minX = Math.min(...placements.map((p) => p.x));
    const minY = Math.min(...placements.map((p) => p.y));
    const maxX = Math.max(...placements.map((p) => p.x + p.width));
    const maxY = Math.max(...placements.map((p) => p.y + p.height));
    for (const placement of placements) {
        placement.x -= minX;
        placement.y -= minY;
    }

    return { placements, width: maxX - minX, height: maxY - minY };
}

/**
 * Answer-derived maps read better as a handful of related piles than a wide,
 * abstract tree. Each first-level section becomes an anchor; everything below
 * it stays tightly stacked in the same cluster, while the original parent
 * links are preserved so no idea becomes a disconnected ornament.
 */
export function layoutClusteredMindmap(nodes: MindmapInput[]): { placements: MindmapPlacement[]; width: number; height: number } {
    if (nodes.length === 0) return { placements: [], width: 0, height: 0 };

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const root = nodes.find((node) => !node.parentId) || nodes[0];
    const parentOf = new Map<string, string>();

    for (const node of nodes) {
        if (node.id === root.id) continue;
        const requestedParent = node.parentId;
        parentOf.set(node.id, requestedParent && requestedParent !== node.id && byId.has(requestedParent)
            ? requestedParent
            : root.id);
    }

    const reachesRoot = (id: string): boolean => {
        const walked = new Set<string>([id]);
        let cursor = parentOf.get(id);
        while (cursor) {
            if (cursor === root.id) return true;
            if (walked.has(cursor)) return false;
            walked.add(cursor);
            cursor = parentOf.get(cursor);
        }
        return false;
    };
    for (const node of nodes) {
        if (node.id !== root.id && !reachesRoot(node.id)) parentOf.set(node.id, root.id);
    }

    const children = new Map<string, MindmapInput[]>();
    for (const node of nodes) {
        if (node.id === root.id) continue;
        const parent = parentOf.get(node.id)!;
        const siblings = children.get(parent) || [];
        siblings.push(node);
        children.set(parent, siblings);
    }

    const sections = children.get(root.id) || [];
    if (sections.length === 0) {
        return {
            placements: [{
                id: root.id,
                parent: null,
                x: 0,
                y: 0,
                width: MINDMAP_ROOT_SIZE.width,
                height: MINDMAP_ROOT_SIZE.height,
                depth: 0,
            }],
            width: MINDMAP_ROOT_SIZE.width,
            height: MINDMAP_ROOT_SIZE.height,
        };
    }
    const placements: MindmapPlacement[] = [];
    const CLUSTER_WIDTH = MINDMAP_NODE_SIZE.width + 36;
    const CLUSTER_GAP_X = 64;
    const CLUSTER_GAP_Y = 66;
    const STACK_GAP = 14;
    const columns = sections.length > 1 ? 2 : 1;
    const clusterHeights: number[] = [];
    const sectionStacks: Array<Array<{ node: MindmapInput; depth: number }>> = [];

    const collect = (node: MindmapInput, depth: number, stack: Array<{ node: MindmapInput; depth: number }>, guard: Set<string>) => {
        if (guard.has(node.id)) return;
        guard.add(node.id);
        stack.push({ node, depth });
        for (const child of children.get(node.id) || []) collect(child, depth + 1, stack, guard);
    };

    for (const section of sections) {
        const stack: Array<{ node: MindmapInput; depth: number }> = [];
        collect(section, 1, stack, new Set<string>());
        sectionStacks.push(stack);
        clusterHeights.push(Math.max(MINDMAP_NODE_SIZE.height, stack.length * MINDMAP_NODE_SIZE.height + Math.max(0, stack.length - 1) * STACK_GAP));
    }

    const rowHeights: number[] = [];
    for (let index = 0; index < clusterHeights.length; index += columns) {
        rowHeights.push(Math.max(...clusterHeights.slice(index, index + columns)));
    }
    const rowOffsets = rowHeights.reduce<number[]>((offsets, _height, row) => {
        offsets.push(row === 0 ? 0 : offsets[row - 1] + rowHeights[row - 1] + CLUSTER_GAP_Y);
        return offsets;
    }, []);

    sectionStacks.forEach((stack, sectionIndex) => {
        const column = sectionIndex % columns;
        const row = Math.floor(sectionIndex / columns);
        const clusterX = MINDMAP_ROOT_SIZE.width + 112 + column * (CLUSTER_WIDTH + CLUSTER_GAP_X);
        const clusterY = rowOffsets[row];
        stack.forEach(({ node, depth }, itemIndex) => {
            placements.push({
                id: node.id,
                parent: parentOf.get(node.id) || root.id,
                x: clusterX + Math.min(depth - 1, 2) * 18,
                y: clusterY + itemIndex * (MINDMAP_NODE_SIZE.height + STACK_GAP),
                width: MINDMAP_NODE_SIZE.width,
                height: MINDMAP_NODE_SIZE.height,
                depth,
                clusterRoot: itemIndex === 0,
            });
        });
    });

    const clusterHeight = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rowHeights.length - 1) * CLUSTER_GAP_Y;
    placements.push({
        id: root.id,
        parent: null,
        x: 0,
        y: Math.max(0, clusterHeight / 2 - MINDMAP_ROOT_SIZE.height / 2),
        width: MINDMAP_ROOT_SIZE.width,
        height: MINDMAP_ROOT_SIZE.height,
        depth: 0,
    });

    const width = MINDMAP_ROOT_SIZE.width + 112 + columns * CLUSTER_WIDTH + Math.max(0, columns - 1) * CLUSTER_GAP_X;
    return { placements, width, height: Math.max(MINDMAP_ROOT_SIZE.height, clusterHeight) };
}
