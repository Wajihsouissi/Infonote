import { type AppNode, getNodeBlocks, getNodeLabel } from '../types';
import type { Block, BlockMetadata } from '../features/editor/types';

export type OutlineIconVariant = 
    | 'folder' 
    | 'file' 
    | 'block' 
    | 'h1' 
    | 'h2' 
    | 'h3' 
    | 'bullet'
    | 'numbered'
    | 'todo' 
    | 'callout' 
    | 'quote' 
    | 'code' 
    | 'toggle' 
    | 'table'
    | 'image'
    | 'link'
    | 'ai';

export interface OutlineItem {
    id: string;
    type: string;
    label: string;
    targetId: string; // The DOM element ID or node ID to scroll to
    children: OutlineItem[];
    indent: number;
    headingLevel: number; // 1 for H1/Cards, 2 for H2, 3 for H3, 4 for others
    nodeId?: string; // Owner or target node ID
    checked?: boolean; // For checklist items
    listIndex?: number; // For numbered lists
    metadata?: BlockMetadata; // Raw block metadata
    isFolder?: boolean;
    childCount?: number;
    isLocked?: boolean;
    isFavorite?: boolean;
    iconVariant: OutlineIconVariant;
    nodeType?: string;
}

/**
 * Strips HTML tags, Markdown symbols (bold, italic, code, quotes, headers),
 * and leading markers from text for clean outline presentation.
 */
