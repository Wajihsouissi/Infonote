import { v4 as uuidv4 } from 'uuid';
import { type AppNode, type AppNodeData, getNodeBlocks, getNodeLabel } from '../types';
import type { Block } from '../features/editor/types';
import { isCanvasHydratableBlock } from './hydration/blockText';
import { sameDocument } from '../features/editor/document/documentMerge';
import { normalizeBlockIds } from '../features/editor/document/blockIdentity';

interface SyncResult {
    parentContent: Block[];
    nodesToUpdate: Array<{ id: string; data: AppNodeData }>;
    shouldUpdate: boolean;
}

/**
 * The editor is the canonical sequence of blocks; a nested canvas is a spatial
 * projection of those same block identities. This result describes the safe
 * downward half of that relationship. It does not create cards itself because
 * placement belongs to the canvas store, but it makes every retained card use
 * the current version of its blocks and identifies genuinely new ideas.
 */
export interface CanvasContentReconciliation {
    nodesToUpdate: Array<{ id: string; data: AppNodeData }>;
    nodeIdsToRemove: string[];
    missingBlocks: Block[];
    shouldUpdate: boolean;
}

const graphIndexes = new WeakMap<AppNode[], ReturnType<typeof createNodeIndexes>>();

function buildNodeIndexes(nodes: AppNode[]) {
    let index = graphIndexes.get(nodes);
    if (!index) {
        index = createNodeIndexes(nodes);
        graphIndexes.set(nodes, index);
    }
    return index;
}

// Reused for each immutable graph revision, including both sync directions.
function createNodeIndexes(nodes: AppNode[]) {
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
    
    return { byId, childrenByParent };
}

/**
 * Dividers and blank editor placeholders deliberately do not become canvas
 * nodes. Keep them in the parent document when a later canvas change rebuilds
 * the visible content. Each is anchored after the meaningful block that
 * preceded it, so moving cards does not turn hidden formatting into data loss.
 */
function mergeEditorOnlyBlocks(existingContent: Block[], reconstructedContent: Block[]): Block[] {
    const representedIds = new Set(reconstructedContent.map(block => block.id));
    const blocksAfter = new Map<string | null, Block[]>();
    let anchorId: string | null = null;

    for (const block of existingContent) {
        // A fused card can contain a blank or divider too. It already exists
        // in the reconstructed sequence; anchoring another copy here doubled
        // the saved run on every sync (eventually millions of references).
        if (isCanvasHydratableBlock(block) || representedIds.has(block.id)) {
            anchorId = block.id;
            continue;
        }
        const anchoredBlocks = blocksAfter.get(anchorId) ?? [];
        anchoredBlocks.push(block);
        blocksAfter.set(anchorId, anchoredBlocks);
    }

    if (blocksAfter.size === 0) return reconstructedContent;

    const merged = [...(blocksAfter.get(null) ?? [])];
    for (const block of reconstructedContent) {
        merged.push(block, ...(blocksAfter.get(block.id) ?? []));
    }
    return merged;
}

/**
 * A canvas is spatial; a card document is linear. Keep existing document
 * blocks in their original order even when someone moves their cards around.
 * New blocks are placed after the nearest preceding known block from their
 * canvas card, which preserves the useful "add beside this idea" intent
 * without making visual rearrangement rewrite prose.
 */
