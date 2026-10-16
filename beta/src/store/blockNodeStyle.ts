import { v4 as uuidv4 } from 'uuid';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types';
import type { Block } from '../features/editor/types';
import { BASE_UNIT, snapToGridValue, MIN_EXPANDED_SIZE } from '../config/layout';
import { FILE_CLOSED_SIZE, FILE_OPEN_SIZE } from '../features/file/fileView';

/**
 * blockNodeStyle
 * --------------------------------------------------------------------------
 * Shared sizing/text helpers and standalone-block builders used when editor
 * blocks are turned into canvas nodes (release-to-blocks and canvas
 * hydration). Previously these were duplicated inline inside nodeSlice with
 * subtly drifted values; the per-flow differences now live entirely in the
 * `NodeSizeProfile` passed in, so the rest of the logic is shared.
 */

export interface BlockSize {
    width: number;
    height: number;
}

/** Strip whitespace and the zero-width / non-breaking chars used as "empty" markers. */
export const normalizeText = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[\n\u200B\u00A0\u200C\uFEFF]/g, '');
};

/** Plain text of a block's content. Canonical blocks store a string; the array
 *  branch defends against rich-text content shapes. */
export const blockText = (content: unknown): string => {
    if (Array.isArray(content)) return content.map((c: { text?: string } | null | undefined) => c?.text || '').join('');
    return typeof content === 'string' ? content : '';
};

const HEADING_TYPES = new Set(['heading1', 'heading2', 'heading3']);

/** Media sizing that differs per flow. "Release content to blocks" uses compact
 *  media nodes; canvas hydration uses larger ones. Everything else is shared. */
export interface NodeSizeProfile {
    image: BlockSize;
    code: BlockSize;
    table: BlockSize;
}

export const RELEASE_SIZE_PROFILE: NodeSizeProfile = {
    image: { width: 200, height: 200 },
    code: { width: 432, height: 160 },
    table: { width: 360, height: 180 },
};

export const HYDRATE_SIZE_PROFILE: NodeSizeProfile = {
    image: { width: 300, height: 300 },
    code: { width: 432, height: 250 },
    table: { width: 450, height: 300 },
};

/** Canvas-node footprint for a single block. Matches the two former inline
 *  `getNodeStyle` helpers exactly; the media/code/table sizes come from `profile`. */
export const getBlockNodeStyle = (
    block: Block,
    profile: NodeSizeProfile,
    isHeading: boolean = HEADING_TYPES.has(block?.type),
): BlockSize => {
    if (isHeading) return { width: 220, height: 80 };

    // Widened: legacy saves may carry retired types like 'numberedListItem'.
    switch (block.type as string) {
        // A file lands as its closed card — the folder card's square. An empty
        // file block is still just the media picker, so it keeps the media
        // footprint until something is actually in it.
        case 'file':
            return block.content?.trim()
                ? { ...(block.metadata?.fileView === 'expandedfile' ? FILE_OPEN_SIZE : FILE_CLOSED_SIZE) }
                : { ...profile.image };
        case 'media':
        case 'image':
        case 'video':
            return { ...profile.image };
        // A board released onto the canvas needs room for its bento columns —
        // at the media footprint it would come out as a single stack of thumbs.
        case 'gallery':
            return { width: 432, height: 300 };
        case 'code':
            return { ...profile.code };
        case 'table':
            return { ...profile.table };
        case 'callout':
        case 'quote':
        case 'link':
            return { width: MIN_EXPANDED_SIZE, height: 100 };
        case 'todo':
        case 'bullet':
        case 'numbered':
        case 'numberedListItem':
            return { width: 260, height: 70 };
        default: {
            const len = normalizeText(blockText(block.content)).length;
            if (len < 50) return { width: 260, height: 70 };
            if (len < 200) return { width: 300, height: 100 };
            return { width: 340, height: 140 };
        }
    }
};

/** A single block wrapped as a standalone `block` canvas node. */
export const createBlockNode = (
    block: Block,
    position: { x: number; y: number },
    style: BlockSize,
    parentId: string | undefined,
): AppNode => ({
    id: uuidv4(),
    type: 'block',
    position,
    style,
    data: { content: [block], isStandaloneBlock: true },
    parentId,
} as AppNode);

export interface RadialCluster {
    nodes: AppNode[];
    edges: Edge[];
    /** Exact footprint, used to pack several released sections safely. */
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    radius: number;
}

/**
 * Arrange released blocks as an outward branch from their first block. This
 * keeps the release operation on the current canvas, but reserves a real lane
 * for every card instead of estimating a ring from card widths. Large text,
 * media, and code cards therefore cannot collide with their siblings.
 */
export const buildRadialCluster = (
    centerNode: AppNode,
    outerBlocks: Block[],
    centerPos: { x: number; y: number },
    opts: { parentId: string | undefined; parentIdForEdge: string | null },
): RadialCluster => {
    const { parentId, parentIdForEdge } = opts;
    const clusterNodes: AppNode[] = [centerNode];
    const clusterEdges: Edge[] = [];
    const centerWidth = typeof centerNode.style?.width === 'number' ? centerNode.style.width : 220;
    const centerHeight = typeof centerNode.style?.height === 'number' ? centerNode.style.height : 80;

    if (outerBlocks.length === 0) {
        return {
            nodes: clusterNodes,
            edges: clusterEdges,
            bounds: {
                minX: centerPos.x,
                minY: centerPos.y,
                maxX: centerPos.x + centerWidth,
                maxY: centerPos.y + centerHeight,
            },
            radius: Math.max(centerWidth, centerHeight) / 2,
        };
    }

    const outerStyles = outerBlocks.map(b => getBlockNodeStyle(b, RELEASE_SIZE_PROFILE, false));
    const branchGap = BASE_UNIT * 2;
    const siblingGap = BASE_UNIT;
    const totalOuterHeight = outerStyles.reduce((total, style) => total + style.height, 0)
        + siblingGap * (outerStyles.length - 1);
    const outerX = snapToGridValue(centerPos.x + centerWidth + branchGap);
    let outerY = centerPos.y + centerHeight / 2 - totalOuterHeight / 2;

    outerBlocks.forEach((block, idx) => {
        const style = outerStyles[idx];
        const node = createBlockNode(block, {
            x: outerX,
            y: snapToGridValue(outerY),
        }, style, parentId);
        clusterNodes.push(node);
        clusterEdges.push({
            id: uuidv4(),
            source: centerNode.id,
            target: node.id,
            type: 'centered',
            data: { parentId: parentIdForEdge },
        } as Edge);
        outerY += style.height + siblingGap;
    });

    const minY = Math.min(centerPos.y, ...clusterNodes.slice(1).map((node) => node.position.y));
    const maxY = Math.max(
        centerPos.y + centerHeight,
        ...clusterNodes.slice(1).map((node, index) => node.position.y + outerStyles[index].height),
    );
    const maxX = Math.max(centerPos.x + centerWidth, outerX + Math.max(...outerStyles.map((style) => style.width)));
    return {
        nodes: clusterNodes,
        edges: clusterEdges,
        bounds: { minX: centerPos.x, minY, maxX, maxY },
        radius: Math.max(maxX - centerPos.x, maxY - minY) / 2,
    };
};
