import { v4 as uuidv4 } from 'uuid';
import { type AppNode, type AppNodeData, getNodeLabel } from '../types';
import type { Block } from '../features/editor/types';

// Debug flag
const DEBUG = import.meta.env.DEV;

interface SyncResult {
    parentContent: Block[];
    nodesToUpdate: Array<{ id: string; data: AppNodeData }>;
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

export const computeParentContentUpdate = (parentId: string, allNodes: AppNode[]): SyncResult | null => {
    // Build indexes for O(1) lookups instead of O(n) find/filter
    const { byId, childrenByParent } = buildNodeIndexes(allNodes);
    
    const parent = byId.get(parentId);
    if (!parent || parent.type !== 'note') return null;

    // 1. Get Children - Include all nodes that belong to this parent
    const allChildren = childrenByParent.get(parentId) || [];
    const children = allChildren.filter(n =>
        ['fused-note', 'block', 'note', 'kanban'].includes(n.type)
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
        } else if (child.type === 'note' || child.type === 'kanban') {
            // Try to find existing block for this node
            const existingBlock = existingContent.find((b) => b.metadata?.nodeId === child.id);

            reconstructedContent.push({
                id: existingBlock?.id || uuidv4(),
                type: 'page',
                content: child.data.label || (child.type === 'kanban' ? 'Kanban Board' : 'Untitled'),
                metadata: { 
                    nodeId: child.id,
                    isKanban: child.type === 'kanban'
                }
            });
        }
    });

    // 4. Check for Changes
    const currentContentStr = JSON.stringify(parent.data.content || []);
    const newContentStr = JSON.stringify(reconstructedContent);
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
        parentContent: reconstructedContent,
        nodesToUpdate,
        shouldUpdate
    };
};