function preserveDocumentOrder(
    existingContent: Block[],
    canvasOrderedContent: Block[],
    retainUnrepresentedBlocks = false,
): Block[] {
    const canvasById = new Map(canvasOrderedContent.map((block) => [block.id, block]));
    const existingIds = new Set(existingContent.map((block) => block.id));
    const newBlocksAfter = new Map<string | null, Block[]>();
    let previousKnownId: string | null = null;

    for (const block of canvasOrderedContent) {
        if (existingIds.has(block.id)) {
            previousKnownId = block.id;
            continue;
        }
        const siblings = newBlocksAfter.get(previousKnownId) ?? [];
        siblings.push(block);
        newBlocksAfter.set(previousKnownId, siblings);
    }

    const ordered = [...(newBlocksAfter.get(null) ?? [])];
    for (const existingBlock of existingContent) {
        const canvasBlock = canvasById.get(existingBlock.id);
        if (!canvasBlock) {
            // A full canvas is an honest, visible exception to the two-view
            // promise. Until it is resolved, an editor-only meaningful block
            // must remain in the source document when another card is edited.
            if (retainUnrepresentedBlocks && isCanvasHydratableBlock(existingBlock)) {
                ordered.push(existingBlock);
            }
            continue;
        }
        ordered.push(canvasBlock, ...(newBlocksAfter.get(existingBlock.id) ?? []));
    }
    return ordered;
}

/**
 * Reconcile an already-linked nested canvas from its parent note.
 *
 * Mapping happens by durable block id, never by an array index. That means a
 * writer can insert, delete, or reorder blocks without the map accidentally
 * overwriting a neighbouring idea. Editor-only composition (for example a
 * divider) remains wherever it was already represented; only meaningful new
 * blocks are returned for the canvas store to place as new cards.
 */
export const computeCanvasContentReconciliation = (
    parentId: string,
    allNodes: AppNode[],
): CanvasContentReconciliation | null => {
    const { byId, childrenByParent } = buildNodeIndexes(allNodes);
    const parent = byId.get(parentId);
    if (!parent || parent.type !== 'note') return null;

    const parentContent = getNodeBlocks(parent.data);
    if (!parentContent) return null;

    const directChildren = childrenByParent.get(parentId) ?? [];
    const contentChildren = directChildren.filter((node) => (
        (node.type === 'block' || node.type === 'fused-note')
        && Array.isArray(getNodeBlocks(node.data))
        // A saved legacy topic root owns no source blocks. It is ignored until
        // opening that map migrates it to the current document-tree layout.
        && !(node.type === 'fused-note' && node.data.mapRole === 'topic-root')
    ));

    // Keep initial conversion intentional. Once a person imports a note or
    // starts mapping it, however, every later edit is part of the same shared
    // document and must not silently leave a stale card behind.
    if (!parent.data.hasNestedCanvasSync && contentChildren.length === 0) return null;

    const blockById = new Map(parentContent.map((block) => [block.id, block]));
    const representedBlockIds = new Set<string>();
    const nodesToUpdate: CanvasContentReconciliation['nodesToUpdate'] = [];
    const nodeIdsToRemove: string[] = [];

    for (const child of contentChildren) {
        const childBlocks = getNodeBlocks(child.data) ?? [];
        const nextBlocks = childBlocks.flatMap((block) => {
            const replacement = blockById.get(block.id);
            if (!replacement) return [];
            representedBlockIds.add(replacement.id);
            return [replacement];
        });

        if (nextBlocks.length === 0) {
            nodeIdsToRemove.push(child.id);
            continue;
        }

        if (!sameDocument(childBlocks, nextBlocks)) {
            nodesToUpdate.push({
                id: child.id,
                data: { ...child.data, content: nextBlocks } as AppNodeData,
            });
        }
    }

    const missingBlocks = parentContent.filter((block) => (
        block.type !== 'page'
        && isCanvasHydratableBlock(block)
        && !representedBlockIds.has(block.id)
    ));

    return {
        nodesToUpdate,
        nodeIdsToRemove,
        missingBlocks,
        shouldUpdate: nodesToUpdate.length > 0 || nodeIdsToRemove.length > 0 || missingBlocks.length > 0,
    };
};

