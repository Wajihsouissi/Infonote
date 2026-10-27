import type { StateCreator } from 'zustand';
import type { Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { type AppNode, getNodeBlocks, getNodeLabel } from '../../types';
import type { Block } from '../../features/editor/types';
import { normalizeBlockIds } from '../../features/editor/document/blockIdentity';
import { MIN_FUSED_SIZE, BASE_UNIT, snapToGridValue, ICON_SIZE } from '../../config/layout';
import { computeParentContentUpdate } from '../contentSync';
import { withoutHistory } from '../temporalControl';
import { normalizeText, getBlockNodeStyle, createBlockNode as createStandaloneBlockNode, buildRadialCluster as buildRadialClusterFromCenter, RELEASE_SIZE_PROFILE } from '../blockNodeStyle';
import { scheduleParentSync } from '../graphHelpers';
import type { AppState, NodeContentSlice } from '../types';

/**
 * Moving content between nodes: releasing a card into blocks, splitting,
 * pages extracted from blocks, fusing, and keeping a parent note in step with
 * the canvas inside it.
 */
export const createNodeContentSlice: StateCreator<AppState, [], [], NodeContentSlice> = (set, get) => ({
    releaseNodeContentToBlocks: (nodeId: string, centerPosition?: { x: number; y: number }, skipConfirm?: boolean) => {

        const { nodes, edges, currentParentId } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);
        if (!sourceNode) return;

        const rawContent = 'content' in sourceNode.data ? sourceNode.data.content : undefined;
        const isEmptyBlock = (b: Block | null | undefined) => {
            if (!b) return true;
            if (b.type === 'divider') return true;
            if (b.type === 'table') {
                const rows = b.metadata?.rows;
                if (!Array.isArray(rows) || rows.length === 0) return true;
                return rows.every((row) =>
                    Array.isArray(row) && row.every((cell) => normalizeText(String(cell)).length === 0)
                );
            }
            if (b.type === 'columns') {
                const cols = b.metadata?.columns;
                return !Array.isArray(cols) || cols.length === 0;
            }
            // A board's content is its title, which is usually blank — judge it
            // by its pictures, or every gallery would be released as empty.
            if (b.type === 'gallery') {
                const items = b.metadata?.items;
                return !Array.isArray(items) || items.length === 0;
            }
            return normalizeText(b.content).length === 0;
        };
        const blocks: Block[] = Array.isArray(rawContent)
            ? rawContent.filter((b) => !isEmptyBlock(b))
            : (typeof rawContent === 'string' && rawContent.trim().length > 0)
                ? [{ id: uuidv4(), type: 'text', content: rawContent }]
                : [];

        if (blocks.length === 0) return;

        if (!skipConfirm && !window.confirm(
            'Release this note\'s content into separate blocks? The original note will be removed. This can be undone via undo.'
        )) return;

        const parentId = currentParentId || undefined;
        const parentIdForEdge = currentParentId ?? null;

        const resolvedCenterX = centerPosition?.x ?? sourceNode.position.x;
        const resolvedCenterY = centerPosition?.y ?? sourceNode.position.y;
        const baseCenter = { x: snapToGridValue(resolvedCenterX), y: snapToGridValue(resolvedCenterY) };

        // --- Split into sections by heading boundaries ---
        const headingTypes = new Set(['heading1', 'heading2', 'heading3']);
        const isHeadingBlock = (b: Block | null | undefined) => !!b && headingTypes.has(b.type);
        interface Section { heading: Block | null; blocks: Block[] }
        const sections: Section[] = [];

        const headingIndices = blocks
            .map((b, i) => (isHeadingBlock(b) ? i : -1))
            .filter((i) => i >= 0);

        if (headingIndices.length === 0) {
            sections.push({ heading: null, blocks });
        } else {
            // Capture content before the first heading
            if (headingIndices[0] > 0) {
                sections.push({ heading: null, blocks: blocks.slice(0, headingIndices[0]) });
            }
            for (let i = 0; i < headingIndices.length; i++) {
                const startIdx = headingIndices[i];
                const endIdx = i + 1 < headingIndices.length ? headingIndices[i + 1] : blocks.length;
                sections.push({
                    heading: blocks[startIdx],
                    blocks: blocks.slice(startIdx + 1, endIdx)
                });
            }
        }

        // --- Smart node sizing & cluster builders (shared: blockNodeStyle.ts) ---
        const getNodeStyle = (block: Block, isHeading: boolean) =>
            getBlockNodeStyle(block, RELEASE_SIZE_PROFILE, isHeading);
        const createBlockNode = (block: Block, position: { x: number; y: number }, style: { width: number; height: number }) =>
            createStandaloneBlockNode(block, position, style, parentId);
        const buildRadialCluster = (centerNode: AppNode, outerBlocks: Block[], centerPos: { x: number; y: number }) =>
            buildRadialClusterFromCenter(centerNode, outerBlocks, centerPos, { parentId, parentIdForEdge });

        const newNodes: AppNode[] = [];
        const newEdges: Edge[] = [];

        if (sections.length === 1) {
            const section = sections[0];
            if (section.heading) {
                const headingStyle = getNodeStyle(section.heading, true);
                const centerNode = createBlockNode(section.heading, baseCenter, headingStyle);
                const cluster = buildRadialCluster(centerNode, section.blocks, baseCenter);
                newNodes.push(...cluster.nodes);
                newEdges.push(...cluster.edges);
            } else if (section.blocks.length > 0) {
                const centerBlock = section.blocks[0];
                const centerStyle = getNodeStyle(centerBlock, false);
                const centerNode = createBlockNode(centerBlock, baseCenter, centerStyle);
                const cluster = buildRadialCluster(centerNode, section.blocks.slice(1), baseCenter);
                newNodes.push(...cluster.nodes);
                newEdges.push(...cluster.edges);
            }
        } else {
            // Multiple sections are packed from their measured footprints. The
            // old radius estimate was based on one card width, which let long
            // sections collide with the next cluster.
            const clusters: ReturnType<typeof buildRadialCluster>[] = [];

            for (const section of sections) {
                let centerNode: AppNode;
                if (section.heading) {
                    const headingStyle = getNodeStyle(section.heading, true);
                    centerNode = createBlockNode(section.heading, { x: 0, y: 0 }, headingStyle);
                } else if (section.blocks.length > 0) {
                    const centerStyle = getNodeStyle(section.blocks[0], false);
                    centerNode = createBlockNode(section.blocks[0], { x: 0, y: 0 }, centerStyle);
                    section.blocks = section.blocks.slice(1);
                } else {
                    continue;
                }
                const cluster = buildRadialCluster(centerNode, section.blocks, { x: 0, y: 0 });
                clusters.push(cluster);
            }

            const maxRowWidth = BASE_UNIT * 32;
            let offsetX = baseCenter.x;
            let offsetY = baseCenter.y;
            let rowHeight = 0;
            for (let ci = 0; ci < clusters.length; ci++) {
                const cluster = clusters[ci];
                const clusterWidth = cluster.bounds.maxX - cluster.bounds.minX;
                const clusterHeight = cluster.bounds.maxY - cluster.bounds.minY;
                if (offsetX > baseCenter.x && offsetX + clusterWidth > baseCenter.x + maxRowWidth) {
                    offsetX = baseCenter.x;
                    offsetY += rowHeight + BASE_UNIT * 3;
                    rowHeight = 0;
                }
                for (const node of cluster.nodes) {
                    node.position.x += offsetX - cluster.bounds.minX;
                    node.position.y += offsetY - cluster.bounds.minY;
                }
                newNodes.push(...cluster.nodes);
                newEdges.push(...cluster.edges);

                // Separate heading sections are peers in the original note,
                // not a causal chain. Linking their centres would draw a line
                // through the earlier section's outward cards, so each section
                // keeps only the direct edges to its own released content.

                offsetX += clusterWidth + BASE_UNIT * 3;
                rowHeight = Math.max(rowHeight, clusterHeight);
            }
        }

        const newEdgesBase = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
        const newNodesBase = nodes.filter(n => n.id !== nodeId);

        set({
            nodes: [...newNodesBase, ...newNodes],
            edges: [...newEdgesBase, ...newEdges]
        });

        if (currentParentId) {
            scheduleParentSync(currentParentId, () => get().syncParentContent(currentParentId));
        }
    },

    splitNode: (nodeId, splitBlockId, currentBlocks, skipConfirm) => {
        const { nodes, edges } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);
        const sourceBlocks = sourceNode ? getNodeBlocks(sourceNode.data) : undefined;

        if (!sourceNode || !sourceBlocks) return;

        if (!skipConfirm && !window.confirm(
            'Split this node at the selected block? Content will be moved to a new fused note.'
        )) return;

        // Use caller-provided blocks if available (avoids stale store state from debounce),
        // otherwise fall back to store data
        const blocks = (currentBlocks && currentBlocks.length > 0)
            ? currentBlocks as Block[]
            : sourceBlocks;
        const splitIndex = blocks.findIndex(b => b.id === splitBlockId);

        if (splitIndex === -1 || splitIndex === 0) return;

        const blocksToStay = blocks.slice(0, splitIndex);
        const blocksToMove = blocks.slice(splitIndex);

        if (blocksToMove.length === 0) return;

        const currentHeight = sourceNode.style?.height && typeof sourceNode.style.height === 'number'
            ? sourceNode.style.height
            : 400;

        const newPostion = {
            x: sourceNode.position.x,
            y: sourceNode.position.y + Number(currentHeight) + 50
        };

        const newNodeId = uuidv4();

        const newNode: AppNode = {
            id: newNodeId,
            type: 'fused-note',
            position: newPostion,
            data: {
                content: blocksToMove,
                isStandaloneBlock: true
            },
            style: {
                width: MIN_FUSED_SIZE,
                height: 208
            },
            parentId: sourceNode.parentId
        };

        const newEdge: Edge = {
            id: `e-${nodeId}-${newNodeId}`,
            source: nodeId,
            target: newNodeId,
            type: 'centered',
            data: { parentId: sourceNode.parentId ?? null }
        };

        set({
            nodes: [
                ...nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, content: blocksToStay } } : n) as AppNode[],
                newNode
            ],
            edges: [...edges, newEdge]
        });

        // Sync parent content if we are splitInside a child canvas
        if (sourceNode.parentId) {
            const pid = sourceNode.parentId;
            scheduleParentSync(pid, () => get().syncParentContent(pid));
        }
    },

    extractPageFromBlock: (block, position, sourceNodeId) => {
        const { nodes, currentParentId } = get();
        const linkedNodeId = (block.metadata as { nodeId?: string } | undefined)?.nodeId;

        let nodesToUpdate = nodes;
        if (sourceNodeId) {
            nodesToUpdate = nodesToUpdate.map(n => {
                const nBlocks = getNodeBlocks(n.data);
                if (n.id === sourceNodeId && nBlocks) {
                    const newContent = nBlocks.filter((b) => b.id !== block.id);
                    return { ...n, data: { ...n.data, content: newContent } };
                }
                return n;
            }) as AppNode[];
        }

        const iconStyle = { width: ICON_SIZE, height: ICON_SIZE };
        const iconViewMode = 'icon';
        const centeredPos = { 
            x: snapToGridValue(position.x - ICON_SIZE / 2), 
            y: snapToGridValue(position.y - ICON_SIZE / 2) 
        };

        const existingNode = linkedNodeId ? nodesToUpdate.find(n => n.id === linkedNodeId) : null;

        if (existingNode) {
            set({
                nodes: nodesToUpdate.map(n => {
                    if (n.id === linkedNodeId) {
                        return {
                            ...n,
                            parentId: currentParentId || undefined,
                            position: centeredPos,
                            extent: undefined,
                            zIndex: 10,
                            style: { ...n.style, ...iconStyle },
                            data: { ...n.data, viewMode: iconViewMode }
                        };
                    }
                    return n;
                }) as AppNode[]
            });
        } else {
            const newNode: AppNode = {
                id: uuidv4(),
                type: 'note',
                position: centeredPos,
                style: iconStyle,
                data: {
                    label: (block.content as string) || 'Untitled Page',
                    content: [],
                    viewMode: iconViewMode,
                    icon: 'FileText',
                    date: new Date().toISOString()
                } as AppNode['data'],
                parentId: currentParentId || undefined,
            } as AppNode;

            set({
                nodes: [...nodesToUpdate, newNode]
            });
        }
    },

    createPageFromText: (text, position) => {
        const { nodes, currentParentId } = get();
        const newId = uuidv4();
        const pos = position ? {
            x: snapToGridValue(position.x),
            y: snapToGridValue(position.y)
        } : { x: 112, y: 112 };

        const newNode: AppNode = {
            id: newId,
            type: 'note',
            position: pos,
            style: { width: ICON_SIZE, height: ICON_SIZE },
            data: {
                label: text || 'Untitled Page',
                content: [],
                viewMode: 'icon',
                icon: 'FileText',
                createdAt: new Date().toISOString()
            },
            parentId: currentParentId || undefined,
        };

        set({
            nodes: [...nodes, newNode]
        });

        return newId;
    },

    savePageContent: (parentId, content, transientNodeIds) => {
        set((state) => ({
            nodes: state.nodes
                .map((node) => node.id === parentId ? { ...node, data: { ...node.data, content } } : node)
                .filter((node) => !transientNodeIds.includes(node.id))
        }) as Partial<AppState>);
    },

    syncParentContent: (parentId: string) => {
        const { nodes } = get();

        const result = computeParentContentUpdate(parentId, nodes);

        const parent = nodes.find((node) => node.id === parentId);
        const hasContentCanvasChild = nodes.some((node) => (
            node.parentId === parentId && (node.type === 'block' || node.type === 'fused-note')
        ));
        const shouldMarkSynced = Boolean(
            parent?.type === 'note'
            && hasContentCanvasChild
            && parent.data.nestedCanvasSync !== 'needs-review'
            && (parent.data.nestedCanvasSync !== 'synced' || !parent.data.hasNestedCanvasSync),
        );

        if (result && (result.shouldUpdate || shouldMarkSynced)) {

            // Derived reconciliation that rides along with the user action that
            // triggered it — not a standalone undo step.
            withoutHistory(() => {
                set((state) => ({
                    nodes: state.nodes.map(n => {
                        if (n.id === parentId) {
                            return {
                                ...n,
                                data: {
                                    ...n.data,
                                    ...(result.shouldUpdate ? { content: result.parentContent } : {}),
                                    ...(shouldMarkSynced
                                        ? {
                                            hasNestedCanvasSync: true,
                                            nestedCanvasSync: 'synced',
                                            nestedCanvasSyncMessage: 'The note and its canvas are synced.',
                                        }
                                        : {}),
                                },
                            } as AppNode;
                        }
                        const update = result.nodesToUpdate.find(u => u.id === n.id);
                        if (update) {
                            return { ...n, data: update.data } as AppNode;
                        }
                        return n;
                    })
                }));
            });
        }
    },

    /**
     * The other half of the colour picker: an image the node is coloured BY.
     * Sets the image and drops the hue, since a node carries one ambient and
     * the two sources would otherwise stack.
     */
    fuseNodes: (nodeIds: string[], skipConfirm?: boolean) => {
        if (!skipConfirm && !window.confirm(
            `Merge ${nodeIds.length} nodes into one fused note? The originals will be removed. This can be undone via undo (up to 200 steps).`
        )) return;

        const { nodes, edges, currentParentId } = get();
        const nodesToFuse = nodes.filter(n => nodeIds.includes(n.id));


        if (nodesToFuse.length < 2) {
            return;
        }

        // Calculate average position for the fused node
        const avgX = nodesToFuse.reduce((sum, n) => sum + n.position.x, 0) / nodesToFuse.length;
        const avgY = nodesToFuse.reduce((sum, n) => sum + n.position.y, 0) / nodesToFuse.length;


        // Collect all content from all nodes
        const allContent: Block[] = [];
        nodesToFuse.forEach(node => {
            const nodeBlocks = getNodeBlocks(node.data);
            if (node.type === 'note') {
                // Convert note to a page block
                const pageBlock: Block = {
                    id: uuidv4(),
                    type: 'page',
                    content: getNodeLabel(node.data) || 'Untitled',
                    metadata: { nodeId: node.id }
                };
                allContent.push(pageBlock);
            } else if (nodeBlocks) {
                allContent.push(...nodeBlocks);
            }
        });


        // Generate NEW unique ID
        const fusedNodeId = uuidv4();

        // Create fused node
        const fusedNode: AppNode = {
            id: fusedNodeId,
            type: 'fused-note',
            position: { x: avgX, y: avgY },
            data: {
                content: normalizeBlockIds(allContent),
                isStandaloneBlock: true
            },
            style: {
                width: MIN_FUSED_SIZE,
                height: 208
            },
            parentId: currentParentId || undefined
        };

        // Remove original nodes and add fused node
        const newNodes = nodes.filter(n => !nodeIds.includes(n.id));

        newNodes.push(fusedNode);

        // Deduplicate — ensure no duplicate IDs enter the store
        const seenIds = new Set<string>();
        const dedupedNodes: AppNode[] = [];
        for (const n of newNodes) {
            if (seenIds.has(n.id)) {
                // Generate a fresh ID for the duplicate to prevent store corruption
                dedupedNodes.push({ ...n, id: uuidv4() });
            } else {
                seenIds.add(n.id);
                dedupedNodes.push(n);
            }
        }

        // Remove edges connected to deleted nodes
        const newEdges = edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target));

        set({ nodes: dedupedNodes, edges: newEdges });

    },
});
