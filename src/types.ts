import type { Node } from '@xyflow/react';

export type NoteData = {
    label: string;
    type?: 'text' | 'image' | 'task';
    content?: string | any[];
    viewMode?: 'icon' | 'medium' | 'expanded' | 'chromeless';
    icon?: string; // Lucide icon name
    description?: string;
    category?: string; // Allow legacy or keep as string
    coverImage?: string;
    date?: string; // User manually set date? Or purely decorative?

    // New Fields
    tags?: string[];
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    status?: 'todo' | 'in-progress' | 'review' | 'done';
    dueDate?: string; // ISO
    assignee?: string;
    url?: string;
    color?: string;
    order?: number; // Kanban order
    progress?: number; // 0-100 completion percentage
    subtasks?: { id: string; text: string; completed: boolean }[]; // Checklist items

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
};

export type NoteNode = Node<NoteData, 'note'> & { parentId?: string | null };

export type BlockNodeData = {
    content: any[];
    isStandaloneBlock?: boolean; // Flag to indicate standalone canvas block (not part of parent content)
    lastFusedAt?: number;
};

export type BlockNode = Node<BlockNodeData, 'block'> & { parentId?: string | null };

export type FusedNoteNodeData = {
    content: any[];
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
};

export type KanbanNode = Node<KanbanNodeData, 'kanban'> & { parentId?: string | null };

export type AppNode = NoteNode | BlockNode | FusedNoteNode | KanbanNode;
