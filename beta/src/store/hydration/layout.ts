import type { RelatedEdge } from './types';

/**
 * Where each node sits.
 *
 * Related nodes are placed together and connectors kept short, because a map
 * whose lines cross the whole screen is harder to read than the card it came
 * from. Three arrangements share the file: the cluster packing used by the
 * mind map, the top-down tree used when a document has real headings, and the
 * bento grid used when the whole canvas is tidied up.
 */

// ---------------------------------------------------------------------------
// Layout — cluster-aware compact packing
// ---------------------------------------------------------------------------

export interface ChunkSize {
    width: number;
    height: number;
}

export interface LayoutInput {
    id: string;
    type: 'fused-note' | 'block';
    /** Optional hierarchy parent (heading section → child). */
    sourceId?: string;
}

export interface LayoutOptions {
    originX: number;
    originY: number;
    gridStep: number;
}

/**
 * Position nodes so that RELATED groups sit physically together and connectors
 * stay short and local. Nodes are unioned into clusters via (hierarchy links ∪
 * related edges); each cluster is laid out as a tidy block (sections fan their
 * children below them, free nodes flow in a wrapped grid), and clusters are
 * packed into a wrapping grid with clear gaps between them.
 */
export function layoutChunks<T extends LayoutInput>(
    nodes: T[],
    relatedEdges: RelatedEdge[],
    sizeOf: (node: T) => ChunkSize,
    opts: LayoutOptions
): Map<string, { x: number; y: number }> {
    const { originX, originY, gridStep } = opts;
    const snap = (v: number) => Math.round(v / gridStep) * gridStep;

    const COL_GAP = gridStep * 3; // horizontal gap between sibling nodes
    const ROW_GAP = gridStep * 2; // vertical gap (parent→children, stacked rows)
    const CLUSTER_GAP = gridStep * 5; // gap between separate clusters
    const CLUSTER_MAX_WIDTH = 900; // wrap roots within a cluster past this width
    const GRID_MAX_WIDTH = 1700; // wrap clusters past this total width
    const MAX_ITEMS_PER_ROW = 3;

    const positions = new Map<string, { x: number; y: number }>();
    if (nodes.length === 0) return positions;

    const byId = new Map<string, T>(nodes.map((n) => [n.id, n]));

    // Hierarchy tree (children + roots).
    const childMap = new Map<string, T[]>();
    nodes.forEach((n) => childMap.set(n.id, []));
    const roots: T[] = [];
    nodes.forEach((n) => {
        if (n.sourceId && childMap.has(n.sourceId)) childMap.get(n.sourceId)!.push(n);
        else roots.push(n);
    });

    // Union-find over (hierarchy links ∪ related edges) → clusters.
    const parent = new Map<string, string>();
    nodes.forEach((n) => parent.set(n.id, n.id));
    const find = (x: string): string => {
        let r = x;
        while (parent.get(r) !== r) r = parent.get(r)!;
        let cur = x;
        while (parent.get(cur) !== r) {
            const next = parent.get(cur)!;
            parent.set(cur, r);
            cur = next;
        }
        return r;
    };
    const union = (a: string, b: string) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };
    nodes.forEach((n) => {
        if (n.sourceId && byId.has(n.sourceId)) union(n.id, n.sourceId);
    });
    relatedEdges.forEach((e) => {
        if (byId.has(e.source) && byId.has(e.target)) union(e.source, e.target);
    });

    // Group roots by cluster, preserving document order.
    const clusterRoots = new Map<string, T[]>();
    roots.forEach((r) => {
        const key = find(r.id);
        if (!clusterRoots.has(key)) clusterRoots.set(key, []);
        clusterRoots.get(key)!.push(r);
    });

    // Relative positions filled by the subtree layout.
    const rel = new Map<string, { x: number; y: number }>();
    const sizeById = (id: string) => sizeOf(byId.get(id)!);

    const layoutSubtree = (id: string, x: number, y: number): { w: number; h: number } => {
        const { width: w, height: h } = sizeById(id);
        const kids = childMap.get(id) || [];
        if (kids.length === 0) {
            rel.set(id, { x, y });
            return { w: w + COL_GAP, h: h + ROW_GAP };
        }
        let childY = y + h + ROW_GAP;
        let maxRowW = 0;
        let row: T[] = [];
        const rows: T[][] = [];
        kids.forEach((k) => {
            if (row.length >= MAX_ITEMS_PER_ROW) {
                rows.push(row);
                row = [];
            }
            row.push(k);
        });
        if (row.length) rows.push(row);
        rows.forEach((r) => {
            let childX = x;
            let rowW = 0;
            let rowH = 0;
            r.forEach((k) => {
                const d = layoutSubtree(k.id, childX, childY);
                childX += d.w;
                rowW += d.w;
                if (d.h > rowH) rowH = d.h;
            });
            childY += rowH;
            if (rowW > maxRowW) maxRowW = rowW;
        });
        const totalW = maxRowW > 0 ? maxRowW - COL_GAP : 0;
        rel.set(id, { x: x + totalW / 2 - w / 2, y });
        return { w: Math.max(w + COL_GAP, maxRowW), h: childY - y };
    };

    interface ClusterBox {
        ids: string[];
        w: number;
        h: number;
        minX: number;
        minY: number;
    }
    const clusters: ClusterBox[] = [];

    for (const [key, rs] of clusterRoots) {
        const memberIds = nodes.filter((n) => find(n.id) === key).map((n) => n.id);

        // Flow the cluster's roots in a wrapped grid (keeps clusters compact and
        // roughly square instead of one tall column).
        let cx = 0;
        let cy = 0;
        let rowH = 0;
        rs.forEach((root) => {
            let d = layoutSubtree(root.id, cx, cy);
            if (cx > 0 && cx + d.w > CLUSTER_MAX_WIDTH) {
                cx = 0;
                cy += rowH + ROW_GAP;
                rowH = 0;
                d = layoutSubtree(root.id, cx, cy);
            }
            cx += d.w;
            if (d.h > rowH) rowH = d.h;
        });

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        memberIds.forEach((id) => {
            const p = rel.get(id);
            if (!p) return;
            const s = sizeById(id);
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + s.width);
            maxY = Math.max(maxY, p.y + s.height);
        });
        if (!isFinite(minX)) continue;
        clusters.push({ ids: memberIds, w: maxX - minX, h: maxY - minY, minX, minY });
    }

    // Pack clusters into a wrapping grid.
    let curX = originX;
    let curY = originY;
    let rowH = 0;
    for (const cb of clusters) {
        if (curX > originX && curX + cb.w > originX + GRID_MAX_WIDTH) {
            curX = originX;
            curY += rowH + CLUSTER_GAP;
            rowH = 0;
        }
        const dx = curX - cb.minX;
        const dy = curY - cb.minY;
        cb.ids.forEach((id) => {
            const p = rel.get(id);
            if (!p) return;
            positions.set(id, { x: snap(p.x + dx), y: snap(p.y + dy) });
        });
        curX += cb.w + CLUSTER_GAP;
        if (cb.h > rowH) rowH = cb.h;
    }

    return positions;
}