export function cleanBlockContent(raw: string | undefined): string {
    if (!raw) return '';
    return raw
        .replace(/<[^>]*>?/gm, '') // Strip HTML tags
        .replace(/[*_~`#]/g, '')   // Strip markdown markers like **, *, _, ~~, `, #
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
        .replace(/^\s*[-*+•]\s+/, '') // Strip leading bullet markers
        .replace(/^\s*\d+\.\s+/, '') // Strip leading number prefixes like "1. "
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
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
 * Determines an icon variant for blocks inside a node.
 */
function determineBlockIconVariant(blockType: string): OutlineIconVariant {
    switch (blockType) {
        case 'heading1':
            return 'h1';
        case 'heading2':
            return 'h2';
        case 'heading3':
            return 'h3';
        case 'bullet':
            return 'bullet';
        case 'numbered':
            return 'numbered';
        case 'todo':
            return 'todo';
        case 'callout':
            return 'callout';
        case 'quote':
            return 'quote';
        case 'code':
            return 'code';
        case 'toggle':
            return 'toggle';
        case 'table':
            return 'table';
        case 'image':
        case 'video':
        case 'media':
            return 'image';
        case 'link':
            return 'link';
        case 'ai':
            return 'ai';
        default:
            return 'block';
    }
}

/**
 * Parses blocks inside a single card/note into outline items.
 */
function parseBlocksInsideNode(
    blocks: Block[],
    ownerNodeId: string,
    allNodes: AppNode[],
    baseLevel = 1
): OutlineItem[] {
    const items: OutlineItem[] = [];
    let i = 0;
    let sequentialListIndex = 1;

    while (i < blocks.length) {
        const block = blocks[i];
        const isHeading = ['heading1', 'heading2', 'heading3'].includes(block.type);
        const isToggle = block.type === 'toggle';
        const isPage = block.type === 'page';
        const isTodo = block.type === 'todo';
        const isBullet = block.type === 'bullet';
        const isNumbered = block.type === 'numbered';
        const isCallout = block.type === 'callout';
        const isQuote = block.type === 'quote';
        const isCode = block.type === 'code';

        if (isNumbered) {
            sequentialListIndex++;
        } else {
            sequentialListIndex = 1;
        }

        const isSupported = isHeading || isToggle || isPage || isTodo || isBullet || isNumbered || isCallout || isQuote || isCode || block.content?.trim();

        if (isSupported) {
            let headingLevel = 4;
            if (block.type === 'heading1') headingLevel = 1;
            else if (block.type === 'heading2') headingLevel = 2;
            else if (block.type === 'heading3') headingLevel = 3;

            let children: OutlineItem[] = [];

            // 1. Indented children for toggles
            if (isToggle) {
                const toggleIndent = block.indent || 0;
                const toggleChildrenBlocks: Block[] = [];
                let j = i + 1;
                while (j < blocks.length && (blocks[j].indent || 0) > toggleIndent) {
                    toggleChildrenBlocks.push(blocks[j]);
                    j++;
                }
                if (toggleChildrenBlocks.length > 0) {
                    children = parseBlocksInsideNode(toggleChildrenBlocks, ownerNodeId, allNodes, baseLevel + 1);
                }
                i = j - 1;
            }

            // 2. Recursive page children (sub-notes)
            if (isPage && block.metadata?.nodeId) {
                const subId = block.metadata.nodeId;
                const subNode = allNodes.find(n => n.id === subId);
                if (subNode) {
                    const subBlocks = getNodeBlocks(subNode.data) || [];
                    const directChildNodes = allNodes.filter(n => n.parentId === subId);
                    const subItems = parseBlocksInsideNode(subBlocks, subId, allNodes, baseLevel + 1);
                    const childNodeItems = directChildNodes.map(cn => buildNodeItem(cn, allNodes, baseLevel + 1));
                    children = [...subItems, ...childNodeItems];
                }
            }

            const rawContent = block.content || (block.type === 'page' ? 'Untitled Page' : '');
            const cleanLabel = cleanBlockContent(rawContent) || (block.type === 'page' ? 'Untitled Page' : (block.type.charAt(0).toUpperCase() + block.type.slice(1)));

            items.push({
                id: block.id,
                type: block.type,
                label: cleanLabel,
                targetId: block.type === 'page' ? (block.metadata?.nodeId || block.id) : `block-${block.id}`,
                children,
                indent: block.indent || 0,
                headingLevel,
                nodeId: block.metadata?.nodeId || ownerNodeId,
                checked: block.metadata?.checked || false,
                listIndex: isNumbered ? (sequentialListIndex - 1) : undefined,
                metadata: block.metadata,
                isFolder: isPage || children.length > 0,
                childCount: children.length > 0 ? children.length : undefined,
                iconVariant: isPage ? 'folder' : determineBlockIconVariant(block.type)
            });
        }
        i++;
    }

    return nestHeadingHierarchy(items);
}

/**
 * Builds an outline item for a top-level or child AppNode.
 */
function buildNodeItem(node: AppNode, allNodes: AppNode[], level = 0): OutlineItem {
    const rawLabel = getNodeLabel(node.data) || (node.data as any)?.title || (node.type === 'fused-note' ? 'Fused File' : 'Untitled');
    const cleanLabel = cleanBlockContent(typeof rawLabel === 'string' ? rawLabel : '') || (node.type === 'fused-note' ? 'Fused File' : 'Untitled');
    
    // Child nodes in canvas tree
    const childNodes = allNodes.filter(n => n.parentId === node.id);
    const sortedChildNodes = sortNodesVisually(childNodes);
    const childNodeItems = sortedChildNodes.map(child => buildNodeItem(child, allNodes, level + 1));

    // Internal blocks inside node
    const contentBlocks = getNodeBlocks(node.data) || [];
    const blockItems = parseBlocksInsideNode(contentBlocks, node.id, allNodes, level + 1);

    const children = [...childNodeItems, ...blockItems];
    const totalChildCount = (childNodes.length > 0 ? childNodes.length : 0) + (blockItems.length > 0 ? blockItems.length : 0);

    // Specific user rule:
    // Card (node.type === 'note') -> Folder icon
    // Fused node (node.type === 'fused-note') -> File icon
    // Block -> Block icon
    let iconVariant: OutlineIconVariant = 'folder';
    if (node.type === 'fused-note') {
        iconVariant = 'file';
    } else if (node.type === 'block') {
        iconVariant = 'block';
    } else if (node.type === 'note') {
        iconVariant = 'folder';
    }

    const isLocked = !!(node.data as any)?.isLocked || !!(node.data as any)?.locked;
    const isFavorite = !!(node.data as any)?.isPinned || (node.data as any)?.priority === 'urgent';

    return {
        id: node.id,
        type: node.type as OutlineItem['type'],
        label: cleanLabel,
        targetId: node.id,
        children,
        indent: level,
        headingLevel: 1,
        nodeId: node.id,
        isFolder: children.length > 0,
        childCount: totalChildCount > 0 ? totalChildCount : undefined,
        isLocked,
        isFavorite,
        iconVariant,
        nodeType: node.type
    };
}

/**
 * Logically nests headings (H2 under H1, H3 under H2) in an outline item tree.
 */
function nestHeadingHierarchy(items: OutlineItem[]): OutlineItem[] {
    const nested: OutlineItem[] = [];
    const stack: OutlineItem[] = [];

    items.forEach(item => {
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
 * Builds the complete outline tree for a page/node or whole current canvas context.
 */
export function buildTOCTree(nodeId: string | null, allNodes: AppNode[], level = 0): OutlineItem[] {
    // If drilled down inside a specific parent card context
    if (nodeId) {
        const parentNode = allNodes.find(n => n.id === nodeId);
        const childNodes = allNodes.filter(n => n.parentId === nodeId);
        const sortedChildNodes = sortNodesVisually(childNodes);
        const childItems = sortedChildNodes.map(child => buildNodeItem(child, allNodes, level));

        const contentBlocks = parentNode ? (getNodeBlocks(parentNode.data) || []) : [];
        const blockItems = parentNode ? parseBlocksInsideNode(contentBlocks, parentNode.id, allNodes, level) : [];

        return [...childItems, ...blockItems];
    }

    // Root context: gather all top-level nodes on canvas (parentId is null or undefined)
    const rootNodes = allNodes.filter(n => !n.parentId);
    const validRootNodes = rootNodes.filter(n => 
        ['note', 'fused-note', 'block', 'kanban'].includes(n.type)
    );

    const sortedRoots = sortNodesVisually(validRootNodes);
    return sortedRoots.map(node => buildNodeItem(node, allNodes, level));
}
