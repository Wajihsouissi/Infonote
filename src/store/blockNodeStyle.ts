import { v4 as uuidv4 } from 'uuid';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types';
import type { Block } from '../features/editor/types';
import { BASE_UNIT, snapToGridValue } from '../config/layout';

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
        case 'image':
        case 'video':
        case 'file':
            return { ...profile.image };
        case 'code':
            return { ...profile.code };
        case 'table':
            return { ...profile.table };
        case 'callout':
        case 'quote':
        case 'link':
            return { width: 432, height: 100 };
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
    radius: number;
}

/** Arrange `outerBlocks` in a ring around `centerNode`, connecting each to the
 *  center. Uses the release sizing profile (its only caller). */
export const buildRadialCluster = (
    centerNode: AppNode,
    outerBlocks: Block[],
    centerPos: { x: number; y: number },
    opts: { parentId: string | undefined; parentIdForEdge: string | null },
): RadialCluster => {
    const { parentId, parentIdForEdge } = opts;
    const clusterNodes: AppNode[] = [centerNode];
    const clusterEdges: Edge[] = [];

    if (outerBlocks.length === 0) return { nodes: clusterNodes, edges: clusterEdges, radius: 0 };

    const outerStyles = outerBlocks.map(b => getBlockNodeStyle(b, RELEASE_SIZE_PROFILE, false));
    const maxOuterWidth = Math.max(...outerStyles.map(s => s.width));
    const minRadius = BASE_UNIT * 4;
    const estimatedRadius = outerBlocks.length <= 1
        ? minRadius
        : (maxOuterWidth * 1.5) / (2 * Math.sin(Math.PI / outerBlocks.length));
    const r = snapToGridValue(Math.max(minRadius, estimatedRadius));
    const angleStep = (2 * Math.PI) / outerBlocks.length;
    const angleOffset = -Math.PI / 2;

    outerBlocks.forEach((block, idx) => {
        const angle = angleOffset + angleStep * idx;
        const x = snapToGridValue(centerPos.x + r * Math.cos(angle));
        const y = snapToGridValue(centerPos.y + r * Math.sin(angle));
        const node = createBlockNode(block, { x, y }, outerStyles[idx], parentId);
        clusterNodes.push(node);
        clusterEdges.push({
            id: uuidv4(),
            source: centerNode.id,
            target: node.id,
            type: 'centered',
            data: { parentId: parentIdForEdge },
        } as Edge);
    });

    return { nodes: clusterNodes, edges: clusterEdges, radius: r + maxOuterWidth / 2 };
};
