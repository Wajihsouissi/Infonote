import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../types';

interface SyncResult {
    parentContent: any[];
    nodesToUpdate: Array<{ id: string; data: any }>;
    shouldUpdate: boolean;
}

export const computeParentContentUpdate = (parentId: string, allNodes: AppNode[]): SyncResult | null => {
    const parent = allNodes.find(n => n.id === parentId);
    if (!parent || parent.type !== 'note') return null;

    // 1. Get Children - Include all nodes that belong to this parent
    const children = allNodes.filter(n =>
        n.parentId === parentId &&
        ['fused-note', 'block', 'note', 'kanban'].includes(n.type)
    );

    console.log("[ContentSync] Processing parent:", {
        parentId,
        allChildrenCount: allNodes.filter(n => n.parentId === parentId).length,
        syncedChildrenCount: children.length,
        children: children.map(c => ({
            id: c.id,
            type: c.type,
            isStandalone: (c.data as any).isStandaloneBlock
        }))
    });

    // 2. Sort by Visual Position
    children.sort((a, b) => {
        if (Math.abs(a.position.y - b.position.y) < 24) {
            return a.position.x - b.position.x;
        }
        return a.position.y - b.position.y;
    });

    // 3. Reconstruct Content
    let reconstructedContent: any[] = [];
    let nodesToUpdate: { id: string, data: any }[] = [];

    // Helper to find existing block for a node to preserve properties (ID, etc.)
    const existingContent = Array.isArray(parent.data.content) ? parent.data.content : [];

    children.forEach(child => {
        if (child.type === 'fused-note' || child.type === 'block') {
            const childData = child.data as any;
            const content = childData.content;

            if (Array.isArray(content)) {
                content.forEach((b: any) => {
                    reconstructedContent.push(b);
                });

                // SYNC LINKED NODES (Block -> Node)
                // If a block is a 'page' reference, ensure the actual Node label matches the Block content.
                content.forEach((b: any) => {
                    if (b.type === 'page' && b.metadata?.nodeId) {
                        const linkedNode = allNodes.find(n => n.id === b.metadata.nodeId);

                        if (linkedNode) {
                            const currentLabel = (linkedNode.data as any).label;
                            const contentMatch = currentLabel === b.content;

                            if (!contentMatch) {
                                console.log("Sync Check: MISMATCH DETECTED. Scheduling Update.", {
                                    id: linkedNode.id,
                                    old: currentLabel,
                                    new: b.content
                                });

                                const existingUpdate = nodesToUpdate.find(u => u.id === linkedNode.id);
                                if (existingUpdate) {
                                    existingUpdate.data.label = b.content;
                                } else {
                                    nodesToUpdate.push({
                                        id: linkedNode.id,
                                        data: { ...linkedNode.data, label: b.content }
                                    });
                                }
                            }
                        }
                    }
                });
            }
        } else if (child.type === 'note' || child.type === 'kanban') {
            // Try to find existing block for this node
            const existingBlock = existingContent.find((b: any) => b.metadata?.nodeId === child.id);

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
        console.log("SyncParentContent (Computed):", {
            parentId,
            childrenCount: children.length,
            currentLen: (parent.data.content as any[])?.length,
            newLen: reconstructedContent.length,
            hasChanged: currentContentStr !== newContentStr,
            updates: nodesToUpdate.length
        });
    }

    return {
        parentContent: reconstructedContent,
        nodesToUpdate,
        shouldUpdate
    };
};