export interface DocumentTreeLayout {
    /** Positions for every content-bearing chapter and section. */
    positions: Map<string, { x: number; y: number }>;
    /** Top-level chapters, in document order. */
    rootIds: string[];
}

/**
 * Lay a note out as a document tree. Main sections form the first row and
 * every subsection grows beneath its parent, mirroring the source note rather
 * than inventing a central title card. Each subtree reserves its full bounds
 * before placement, so cards of very different sizes never overlap.
 */
export function layoutDocumentTree<T extends LayoutInput>(
    nodes: T[],
    sizeOf: (node: T) => ChunkSize,
    opts: { gridStep: number; maxRootRowWidth?: number },
): DocumentTreeLayout {
    const positions = new Map<string, { x: number; y: number }>();
    if (nodes.length === 0) return { positions, rootIds: [] };

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const childrenById = new Map<string, T[]>();
    nodes.forEach((node) => childrenById.set(node.id, []));
    const roots: T[] = [];
    nodes.forEach((node) => {
        if (node.sourceId && childrenById.has(node.sourceId)) {
            childrenById.get(node.sourceId)!.push(node);
        } else {
            roots.push(node);
        }
    });

    const snap = (value: number) => Math.round(value / opts.gridStep) * opts.gridStep;
    const siblingGap = opts.gridStep * 1.5;
    // A full two-grid-unit gutter keeps the branches readable at a glance and
    // gives connector lines room to leave and enter their cards cleanly.
    const levelGap = opts.gridStep * 2;
    const rootGap = opts.gridStep * 3;
    // Keep sibling chapters on one aligned top row when a desktop viewport can
    // comfortably show them together. A narrower caller can opt into a tighter
    // cap and let wider trees wrap to a separate row.
    const maxRootRowWidth = opts.maxRootRowWidth ?? opts.gridStep * 44;

    interface TreeBox {
        width: number;
        height: number;
        /** Positions are relative to the top-left of this tree's reserved box. */
        local: Map<string, { x: number; y: number }>;
    }

    const buildTree = (id: string, ancestry = new Set<string>()): TreeBox => {
        const node = byId.get(id);
        if (!node) return { width: 0, height: 0, local: new Map() };
        const size = sizeOf(node);
        if (ancestry.has(id)) {
            return { width: size.width, height: size.height, local: new Map([[id, { x: 0, y: 0 }]]) };
        }

        const nextAncestry = new Set(ancestry);
        nextAncestry.add(id);
        const children = (childrenById.get(id) ?? [])
            .map((child) => buildTree(child.id, nextAncestry))
            .filter((box) => box.width > 0 && box.height > 0);

        if (children.length === 0) {
            return { width: size.width, height: size.height, local: new Map([[id, { x: 0, y: 0 }]]) };
        }

        const childrenWidth = children.reduce((total, box) => total + box.width, 0)
            + siblingGap * (children.length - 1);
        const width = Math.max(size.width, childrenWidth);
        const tallestChild = Math.max(...children.map((box) => box.height));
        const local = new Map<string, { x: number; y: number }>();
        local.set(id, { x: (width - size.width) / 2, y: 0 });

        let childX = (width - childrenWidth) / 2;
        children.forEach((box) => {
            box.local.forEach((position, childId) => {
                local.set(childId, {
                    x: childX + position.x,
                    y: size.height + levelGap + position.y,
                });
            });
            childX += box.width + siblingGap;
        });

        return {
            width,
            height: size.height + levelGap + tallestChild,
            local,
        };
    };

    const boxes = roots.map((root) => ({ root, box: buildTree(root.id) }));
    const rows: Array<typeof boxes> = [];
    let row: typeof boxes = [];
    let rowWidth = 0;
    boxes.forEach((entry) => {
        const nextWidth = row.length === 0 ? entry.box.width : rowWidth + rootGap + entry.box.width;
        if (row.length > 0 && nextWidth > maxRootRowWidth) {
            rows.push(row);
            row = [];
            rowWidth = 0;
        }
        rowWidth = row.length === 0 ? entry.box.width : rowWidth + rootGap + entry.box.width;
        row.push(entry);
    });
    if (row.length > 0) rows.push(row);

    let rowY = 0;
    rows.forEach((entries) => {
        const width = entries.reduce((total, entry) => total + entry.box.width, 0)
            + rootGap * (entries.length - 1);
        const height = Math.max(...entries.map((entry) => entry.box.height));
        let rowX = -width / 2;
        entries.forEach(({ box }) => {
            box.local.forEach((position, id) => {
                positions.set(id, { x: snap(rowX + position.x), y: snap(rowY + position.y) });
            });
            rowX += box.width + rootGap;
        });
        rowY += height + rootGap;
    });

    return { positions, rootIds: roots.map((root) => root.id) };
}

