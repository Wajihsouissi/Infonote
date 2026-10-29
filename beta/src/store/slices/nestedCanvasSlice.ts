import type { StateCreator } from 'zustand';
import type { Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { type AppNode, getNodeBlocks } from '../../types';
import type { Block } from '../../features/editor/types';
import { MIN_FUSED_SIZE, BASE_UNIT } from '../../config/layout';
import { isCanvasHydratableBlock } from '../hydration/blockText';
import { layoutDocumentTree } from '../hydration/layout';
import { planHydration } from '../hydration/plan';
import type { HydrationChunk } from '../hydration/types';
import { checkNodeCreationLimits } from '../nodeLimits';
import { normalizeText, blockText, getBlockNodeStyle, HYDRATE_SIZE_PROFILE } from '../blockNodeStyle';
import type { AppState, NestedCanvasSlice } from '../types';

/**
 * The auto mind map: opening a written card turns its writing into a map on
 * its nested canvas (see store/hydration/plan.ts), and legacy maps are migrated
 * to the current document-tree layout.
 */
export const createNestedCanvasSlice: StateCreator<AppState, [], [], NestedCanvasSlice> = (set, get) => ({
    hydrateCanvasFromContent: (nodeId: string) => {
        const { nodes } = get();
        
        // Build index for O(1) lookups
        const byId = new Map<string, AppNode>();
        const childrenByParent = new Map<string | undefined, AppNode[]>();
        for (const node of nodes) {
            byId.set(node.id, node);
            const parentKey = node.parentId;
            if (!childrenByParent.has(parentKey)) {
                childrenByParent.set(parentKey, []);
            }
            childrenByParent.get(parentKey)!.push(node);
        }
        
        const parentNode = byId.get(nodeId);

        const parentContent = parentNode ? getNodeBlocks(parentNode.data) : undefined;
        if (!parentNode || !parentContent || parentContent.length === 0) {
            return;
        }

        // Get existing children using index
        const children = childrenByParent.get(nodeId) || [];

        // Collect all block IDs currently represented on the canvas
        const representedBlockIds = new Set<string>();
        const pageBlockByNodeId = new Map<string, Block>();
        parentContent.forEach((block) => {
            if (block.type === 'page' && typeof block.metadata?.nodeId === 'string') {
                pageBlockByNodeId.set(block.metadata.nodeId, block);
            }
        });
        children.forEach(child => {
            getNodeBlocks(child.data)?.forEach((b) => representedBlockIds.add(b.id));
            if (child.type === 'note') {
                const matchingBlock = pageBlockByNodeId.get(child.id);
                if (matchingBlock) {
                    representedBlockIds.add(matchingBlock.id);
                }
            }
        });

        // Identify meaningful, orphan blocks. Editor-only composition scaffolding
        // stays in the parent card and never becomes a canvas card.
        const orphanBlocks = parentContent.filter((block) =>
            !representedBlockIds.has(block.id) && isCanvasHydratableBlock(block)
        );

        if (orphanBlocks.length === 0) {
            return;
        }


        // A first map represents the complete note. Do not silently mark a
        // partial batch as synced: the creation-limit check below either
        // accepts the complete map or explains why it cannot be made.
        const orphanBlocksOrdered = orphanBlocks;

        // --- Relatedness-based semantic grouping ---
        // Group blocks by content relatedness (not just heading/divider markers),
        // producing a semantic hierarchy tree + cross-topic "related" edges.
        // See store/hydration/plan.ts.
        type Chunk = HydrationChunk;

        const plan = planHydration(orphanBlocksOrdered);
        const validChunks: Chunk[] = plan.chunks;

        if (validChunks.length === 0) return;

        // --- Build the first document tree ---------------------------------
        // The note's own sections are the first visible row. No synthetic
        // title card duplicates the note or competes with the hierarchy.
        const getNodeStyle = (block: Block) => getBlockNodeStyle(block, HYDRATE_SIZE_PROFILE);

        const getFusedNoteStyle = (blocks: Block[]) => {
            let estimatedHeight = 40; // Base padding/margin (reduced to exactly fit)
            blocks.forEach(b => {
                if (b.type === 'heading1') estimatedHeight += 50;
                else if (b.type === 'heading2') estimatedHeight += 40;
                else if (b.type === 'heading3') estimatedHeight += 30;
                else if (b.type === 'divider') estimatedHeight += 20;
                else {
                    const len = normalizeText(blockText(b.content)).length;

                    if (len === 0) {
                        estimatedHeight += 24; // Empty line
                    } else {
                        // Assuming ~50 characters per line for MIN_FUSED_SIZE width
                        const lines = Math.ceil(len / 50);
                        estimatedHeight += lines * 24 + 10; // 24px per line + 10px paragraph spacing
                    }
                }
            });
            
            // Snap to grid and do not force 208 height, just a small minimum of 80
            const finalHeight = Math.max(80, Math.ceil(estimatedHeight / BASE_UNIT) * BASE_UNIT);
            return { width: MIN_FUSED_SIZE, height: finalHeight };
        };

        const nonTextStandaloneTypes = new Set(['media', 'image', 'video', 'file', 'gallery', 'code', 'table', 'intelligent-ui']);
        const mapChunks: Chunk[] = validChunks.map((chunk) => {
            const isMainChapter = !chunk.sourceId;
            const firstBlock = chunk.blocks[0];
            // A single heading or idea should still read as a chapter, not as a
            // small loose card. Rich standalone material keeps its own card.
            const shouldFuseMainChapter = isMainChapter
                && !!firstBlock
                && !nonTextStandaloneTypes.has(firstBlock.type);
            return shouldFuseMainChapter ? { ...chunk, type: 'fused-note' } : chunk;
        });

        const sizeOf = (chunk: Chunk): { width: number; height: number } =>
            chunk.type === 'block' ? getNodeStyle(chunk.blocks[0]) : getFusedNoteStyle(chunk.blocks);

        const treeLayout = layoutDocumentTree(mapChunks, sizeOf, {
            gridStep: BASE_UNIT,
            maxRootRowWidth: typeof window !== 'undefined' && window.innerWidth < 720
                ? BASE_UNIT * 30
                : BASE_UNIT * 44,
        });

        // --- Creation of chapter and section nodes --------------------------
        const newNodes: AppNode[] = mapChunks.map(chunk => {
            const pos = treeLayout.positions.get(chunk.id) || { x: BASE_UNIT, y: BASE_UNIT };
            const style = chunk.type === 'block' ? getNodeStyle(chunk.blocks[0]) : getFusedNoteStyle(chunk.blocks);
            const isChapter = !chunk.sourceId && chunk.type === 'fused-note';
            
            return {
                id: chunk.id,
                type: chunk.type,
                position: pos,
                style: style,
                data: {
                    content: chunk.blocks,
                    isStandaloneBlock: true,
                    ...(chunk.type === 'fused-note'
                        ? { mapRole: isChapter ? 'chapter' : 'section' }
                        : {}),
                },
                parentId: nodeId
            } as AppNode;
        });

        const chunkIds = new Set(mapChunks.map(c => c.id));
        const newEdges: Edge[] = [];

        // The planner's links describe the document hierarchy. Draw them here
        // so the visual map explains both chapters and their lower sections.
        plan.relatedEdges.forEach(rel => {
            if (chunkIds.has(rel.source) && chunkIds.has(rel.target)) {
                newEdges.push({
                    id: uuidv4(),
                    source: rel.source,
                    target: rel.target,
                    type: 'centered',
                    data: { parentId: nodeId, color: 'var(--accent-ink)', strokeWidth: 1.5 } // Scope edge to this canvas
                } as Edge);
            }
        });

        // Guest nesting limit: the whole batch lands on this canvas.
        const violation = checkNodeCreationLimits({
            nodes: get().nodes,
            targetParentId: nodeId,
            isAuthenticated: get().auth.isAuthenticated,
        });
        if (violation) {
            get().setLimitNotice(violation);
            return;
        }

        set(state => ({
            nodes: [
                ...state.nodes.map((node) => node.id === nodeId && node.type === 'note'
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            hasNestedCanvasSync: true,
                            nestedCanvasSync: 'synced',
                            nestedCanvasSyncMessage: 'The note and its canvas are synced.',
                        },
                    } as AppNode
                    : node),
                ...newNodes,
            ],
            edges: [...state.edges, ...newEdges]
        }));

    },

    migrateTopicMapToDocumentTree: (nodeId: string) => {
        const { nodes, edges } = get();
        const topicRoot = nodes.find((node) => (
            node.parentId === nodeId
            && node.type === 'fused-note'
            && node.data.mapRole === 'topic-root'
        ));
        if (!topicRoot) return false;

        /* The predicate is a type guard, not a plain boolean: `filter` does not
           narrow the element type on its own, so without it `node.type` stays
           the full node union and `layoutDocumentTree` — which accepts only
           block and fused-note — rejects the mapped input. */
        const treeNodes = nodes.filter((node): node is Extract<AppNode, { type: 'block' | 'fused-note' }> => (
            node.parentId === nodeId
            && node.id !== topicRoot.id
            && (node.type === 'block' || node.type === 'fused-note')
        ));
        const treeNodeIds = new Set(treeNodes.map((node) => node.id));
        const incomingByTarget = new Map<string, string>();
        edges.forEach((edge) => {
            if (
                edge.source !== topicRoot.id
                && treeNodeIds.has(edge.source)
                && treeNodeIds.has(edge.target)
                && !incomingByTarget.has(edge.target)
            ) {
                incomingByTarget.set(edge.target, edge.source);
            }
        });

        const nodesById = new Map(treeNodes.map((node) => [node.id, node]));
        const layout = layoutDocumentTree(
            treeNodes.map((node) => ({
                id: node.id,
                type: node.type,
                sourceId: incomingByTarget.get(node.id),
            })),
            (input) => {
                const node = nodesById.get(input.id)!;
                return {
                    width: node.measured?.width
                        ?? (typeof node.style?.width === 'number' ? node.style.width : 432),
                    height: node.measured?.height
                        ?? (typeof node.style?.height === 'number' ? node.style.height : 208),
                };
            },
            {
                gridStep: BASE_UNIT,
                maxRootRowWidth: typeof window !== 'undefined' && window.innerWidth < 720
                    ? BASE_UNIT * 30
                    : BASE_UNIT * 44,
            },
        );

        set({
            nodes: nodes
                .filter((node) => node.id !== topicRoot.id)
                .map((node) => {
                    const position = layout.positions.get(node.id);
                    return position ? { ...node, position } : node;
                }),
            edges: edges.filter((edge) => edge.source !== topicRoot.id && edge.target !== topicRoot.id),
        });
        return true;
    },
});
