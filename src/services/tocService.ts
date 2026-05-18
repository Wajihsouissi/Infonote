import type { AppNode } from '../types';

export interface OutlineItem {
    id: string;
    type: 'heading1' | 'heading2' | 'heading3' | 'toggle' | 'page' | 'todo' | 'callout' | 'quote' | 'code';
    label: string;
    targetId: string; // The DOM element ID to scroll to
    children: OutlineItem[];
    indent: number;
    headingLevel: number; // 1 for H1, 2 for H2, 3 for H3, 4 for pages/toggles/others
    nodeId?: string; // If it's a page block or sub-note
    checked?: boolean; // For checklist items
    metadata?: any; // Raw block metadata
}

/**
 * Sorts canvas nodes visually by visual Y-coordinate, then X-coordinate.
 */
function sortNodesVisually(nodes: AppNode[]): AppNode[] {
    return [...nodes].sort((a, b) => {
        if (Math.abs(a.position.y - b.position.y) < 24) {
            return a.position.x - b.position.x;
        }
        return a.position.y - b.position.y;
    });
}

/**
 * Builds the unified flat blocks list for a given parent node ID.
 * If nodeId is null (Home page), gathers all root canvas nodes.
 */
function getUnifiedBlocksForNode(nodeId: string | null, allNodes: AppNode[]): any[] {
    const parent = nodeId ? allNodes.find(n => n.id === nodeId) : null;

    // 1. Get child nodes belonging to this parent context
    const childNodes = allNodes.filter(n => {
        if (nodeId === null) {
            return n.parentId === undefined || n.parentId === null;
        }
        return n.parentId === nodeId;
    });

    // Only process supported visual nodes
    const validChildren = childNodes.filter(n =>
        ['fused-note', 'block', 'note', 'kanban'].includes(n.type)
    );

    // 2. Sort child nodes visually
    const sortedChildren = sortNodesVisually(validChildren);

    // 3. Reconstruct content blocks sequentially
    const unifiedBlocks: any[] = [];
    const existingContent = (parent && Array.isArray((parent.data as any).content)) ? (parent.data as any).content : [];

    sortedChildren.forEach(child => {
        if (child.type === 'fused-note' || child.type === 'block') {
            const content = (child.data as any).content;
            if (Array.isArray(content)) {
                content.forEach((b: any) => {
                    unifiedBlocks.push(b);
                });
            }
        } else if (child.type === 'note' || child.type === 'kanban') {
            const existingBlock = existingContent.find((b: any) => b.metadata?.nodeId === child.id);
            unifiedBlocks.push({
                id: existingBlock?.id || child.id,
                type: 'page',
                content: child.data.label || (child.type === 'kanban' ? 'Kanban Board' : 'Untitled'),
                metadata: {
                    nodeId: child.id,
                    isKanban: child.type === 'kanban'
                }
            });
        }
    });

    return unifiedBlocks;
}

/**
 * Parses a flat list of blocks into a tree of outline items.
 * Handles toggle nesting using block indents.
 * Handles page nesting recursively.
 */
function parseBlocksToOutline(
    blocks: any[],
    allNodes: AppNode[],
    level = 0
): OutlineItem[] {
    const items: OutlineItem[] = [];
    let i = 0;

    while (i < blocks.length) {
        const block = blocks[i];
        const isHeading = ['heading1', 'heading2', 'heading3'].includes(block.type);
        const isToggle = block.type === 'toggle';
        const isPage = block.type === 'page';
        const isTodo = block.type === 'todo';
        const isCallout = block.type === 'callout';
        const isQuote = block.type === 'quote';
        const isCode = block.type === 'code';

        const isSupported = isHeading || isToggle || isPage || isTodo || isCallout || isQuote || isCode;

        if (isSupported) {
            let headingLevel = 4;
            if (block.type === 'heading1') headingLevel = 1;
            else if (block.type === 'heading2') headingLevel = 2;
            else if (block.type === 'heading3') headingLevel = 3;

            let children: OutlineItem[] = [];

            // 1. Indentation children (Toggles)
            if (isToggle) {
                const toggleIndent = block.indent || 0;
                const toggleChildrenBlocks: any[] = [];
                let j = i + 1;
                while (j < blocks.length && (blocks[j].indent || 0) > toggleIndent) {
                    toggleChildrenBlocks.push(blocks[j]);
                    j++;
                }
                if (toggleChildrenBlocks.length > 0) {
                    children = parseBlocksToOutline(toggleChildrenBlocks, allNodes, level + 1);
                }
                // Skip the parsed indented children in main loop
                i = j - 1;
            }

            // 2. Recursive page children (Nested notes)
            if (isPage && block.metadata?.nodeId) {
                const targetNodeId = block.metadata.nodeId;
                const subNode = allNodes.find(n => n.id === targetNodeId);
                if (subNode && subNode.type === 'note') {
                    // Recursively build children for the sub-note
                    children = buildTOCTree(targetNodeId, allNodes, level + 1);
                }
            }

            items.push({
                id: block.id,
                type: block.type,
                label: block.content || (block.type === 'page' ? 'Untitled Page' : ''),
                targetId: block.type === 'page' ? (block.metadata?.nodeId || block.id) : `block-${block.id}`,
                children,
                indent: block.indent || 0,
                headingLevel,
                nodeId: block.metadata?.nodeId,
                checked: block.metadata?.checked || false,
                metadata: block.metadata
            });
        }
        i++;
    }

    return items;
}

/**
 * Logically nests headings (H2 under H1, H3 under H2) in an outline item tree.
 */
function nestHeadingHierarchy(items: OutlineItem[]): OutlineItem[] {
    const nested: OutlineItem[] = [];
    const stack: OutlineItem[] = [];

    items.forEach(item => {
        // Deeply nest children first
        if (item.children && item.children.length > 0) {
            item.children = nestHeadingHierarchy(item.children);
        }

        const isHeading = ['heading1', 'heading2', 'heading3'].includes(item.type);
        if (!isHeading) {
            if (stack.length > 0) {
                stack[stack.length - 1].children.push(item);
            } else {
                nested.push(item);
            }
            return;
        }

        const currentLevel = item.headingLevel;

        while (stack.length > 0 && stack[stack.length - 1].headingLevel >= currentLevel) {
            stack.pop();
        }

        if (stack.length > 0) {
            stack[stack.length - 1].children.push(item);
        } else {
            nested.push(item);
        }

        stack.push(item);
    });

    return nested;
}

/**
 * Builds the complete outline tree for a page/node.
 */
export function buildTOCTree(nodeId: string | null, allNodes: AppNode[], level = 0): OutlineItem[] {
    const blocks = getUnifiedBlocksForNode(nodeId, allNodes);
    const flatOutline = parseBlocksToOutline(blocks, allNodes, level);
    return nestHeadingHierarchy(flatOutline);
}
