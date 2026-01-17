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

    // 1. Get Children
    const children = allNodes.filter(n => n.parentId === parentId);

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
            const content = (child.data as any).content;
            if (Array.isArray(content)) {
                const clean: any[] = [];
                let ejected = false;
                content.forEach((b: any) => {
                    reconstructedContent.push(b);
                    if (b.type === 'page') {
                        ejected = true;
                    } else {
                        clean.push(b);
                    }
                });

                if (ejected) {
                    nodesToUpdate.push({ id: child.id, data: { ...child.data, content: clean } });
                }

                // SYNC LINKED NODES (Block -> Node)
                // If a block is a 'page' reference, ensure the actual Node label matches the Block content.
                content.forEach((b: any) => {
                    if (b.type === 'page' && b.metadata?.nodeId) {
                        const linkedNode = allNodes.find(n => n.id === b.metadata.nodeId);

                        if (linkedNode) {
                            const currentLabel = (linkedNode.data as any).label;
                            const contentMatch = currentLabel === b.content;

                            // console.log("Sync Check:", { blockContent: b.content, nodeLabel: currentLabel, match: contentMatch });

                            if (!contentMatch) {
                                console.log("Sync Check: MISMATCH DETECTED. Scheduling Update.", {
                                    id: linkedNode.id,
                                    old: currentLabel,
                                    new: b.content
                                });

                                // Correct the Linked Node's label to match the Block
                                // Use push to avoid duplicates if multiple refs exist?
                                // Check if already in nodesToUpdate?
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
        } else if (child.type === 'note') {
            // Try to find existing block for this node
            const existingBlock = existingContent.find((b: any) => b.metadata?.nodeId === child.id);

            reconstructedContent.push({
                id: existingBlock?.id || uuidv4(), // Preserve ID or generate new
                type: 'page',
                content: child.data.label || 'Untitled',
                metadata: { nodeId: child.id }
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