/** Minimal input required by the canvas-wide bento organizer. */
export interface BentoLayoutInput {
    id: string;
}

/**
 * Lay out a mixed canvas as one broad bento composition.
 *
 * - Explicit connector components are treated as mind maps and retain a clear
 *   left-to-right root → branch reading direction.
 * - Unconnected nodes are clustered by semantic relatedness and tiled in
 *   compact, mostly-horizontal grids.
 * - The resulting component boxes are packed into several columns rather than
 *   a tall vertical list.
 *
 * This function only calculates positions; it never creates or rewrites edges.
 */
export function layoutCanvasBento<T extends BentoLayoutInput>(
    nodes: T[],
    semanticEdges: RelatedEdge[],
    connectorEdges: RelatedEdge[],
    sizeOf: (node: T) => ChunkSize,
    opts: LayoutOptions,
): Map<string, { x: number; y: number }> {
    const { originX, originY, gridStep } = opts;
    const snap = (value: number) => Math.round(value / gridStep) * gridStep;
    // Card positions still snap to the 56px canvas grid, but using that entire
    // unit as whitespace makes a bento feel scattered. A compact sub-grid keeps
    // tiles and mind-map levels visually joined; separate groups get twice it.
    const DENSE_GAP = Math.max(16, Math.round(gridStep / 4));
    const INNER_GAP = DENSE_GAP;
    const BRANCH_GAP = DENSE_GAP;
    const GROUP_GAP = DENSE_GAP * 2;
    const positions = new Map<string, { x: number; y: number }>();
    if (nodes.length === 0) return positions;

    const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    const byId = new Map(ordered.map((node) => [node.id, node]));
    const validConnectorEdges = connectorEdges.filter((edge) =>
        edge.source !== edge.target && byId.has(edge.source) && byId.has(edge.target)
    );

    const createUnionFind = (ids: string[]) => {
        const parent = new Map(ids.map((id) => [id, id]));
        const find = (id: string): string => {
            let root = id;
            while (parent.get(root) !== root) root = parent.get(root)!;
            let current = id;
            while (parent.get(current) !== root) {
                const next = parent.get(current)!;
                parent.set(current, root);
                current = next;
            }
            return root;
        };
        const union = (a: string, b: string) => {
            const rootA = find(a);
            const rootB = find(b);
            if (rootA !== rootB) parent.set(rootA, rootB);
        };
        return { find, union };
    };

    // First reserve every real connected component as a mind map. Semantic
    // similarity can influence the remaining cards but must not blur a graph's
    // intentional topology.
    const connectorUnion = createUnionFind(ordered.map((node) => node.id));
    validConnectorEdges.forEach((edge) => connectorUnion.union(edge.source, edge.target));
    const connectorMembers = new Map<string, string[]>();
    ordered.forEach((node) => {
        const root = connectorUnion.find(node.id);
        const members = connectorMembers.get(root) ?? [];
        members.push(node.id);
        connectorMembers.set(root, members);
    });
    const mindMapComponents = [...connectorMembers.values()]
        .filter((members) => members.length > 1)
        .sort((a, b) => a[0].localeCompare(b[0]));
    const mindMapNodeIds = new Set(mindMapComponents.flat());

    // Related but unconnected cards form the other bento regions.
    const looseIds = ordered.filter((node) => !mindMapNodeIds.has(node.id)).map((node) => node.id);
    const looseIdSet = new Set(looseIds);
    const semanticUnion = createUnionFind(looseIds);
    semanticEdges.forEach((edge) => {
        if (looseIdSet.has(edge.source) && looseIdSet.has(edge.target)) {
            semanticUnion.union(edge.source, edge.target);
        }
    });
    const semanticMembers = new Map<string, string[]>();
    looseIds.forEach((id) => {
        const root = semanticUnion.find(id);
        const members = semanticMembers.get(root) ?? [];
        members.push(id);
        semanticMembers.set(root, members);
    });

    interface ComponentBox {
        ids: string[];
        width: number;
        height: number;
        local: Map<string, { x: number; y: number }>;
    }

    const makeMindMapBox = (ids: string[]): ComponentBox => {
        const idSet = new Set(ids);
        const edges = validConnectorEdges.filter((edge) => idSet.has(edge.source) && idSet.has(edge.target));
        const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
        const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
        const indegree = new Map(ids.map((id) => [id, 0]));
        edges.forEach((edge) => {
            outgoing.get(edge.source)!.push(edge.target);
            adjacency.get(edge.source)!.push(edge.target);
            adjacency.get(edge.target)!.push(edge.source);
            indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
        });
        outgoing.forEach((targets) => targets.sort((a, b) => a.localeCompare(b)));
        adjacency.forEach((neighbors) => neighbors.sort((a, b) => a.localeCompare(b)));

        const rootCandidates = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
        const candidates = rootCandidates.length > 0 ? rootCandidates : ids;
        const rootId = [...candidates].sort((a, b) => {
            const degreeDiff = (adjacency.get(b)?.length ?? 0) - (adjacency.get(a)?.length ?? 0);
            return degreeDiff || a.localeCompare(b);
        })[0];

        const depth = new Map<string, number>([[rootId, 0]]);
        const queue = [rootId];
        const traversalOrder = [rootId];
        while (queue.length > 0) {
            const current = queue.shift()!;
            const directedFirst = [
                ...(outgoing.get(current) ?? []),
                ...(adjacency.get(current) ?? []).filter((id) => !(outgoing.get(current) ?? []).includes(id)),
            ];
            directedFirst.forEach((next) => {
                if (depth.has(next)) return;
                depth.set(next, (depth.get(current) ?? 0) + 1);
                queue.push(next);
                traversalOrder.push(next);
            });
        }

        const levels = new Map<number, string[]>();
        // BFS order keeps each parent's children together inside the next
        // column, reducing connector crossings compared with a global id sort.
        traversalOrder.forEach((id) => {
            const level = depth.get(id) ?? 0;
            const members = levels.get(level) ?? [];
            members.push(id);
            levels.set(level, members);
        });
        const maxDepth = Math.max(...levels.keys());
        const columnWidths: number[] = [];
        const columnHeights: number[] = [];
        for (let level = 0; level <= maxDepth; level++) {
            const members = levels.get(level) ?? [];
            columnWidths[level] = Math.max(...members.map((id) => sizeOf(byId.get(id)!).width));
            columnHeights[level] = members.reduce(
                (sum, id) => sum + sizeOf(byId.get(id)!).height,
                Math.max(0, members.length - 1) * INNER_GAP,
            );
        }
        const height = Math.max(...columnHeights);
        const local = new Map<string, { x: number; y: number }>();
        let x = 0;
        for (let level = 0; level <= maxDepth; level++) {
            const members = levels.get(level) ?? [];
            let y = (height - columnHeights[level]) / 2;
            members.forEach((id) => {
                const size = sizeOf(byId.get(id)!);
                local.set(id, { x, y });
                y += size.height + INNER_GAP;
            });
            x += columnWidths[level] + BRANCH_GAP;
        }
        return {
            ids,
            width: x - BRANCH_GAP,
            height,
            local,
        };
    };

    const makeSemanticBox = (ids: string[]): ComponentBox => {
        const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(ids.length * 1.35))));
        const rows = Math.ceil(ids.length / columns);
        const columnWidths = Array.from({ length: columns }, () => 0);
        const rowHeights = Array.from({ length: rows }, () => 0);
        ids.forEach((id, index) => {
            const size = sizeOf(byId.get(id)!);
            const column = index % columns;
            const row = Math.floor(index / columns);
            columnWidths[column] = Math.max(columnWidths[column], size.width);
            rowHeights[row] = Math.max(rowHeights[row], size.height);
        });
        const columnX: number[] = [];
        const rowY: number[] = [];
        columnWidths.forEach((_width, index) => {
            columnX[index] = index === 0 ? 0 : columnX[index - 1] + columnWidths[index - 1] + INNER_GAP;
        });
        rowHeights.forEach((_height, index) => {
            rowY[index] = index === 0 ? 0 : rowY[index - 1] + rowHeights[index - 1] + INNER_GAP;
        });
        const local = new Map<string, { x: number; y: number }>();
        ids.forEach((id, index) => local.set(id, {
            x: columnX[index % columns],
            y: rowY[Math.floor(index / columns)],
        }));
        return {
            ids,
            width: columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * INNER_GAP,
            height: rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows - 1) * INNER_GAP,
            local,
        };
    };

    const boxes = [
        ...mindMapComponents.map(makeMindMapBox),
        ...[...semanticMembers.values()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(makeSemanticBox),
    ];
    const columnCount = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(boxes.length * 1.5))));
    let cursorY = originY;
    for (let start = 0; start < boxes.length; start += columnCount) {
        const row = boxes.slice(start, start + columnCount);
        const rowHeight = Math.max(...row.map((box) => box.height));
        let cursorX = originX;
        row.forEach((box) => {
            const verticalOffset = (rowHeight - box.height) / 2;
            box.ids.forEach((id) => {
                const local = box.local.get(id)!;
                positions.set(id, {
                    x: snap(cursorX + local.x),
                    y: snap(cursorY + verticalOffset + local.y),
                });
            });
            cursorX += box.width + GROUP_GAP;
        });
        cursorY += rowHeight + GROUP_GAP;
    }

    return positions;
}
