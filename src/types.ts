import type { Node } from '@xyflow/react';
import type { Block } from './features/editor/types';

/**
 * Strongly-typed payload carried on every canvas edge.
 * `parentId` mirrors the navigation context in which the edge was created
 * so we can scope visibility to the active drilled-down canvas.
 */
export type CanvasEdgeData = {
    parentId: string | null;
};

export type NoteData = {
    label: string;
    type?: 'text' | 'image' | 'task';
    content?: string | Block[];
    viewMode?: 'icon' | 'medium' | 'expanded' | 'chromeless' | 'titleview';
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
    order?: number; // Kanban order
    progress?: number; // 0-100 completion percentage
    subtasks?: { id: string; text: string; completed: boolean }[]; // Checklist items

    /* Hand-set size for a standalone canvas block, written by the resize
       handle. Their presence is what opts a block out of sizing itself to its
       text. userHeight is applied as a min-height floor, never a fixed height,
       so longer content still grows the block instead of being clipped. */
    userWidth?: number;
    userHeight?: number;

    // Auto
    createdAt?: string;
    updatedAt?: string;

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
};

export type NoteNode = Node<NoteData, 'note'> & { parentId?: string | null };

export type BlockNodeData = {
    content: Block[];
    isStandaloneBlock?: boolean; // Flag to indicate standalone canvas block (not part of parent content)
    lastFusedAt?: number;
    color?: string;
    // Transient: AI generation placeholder skeleton
    isAISkeleton?: boolean;
};

export type BlockNode = Node<BlockNodeData, 'block'> & { parentId?: string | null };

export type FusedNoteNodeData = {
    content: Block[];
    isStandaloneBlock?: boolean; // Flag to indicate standalone canvas block (not part of parent content)

    // Animation Triggers
    lastFusedAt?: number;
};

export type FusedNoteNode = Node<FusedNoteNodeData, 'fused-note'> & { parentId?: string | null };


export type KanbanColumn = {
    id: string;
    label: string;
    statusValue: string; // The value to set in NoteData.status
    color?: string;
    collapsed?: boolean;
};

export type KanbanNodeData = {
    label: string; // Board Name
    columns: KanbanColumn[];
    background?: string;
    swimlaneField?: 'assignee' | 'category' | 'priority' | null;
    sortBy?: 'dueDate' | 'priority' | 'createdAt' | 'label' | null;
    sortDirection?: 'asc' | 'desc';
    viewMode?: 'board' | 'table' | 'calendar' | 'timeline';
    tableColumns?: string[]; // Visible metadata columns in table view (e.g. ['tags', 'url', 'progress'])
};

export type KanbanNode = Node<KanbanNodeData, 'kanban'> & { parentId?: string | null };

export type AppNode = NoteNode | BlockNode | FusedNoteNode | KanbanNode;

/** Data payload union across every canvas node type. */
export type AppNodeData = AppNode['data'];

/** Block-array content of a node, or undefined for string/absent content (e.g. kanban). */
export const getNodeBlocks = (data: AppNodeData): Block[] | undefined =>
    'content' in data && Array.isArray(data.content) ? data.content : undefined;

/** Label of a node, or undefined for node types without one. */
export const getNodeLabel = (data: AppNodeData): string | undefined =>
    'label' in data ? data.label : undefined;
