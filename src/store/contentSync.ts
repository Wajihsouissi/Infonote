import { v4 as uuidv4 } from 'uuid';
import { type AppNode, type AppNodeData, getNodeBlocks, getNodeLabel } from '../types';
import type { Block } from '../features/editor/types';
import { isCanvasHydratableBlock } from './contentHydration';

// Debug flag
const DEBUG = import.meta.env.DEV;

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

// Helper to build indexes for fast lookups
function buildNodeIndexes(nodes: AppNode[]) {
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
    const blocksAfter = new Map<string | null, Block[]>();
    let anchorId: string | null = null;

    for (const block of existingContent) {
        if (isCanvasHydratableBlock(block)) {
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
    const parent = allNodes.find((node) => node.id === parentId);
    if (!parent || parent.type !== 'note') return null;

    const parentContent = getNodeBlocks(parent.data);
    if (!parentContent) return null;

    const directChildren = allNodes.filter((node) => node.parentId === parentId);
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

        if (JSON.stringify(childBlocks) !== JSON.stringify(nextBlocks)) {
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

    if (DEBUG) {
        console.log("[ContentSync] Processing parent:", {
            parentId,
            allChildrenCount: allChildren.length,
            syncedChildrenCount: children.length,
            children: children.map(c => ({
                id: c.id,
                type: c.type,
                isStandalone: 'isStandaloneBlock' in c.data ? c.data.isStandaloneBlock : undefined
            }))
        });
    }

    // 2. Sort by Visual Position
    children.sort((a, b) => {
        if (Math.abs(a.position.y - b.position.y) < 24) {
            return a.position.x - b.position.x;
        }
        return a.position.y - b.position.y;
    });

    // 3. Reconstruct Content
    const reconstructedContent: Block[] = [];
    const nodesToUpdate: { id: string, data: AppNodeData }[] = [];

    // Helper to find existing block for a node to preserve properties (ID, etc.)
    const existingContent = Array.isArray(parent.data.content) ? parent.data.content : [];

    children.forEach(child => {
        if (child.type === 'fused-note' || child.type === 'block') {
            const content = child.data.content;

            if (Array.isArray(content)) {
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
                                if (DEBUG) {
                                    console.log("Sync Check: MISMATCH DETECTED. Scheduling Update.", {
                                        id: linkedNode.id,
                                        old: currentLabel,
                                        new: b.content
                                    });
                                }

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

    // 4. Check for Changes
    const documentOrderedContent = preserveDocumentOrder(
        existingContent,
        reconstructedContent,
        parent.data.nestedCanvasSync === 'needs-review',
    );
    const mergedContent = mergeEditorOnlyBlocks(existingContent, documentOrderedContent);
    const currentContentStr = JSON.stringify(parent.data.content || []);
    const newContentStr = JSON.stringify(mergedContent);
    const shouldUpdate = currentContentStr !== newContentStr || nodesToUpdate.length > 0;

    if (shouldUpdate) {
        if (DEBUG) {
            console.log("SyncParentContent (Computed):", {
                parentId,
                childrenCount: children.length,
                currentLen: Array.isArray(parent.data.content) ? parent.data.content.length : undefined,
                newLen: reconstructedContent.length,
                hasChanged: currentContentStr !== newContentStr,
                updates: nodesToUpdate.length
            });
        }
    }

    return {
        parentContent: mergedContent,
        nodesToUpdate,
        shouldUpdate
    };
};
