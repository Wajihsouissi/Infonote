import type { StateCreator } from 'zustand';
import type { Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { getNodeBlocks, getNodeLabel } from '../../types';
import { BASE_UNIT, snapToGridValue } from '../../config/layout';
import { computeRelatednessHierarchy, computeSmartHierarchy } from '../hydration/hierarchy';
import { layoutCanvasBento, layoutChunks } from '../hydration/layout';
import { normalizeText, blockText, getBlockNodeStyle, RELEASE_SIZE_PROFILE } from '../blockNodeStyle';
import type { AppState, LayoutSlice } from '../types';

/**
 * Arranging nodes: layouts for a selection, and tidying a whole canvas.
 */
export const createLayoutSlice: StateCreator<AppState, [], [], LayoutSlice> = (set, get) => ({
    arrangeNodes: (nodeIds, mode) => {
        const { nodes, edges, currentParentId } = get();
        const selected = nodes.filter(n => nodeIds.includes(n.id));
        if (selected.length < 2) return;

        const count = selected.length;

        // Smart mode may also rebuild the connectors between the selected nodes.
        let rebuiltEdges: Edge[] | null = null;

        const getW = (n: typeof selected[0]) => n.measured?.width ?? (typeof n.style?.width === 'number' ? n.style.width : 432);
        const getH = (n: typeof selected[0]) => n.measured?.height ?? (typeof n.style?.height === 'number' ? n.style.height : 432);

        const bbox = selected.reduce((acc, n) => ({
            minX: Math.min(acc.minX, n.position.x),
            maxX: Math.max(acc.maxX, n.position.x + getW(n)),
            minY: Math.min(acc.minY, n.position.y),
            maxY: Math.max(acc.maxY, n.position.y + getH(n)),
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

        const getGridW = (n: typeof selected[0]) => Math.ceil(getW(n) / BASE_UNIT) * BASE_UNIT;
        const getGridH = (n: typeof selected[0]) => Math.ceil(getH(n) / BASE_UNIT) * BASE_UNIT;

        const centerX = (bbox.minX + bbox.maxX) / 2;
        const centerY = (bbox.minY + bbox.maxY) / 2;
        const gap = BASE_UNIT;

        const positions: Record<string, { x: number; y: number }> = {};

        switch (mode) {
            case 'grid': {
                const cols = Math.ceil(Math.sqrt(count));
                const cellW = Math.max(...selected.map(getGridW));
                const cellH = Math.max(...selected.map(getGridH));
                const rows = Math.ceil(count / cols);
                const gridW = cols * cellW + (cols - 1) * gap;
                const gridH = rows * cellH + (rows - 1) * gap;
                const ox = snapToGridValue(centerX - gridW / 2);
                const oy = snapToGridValue(centerY - gridH / 2);

                selected.forEach((node, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    positions[node.id] = {
                        x: snapToGridValue(ox + col * (cellW + gap)),
                        y: snapToGridValue(oy + row * (cellH + gap)),
                    };
                });
                break;
            }

            case 'circle': {
                const diagonals = selected.map(n => Math.sqrt(getGridW(n) ** 2 + getGridH(n) ** 2));
                const maxDiag = Math.max(...diagonals);
                const angleStep = (2 * Math.PI) / count;
                const minRadius = count <= 2
                    ? (maxDiag + gap)
                    : (maxDiag + gap) / (2 * Math.sin(angleStep / 2));
                const radius = snapToGridValue(Math.max(BASE_UNIT * 2, minRadius));

                selected.forEach((node, i) => {
                    const angle = -Math.PI / 2 + angleStep * i;
                    positions[node.id] = {
                        x: snapToGridValue(centerX + radius * Math.cos(angle) - getW(node) / 2),
                        y: snapToGridValue(centerY + radius * Math.sin(angle) - getH(node) / 2),
                    };
                });
                break;
            }

            case 'flow': {
                const sorted = [...selected].sort((a, b) => (a.position.x + getW(a) / 2) - (b.position.x + getW(b) / 2));
                const totalW = sorted.reduce((s, n) => s + getGridW(n), 0) + (count - 1) * gap;
                let cx = snapToGridValue(centerX - totalW / 2);
                sorted.forEach(node => {
                    positions[node.id] = {
                        x: snapToGridValue(cx),
                        y: snapToGridValue(centerY - getH(node) / 2),
                    };
                    cx += getGridW(node) + gap;
                });
                break;
            }

            case 'horizontal-row': {
                const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
                const totalW = sorted.reduce((s, n) => s + getGridW(n), 0) + (count - 1) * gap;
                let cx = snapToGridValue(centerX - totalW / 2);
                sorted.forEach(node => {
                    positions[node.id] = {
                        x: snapToGridValue(cx),
                        y: snapToGridValue(centerY - getH(node) / 2),
                    };
                    cx += getGridW(node) + gap;
                });
                break;
            }

            case 'vertical-column': {
                const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
                const totalH = sorted.reduce((s, n) => s + getGridH(n), 0) + (count - 1) * gap;
                let cy = snapToGridValue(centerY - totalH / 2);
                sorted.forEach(node => {
                    positions[node.id] = {
                        x: snapToGridValue(centerX - getW(node) / 2),
                        y: snapToGridValue(cy),
                    };
                    cy += getGridH(node) + gap;
                });
                break;
            }

            case 'mindmap-horizontal': {
                const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
                const root = sorted[0];
                const children = sorted.slice(1);
                const maxChildW = children.length > 0 ? Math.max(...children.map(getGridW)) : 0;
                const totalChildrenH = children.reduce((s, n) => s + getGridH(n), 0) + Math.max(0, children.length - 1) * gap;
                
                const cx = snapToGridValue(centerX - (getGridW(root) + gap + maxChildW) / 2);
                positions[root.id] = {
                    x: cx,
                    y: snapToGridValue(centerY - getH(root) / 2),
                };

                const cxChildren = cx + getGridW(root) + gap;
                let cy = snapToGridValue(centerY - totalChildrenH / 2);
                children.forEach(child => {
                    positions[child.id] = {
                        x: cxChildren,
                        y: snapToGridValue(cy),
                    };
                    cy += getGridH(child) + gap;
                });
                break;
            }

            case 'mindmap-vertical': {
                const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
                const root = sorted[0];
                const children = sorted.slice(1);
                const maxChildH = children.length > 0 ? Math.max(...children.map(getGridH)) : 0;
                const totalChildrenW = children.reduce((s, n) => s + getGridW(n), 0) + Math.max(0, children.length - 1) * gap;
                
                const cy = snapToGridValue(centerY - (getGridH(root) + gap + maxChildH) / 2);
                positions[root.id] = {
                    x: snapToGridValue(centerX - getW(root) / 2),
                    y: cy,
                };

                const cyChildren = cy + getGridH(root) + gap;
                let cx = snapToGridValue(centerX - totalChildrenW / 2);
                children.forEach(child => {
                    positions[child.id] = {
                        x: snapToGridValue(cx),
                        y: cyChildren,
                    };
                    cx += getGridW(child) + gap;
                });
                break;
            }

            case 'related-clusters': {
                // Group selected nodes by content relatedness and pack each cluster
                // compactly, so related cards sit together and connectors stay short.
                const items = selected.map(n => {
                    const blocks = getNodeBlocks(n.data);
                    return {
                        id: n.id,
                        blocks: blocks && blocks.length > 0
                            ? blocks
                            : [{ type: 'text', content: getNodeLabel(n.data) || '' }],
                    };
                });
                const forest = computeSmartHierarchy(items);
                const layoutInputs = selected.map(n => ({
                    id: n.id,
                    type: (n.type === 'block' ? 'block' : 'fused-note') as 'block' | 'fused-note',
                    sourceId: forest.parent.get(n.id),
                }));
                const sizeMap = new Map(selected.map(n => [n.id, { width: getGridW(n), height: getGridH(n) }]));
                const computed = layoutChunks(
                    layoutInputs,
                    forest.edges,
                    (node) => sizeMap.get(node.id) || { width: 432, height: 200 },
                    {
                        originX: snapToGridValue(bbox.minX),
                        originY: snapToGridValue(bbox.minY),
                        gridStep: BASE_UNIT,
                    }
                );
                computed.forEach((p, id) => { positions[id] = p; });

                // Rebuild connectors: drop existing edges that link two selected
                // nodes, then draw the clean relatedness tree (default style).
                const selectedSet = new Set(nodeIds);
                const edgeParentId = currentParentId ?? null;
                const keptEdges = edges.filter(
                    e => !(selectedSet.has(e.source) && selectedSet.has(e.target))
                );
                const forestEdges = forest.edges.map(e => ({
                    id: uuidv4(),
                    source: e.source,
                    target: e.target,
                    type: 'centered',
                    data: { parentId: edgeParentId },
                }) as Edge);
                rebuiltEdges = [...keptEdges, ...forestEdges];
                break;
            }
        }

        set({
            nodes: nodes.map(n => (positions[n.id] ? { ...n, position: positions[n.id] } : n)),
            ...(rebuiltEdges ? { edges: rebuiltEdges } : {}),
        });
    },

    organizeCanvas: () => {
        const { nodes, edges, currentParentId } = get();
        const parentId = currentParentId ?? null;
        const activeNodes = nodes
            .filter((node) => (node.parentId ?? null) === parentId)
            .sort((a, b) => a.id.localeCompare(b.id));

        if (activeNodes.length < 2) return 0;

        const nodeIds = new Set(activeNodes.map((node) => node.id));
        const estimatedBlockSize = (node: typeof activeNodes[number]) => {
            if (node.type !== 'block') return undefined;
            const blocks = getNodeBlocks(node.data);
            if (!blocks || blocks.length !== 1) return undefined;
            const block = blocks[0];
            const intrinsicTypes = new Set([
                'text', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered',
                'todo', 'callout', 'code', 'quote', 'link', 'toggle',
            ]);
            if (!intrinsicTypes.has(block.type)) return undefined;
            if (block.type === 'link'
                && block.content.trim()
                && (block.metadata?.displayMode ?? 'bookmark') !== 'text') return undefined;
            const profile = getBlockNodeStyle(block, RELEASE_SIZE_PROFILE);
            const textLength = normalizeText(blockText(block.content)).length;
            const intrinsicWidth = Math.max(260, Math.min(432, textLength * 6 + 60));
            const userWidth = 'userWidth' in node.data && typeof node.data.userWidth === 'number'
                ? node.data.userWidth
                : undefined;
            const userHeight = 'userHeight' in node.data && typeof node.data.userHeight === 'number'
                ? node.data.userHeight
                : undefined;
            return {
                width: userWidth ?? intrinsicWidth,
                height: userHeight ?? profile.height,
            };
        };
        const widthOf = (node: typeof activeNodes[number]) => {
            const intrinsic = estimatedBlockSize(node);
            // Auto-sized blocks can retain a wide, stale measurement while
            // culled. Their content-derived footprint predicts the width they
            // will actually render at after organization.
            if (intrinsic) return intrinsic.width;
            return node.measured?.width
                ?? (typeof node.style?.width === 'number' ? node.style.width : 432);
        };
        const heightOf = (node: typeof activeNodes[number]) => {
            const intrinsic = estimatedBlockSize(node);
            if (intrinsic) return intrinsic.height;
            return node.measured?.height
                ?? (typeof node.style?.height === 'number' ? node.style.height : 432);
        };
        const gridWidthOf = (node: typeof activeNodes[number]) =>
            Math.ceil(widthOf(node) / BASE_UNIT) * BASE_UNIT;
        const gridHeightOf = (node: typeof activeNodes[number]) =>
            Math.ceil(heightOf(node) / BASE_UNIT) * BASE_UNIT;

        const originalBounds = activeNodes.reduce((bounds, node) => ({
            minX: Math.min(bounds.minX, node.position.x),
            minY: Math.min(bounds.minY, node.position.y),
            maxX: Math.max(bounds.maxX, node.position.x + widthOf(node)),
            maxY: Math.max(bounds.maxY, node.position.y + heightOf(node)),
        }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

        const relatedness = computeRelatednessHierarchy(activeNodes.map((node) => {
            const blocks = getNodeBlocks(node.data);
            const description = 'description' in node.data ? node.data.description : undefined;
            const stringContent = 'content' in node.data && typeof node.data.content === 'string'
                ? node.data.content
                : undefined;
            const fallbackText = [getNodeLabel(node.data), description, stringContent]
                .filter((value): value is string => Boolean(value?.trim()))
                .join(' ');
            return {
                id: node.id,
                blocks: blocks && blocks.length > 0
                    ? blocks
                    : [{ type: 'text', content: fallbackText }],
            };
        }));

        const sizes = new Map(activeNodes.map((node) => [node.id, {
            width: gridWidthOf(node),
            height: gridHeightOf(node),
        }]));

        // Real connectors are another useful relationship signal, but are never
        // rewritten by this action. They only help the layout keep linked cards
        // near one another.
        const connectorRelationships = edges
            .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
            .map((edge) => ({ source: edge.source, target: edge.target, score: 1 }));
        const provisional = layoutCanvasBento(
            activeNodes.map((node) => ({ id: node.id })),
            relatedness.edges,
            connectorRelationships,
            (node) => sizes.get(node.id) ?? { width: 432, height: 432 },
            { originX: 0, originY: 0, gridStep: BASE_UNIT }
        );

        // Keep the layout centred where the user's nodes already are. This
        // changes positions only; React Flow's camera is deliberately untouched.
        const organizedBounds = activeNodes.reduce((bounds, node) => {
            const position = provisional.get(node.id) ?? node.position;
            return {
                minX: Math.min(bounds.minX, position.x),
                minY: Math.min(bounds.minY, position.y),
                maxX: Math.max(bounds.maxX, position.x + widthOf(node)),
                maxY: Math.max(bounds.maxY, position.y + heightOf(node)),
            };
        }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
        const offsetX = snapToGridValue(
            (originalBounds.minX + originalBounds.maxX - organizedBounds.minX - organizedBounds.maxX) / 2
        );
        const offsetY = snapToGridValue(
            (originalBounds.minY + originalBounds.maxY - organizedBounds.minY - organizedBounds.maxY) / 2
        );

        const positions = new Map<string, { x: number; y: number }>();
        provisional.forEach((position, id) => positions.set(id, {
            x: snapToGridValue(position.x + offsetX),
            y: snapToGridValue(position.y + offsetY),
        }));

        set({
            nodes: nodes.map((node) => {
                const position = positions.get(node.id);
                return position ? { ...node, position } : node;
            }),
        });
        return activeNodes.length;
    },
});
