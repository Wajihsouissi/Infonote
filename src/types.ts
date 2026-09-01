import type { Node } from '@xyflow/react';
import type { Block } from './features/editor/types';
import type { BoardPlanningFields, KanbanNodeData } from './features/kanban/kanbanTypes';
import type { StoredTask } from './features/card/cardTasks';
import type { YouTubeSourceRef, YouTubeStudyNodeData } from './features/youtube/youtubeStudy';

/**
 * Strongly-typed payload carried on every canvas edge.
 * `parentId` mirrors the navigation context in which the edge was created
 * so we can scope visibility to the active drilled-down canvas.
 */
export type CanvasEdgeData = {
    parentId: string | null;
};

/** A thing an AI answer leaned on: a card on this canvas, or a page on the web. */
export type AIProvenanceSource =
    | { kind: 'node'; id: string; title: string }
    | { kind: 'web'; url: string; title: string; host: string };

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
    icon?: string; // Lucide icon name
    description?: string;
    category?: string; // Allow legacy or keep as string
    coverImage?: string;
    date?: string; // User manually set date? Or purely decorative?
    showIcon?: boolean;

    // New Fields
    tags?: string[];
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    status?: 'todo' | 'in-progress' | 'review' | 'done';
    startDate?: string; // ISO
    dueDate?: string; // ISO
    assignee?: string;
    url?: string;
    color?: string;

    progress?: number; // 0-100 completion percentage
    /**
     * Tasks added against the card, and the details a `todo` block in the body
     * has nowhere to keep (description, start date, image).
     *
     * An entry carrying a `blockId` is an overlay on that block rather than a
     * task of its own — see features/card/cardTasks.ts, which is the only place
     * this should be read or written.
     */
    tasks?: StoredTask[];
    /** @deprecated Superseded by `tasks`; folded in on the first task write. */
    subtasks?: { id: string; text: string; completed: boolean }[];

    /* Hand-set size for a standalone canvas block, written by the resize
       handle. Their presence is what opts a block out of sizing itself to its
       text. userHeight is applied as a min-height floor, never a fixed height,
       so longer content still grows the block instead of being clipped. */
    userWidth?: number;
    userHeight?: number;

    /**
     * Where an AI-created card came from — ai-Plan.md §5.4.
     *
     * Stamped once at placement and never rewritten, so a card found three
     * weeks later still names the request, the model, the effort and the
     * sources that produced it. This is what makes an AI-made card auditable
     * after the chat that produced it is gone; it is also what the
     * "Created by AI" canvas filter keys off.
     */
    aiProvenance?: AIProvenance;

    // Auto
    createdAt?: string;
    updatedAt?: string;
    /** Personal rail preference: pinned notes appear before dated sections. */
    isPinned?: boolean;

    layout?: {
        columns?: number; // 1 | 2 | 3 | 4
    };

    // Animation Triggers
    lastFusedAt?: number;

    // View State
    showMetadata?: boolean;
    hideHoverMenu?: boolean;

    // Transient: AI generation placeholder card
    isAISkeleton?: boolean;

    /** Durable provenance for transcript quotes, moments, and timestamp clips. */
    sourceRef?: YouTubeSourceRef;

};

export type NoteNode = Node<NoteData, 'note'> & { parentId?: string | null };

export type BlockNodeData = BoardPlanningFields & {
    content: Block[];
    isStandaloneBlock?: boolean; // Flag to indicate standalone canvas block (not part of parent content)
    lastFusedAt?: number;
    color?: string;
    // Transient: AI generation placeholder skeleton
    isAISkeleton?: boolean;
    label?: string;
    /** Personal rail preference, same as a note's. A file node appears in the
     *  fullscreen rail beside notes, so it can be pinned there too. */
    isPinned?: boolean;
};

export type BlockNode = Node<BlockNodeData, 'block'> & { parentId?: string | null };

export type FusedNoteNodeData = BoardPlanningFields & {
    label?: string;
    content: Block[];
    isStandaloneBlock?: boolean; // Flag to indicate standalone canvas block (not part of parent content)
    /** Structural information for a generated document tree. `topic-root` is
     * retained only to recognize and migrate saved legacy maps. */
    mapRole?: 'topic-root' | 'chapter' | 'section';

    // Animation Triggers
    lastFusedAt?: number;
    color?: string;
};

export type FusedNoteNode = Node<FusedNoteNodeData, 'fused-note'> & { parentId?: string | null };

/**
 * A kanban board. Its cards are `note` nodes carrying this node's id as their
 * `parentId`; the board itself stores only the lanes and their order. See
 * features/kanban/kanbanTypes.ts for why the cards' metadata stays the truth.
 */
export type KanbanNode = Node<KanbanNodeData, 'kanban'> & { parentId?: string | null };

export type YouTubeNode = Node<YouTubeStudyNodeData, 'youtube'> & { parentId?: string | null };

export type AppNode = NoteNode | BlockNode | FusedNoteNode | KanbanNode | YouTubeNode;

export const APP_NODE_TYPES = ['note', 'block', 'fused-note', 'kanban', 'youtube'] as const;
export const isAppNodeType = (value: unknown): value is (typeof APP_NODE_TYPES)[number] =>
    typeof value === 'string' && (APP_NODE_TYPES as readonly string[]).includes(value);

/** Data payload union across every canvas node type. */
export type AppNodeData = AppNode['data'];

/** Block-array content of a node, or undefined for string/absent content. */
export const getNodeBlocks = (data: AppNodeData): Block[] | undefined =>
    'content' in data && Array.isArray(data.content) ? data.content : undefined;

/** Label of a node, or undefined for node types without one. */
export const getNodeLabel = (data: AppNodeData): string | undefined =>
    'label' in data ? data.label : undefined;
