import type { Block } from '../../features/editor/types';

/**
 * The shapes the mind-map engine passes between its stages: what a node is,
 * what a link between two nodes is, and the plan that holds both.
 */

export interface HydrationChunk {
    id: string;
    type: 'fused-note' | 'block';
    blocks: Block[];
    level: number;
    /** Parent in the layout/hierarchy tree (a solid edge is drawn for this). */
    sourceId?: string;
    style?: { width: number; height: number };
}

export interface RelatedEdge {
    source: string;
    target: string;
    score: number;
}

export interface HydrationPlan {
    chunks: HydrationChunk[];
    relatedEdges: RelatedEdge[];
}
