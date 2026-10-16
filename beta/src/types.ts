import type { Node } from '@xyflow/react';
import type { Block } from './features/editor/types';

/*
 * The canvas document model.
 *
 * The beta stores cards in exactly the full app's format, but declares only the
 * fields it reads or writes. Fields owned by features that are not in the beta
 * yet (card metadata, tasks, boards, AI provenance) are deliberately absent:
 * node data is only ever updated by merging a patch into the existing object,
 * so anything already stored is carried through untouched and is still there
 * when its feature comes back. Never rebuild a node's data field by field.
 */

/**
 * Strongly-typed payload carried on every canvas edge.
 * `parentId` mirrors the navigation context in which the edge was created
 * so we can scope visibility to the active drilled-down canvas.
 */
export type CanvasEdgeData = {
    parentId: string | null;
};

/** A card the AI made, and the receipt that says so. */
export type AIProvenanceSource = { kind: 'node'; id: string; title: string };

export type AIProvenance = {
    /** The assistant turn that made this, for jumping back to the transcript. */
    turnId: string;
    createdAt: string;
    model: string | null;
    effort: string;
    /** The request that produced it, trimmed. */
    prompt: string;
    sources: AIProvenanceSource[];
};

export type NoteData = {
    label: string;
    type?: 'text' | 'image' | 'task';
    content?: string | Block[];
    /**
     * A note becomes a dual-view document only after its content has been
     * intentionally brought onto its nested canvas. From then on, top-level
     * meaningful blocks carry the same identity in the editor and on the map.
     *
     * This is deliberately not inferred from merely opening a card: every card
     * can contain a canvas, but not every card promises that its prose and map
     * are the same set of ideas.
     */
    hasNestedCanvasSync?: boolean;
    /** Visible assurance for the two-view contract, with an honest exception
     * when a beta limit prevents a new written block from becoming a card. */
    nestedCanvasSync?: 'synced' | 'needs-review';
    nestedCanvasSyncMessage?: string;
    viewMode?: 'icon' | 'folder' | 'medium' | 'expanded' | 'chromeless' | 'titleview';
    /** Icon name — see features/card/iconMap.ts. */
    icon?: string;
    description?: string;
    coverImage?: string;
    color?: string;

    /* Hand-set size for a standalone canvas block, written by the resize
       handle. Their presence is what opts a block out of sizing itself to its
       text. userHeight is applied as a min-height floor, never a fixed height,
       so longer content still grows the block instead of being clipped. */
    userWidth?: number;
    userHeight?: number;

    /**
     * Where this card came from, when the AI made it.
     *
     * Stamped once at placement and never rewritten, so a card found three
     * weeks later still names the request, the model, the effort and the
     * sources that produced it. This is what makes an AI-made card auditable
     * after the chat that produced it is gone.
     */
    aiProvenance?: AIProvenance;

    createdAt?: string;
    updatedAt?: string;

    layout?: {
        columns?: number; // 1 | 2 | 3 | 4
    };

    // Animation Triggers
    lastFusedAt?: number;

    hideHoverMenu?: boolean;
};

export type NoteNode = Node<NoteData, 'note'> & { parentId?: string | null };

export type BlockNodeData = {
    content: Block[];
    aiProvenance?: AIProvenance;
    isStandaloneBlock?: boolean; // Flag to indicate standalone canvas block (not part of parent content)
    lastFusedAt?: number;
    color?: string;
    label?: string;
};

export type BlockNode = Node<BlockNodeData, 'block'> & { parentId?: string | null };

export type FusedNoteNodeData = {
    label?: string;
    content: Block[];
    aiProvenance?: AIProvenance;
    isStandaloneBlock?: boolean; // Flag to indicate standalone canvas block (not part of parent content)
    /** Structural information for a generated document tree. `topic-root` is
     * retained only to recognize and migrate saved legacy maps. */
    mapRole?: 'topic-root' | 'chapter' | 'section';

    // Animation Triggers
    lastFusedAt?: number;
    color?: string;
};

export type FusedNoteNode = Node<FusedNoteNodeData, 'fused-note'> & { parentId?: string | null };

export type AppNode = NoteNode | BlockNode | FusedNoteNode;

export const APP_NODE_TYPES = ['note', 'block', 'fused-note'] as const;
export type AppNodeType = (typeof APP_NODE_TYPES)[number];
export const isAppNodeType = (value: unknown): value is AppNodeType =>
    typeof value === 'string' && (APP_NODE_TYPES as readonly string[]).includes(value);

/** Data payload union across every canvas node type. */
export type AppNodeData = AppNode['data'];

/** Block-array content of a node, or undefined for string/absent content. */
export const getNodeBlocks = (data: AppNodeData): Block[] | undefined =>
    'content' in data && Array.isArray(data.content) ? data.content : undefined;

/** Label of a node, or undefined for node types without one. */
export const getNodeLabel = (data: AppNodeData): string | undefined =>
    'label' in data ? data.label : undefined;