export const computeParentContentUpdate = (parentId: string, allNodes: AppNode[]): SyncResult | null => {
    // Build indexes for O(1) lookups instead of O(n) find/filter
    const { byId, childrenByParent } = buildNodeIndexes(allNodes);
    
    const parent = byId.get(parentId);
    if (!parent || parent.type !== 'note') return null;

    // 1. Get Children - Include all nodes that belong to this parent
    const allChildren = childrenByParent.get(parentId) || [];
    const children = allChildren.filter(n =>
        ['fused-note', 'block', 'note'].includes(n.type)
    );


    // 2. Sort by Visual Position
    children.sort((a, b) => {
        if (Math.abs(a.position.y - b.position.y) < 24) {
            return a.position.x - b.position.x;
        }
        return a.position.y - b.position.y;
    });

    // 3. Reconstruct Content
    const reconstructedContent: Block[] = [];
    const childRanges: Array<{ child: AppNode; start: number; content: Block[] }> = [];
    const nodesToUpdate: { id: string, data: AppNodeData }[] = [];

    // Helper to find existing block for a node to preserve properties (ID, etc.)
    const existingContent = Array.isArray(parent.data.content) ? parent.data.content : [];

    children.forEach(child => {
        if (child.type === 'fused-note' || child.type === 'block') {
            const content = child.data.content;

            if (Array.isArray(content)) {
                childRanges.push({ child, start: reconstructedContent.length, content });
                content.forEach((b) => {
                    reconstructedContent.push(b);
                });

                // SYNC LINKED NODES (Block -> Node)
                // If a block is a 'page' reference, ensure the actual Node label matches the Block content.
                content.forEach((b) => {
                    if (b.type === 'page' && b.metadata?.nodeId) {
                        const linkedNode = byId.get(b.metadata.nodeId);

                        if (linkedNode) {
                            const currentLabel = getNodeLabel(linkedNode.data);
                            const contentMatch = currentLabel === b.content;

                            if (!contentMatch) {

                                const existingUpdate = nodesToUpdate.find(u => u.id === linkedNode.id);
                                if (existingUpdate) {
                                    existingUpdate.data = { ...existingUpdate.data, label: b.content } as AppNodeData;
                                } else {
                                    nodesToUpdate.push({
                                        id: linkedNode.id,
                                        data: { ...linkedNode.data, label: b.content } as AppNodeData
                                    });
                                }
                            }
                        }
                    }
                });
            }
        } else if (child.type === 'note') {
            // Try to find existing block for this node
            const existingBlock = existingContent.find((b) => b.metadata?.nodeId === child.id);

            reconstructedContent.push({
                id: existingBlock?.id || uuidv4(),
                type: 'page',
                content: child.data.label || 'Untitled',
                metadata: { 
                    nodeId: child.id
                }
            });
        }
    });

    // Cards copied from one idea may still share block identities. Repair the
    // concatenation before id-based ordering can overwrite either occurrence,
    // and publish the same identities back to their owning cards.
    const uniqueContent = normalizeBlockIds(reconstructedContent);
    if (uniqueContent !== reconstructedContent) {
        for (const { child, start, content } of childRanges) {
            const repaired = uniqueContent.slice(start, start + content.length);
            if (repaired.every((block, index) => block === content[index])) continue;
            const update = nodesToUpdate.find(item => item.id === child.id);
            if (update) update.data = { ...update.data, content: repaired } as AppNodeData;
            else nodesToUpdate.push({ id: child.id, data: { ...child.data, content: repaired } as AppNodeData });
        }
    }

    // 4. Check for Changes
    const documentOrderedContent = preserveDocumentOrder(
        existingContent,
        uniqueContent,
        parent.data.nestedCanvasSync === 'needs-review',
    );
    const mergedContent = mergeEditorOnlyBlocks(existingContent, documentOrderedContent);
    const shouldUpdate = !Array.isArray(parent.data.content)
        || !sameDocument(existingContent, mergedContent) || nodesToUpdate.length > 0;

    return {
        parentContent: mergedContent,
        nodesToUpdate,
        shouldUpdate
    };
};
