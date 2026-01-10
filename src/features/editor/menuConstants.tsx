import {
    Type,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    CheckSquare,
    ToggleRight,
    MessageSquare,
    Quote,
    Table,
    Minus,
    Image,
    Film,
    File,
    Columns2,
    Columns3,
    LayoutGrid
} from 'lucide-react';
import type { BlockType } from './types';

export interface MenuItem {
    label: string;
    type: BlockType;
    icon: React.ElementType;
    keywords?: string[];
    meta?: any;
}

export const MENU_ITEMS: MenuItem[] = [
    // Basic Text
    { label: 'Text', type: 'text', icon: Type, keywords: ['p', 'paragraph'] },
    { label: 'Heading 1', type: 'heading1', icon: Heading1, keywords: ['h1', 'title', 'big'] },
    { label: 'Heading 2', type: 'heading2', icon: Heading2, keywords: ['h2', 'subtitle', 'medium'] },
    { label: 'Heading 3', type: 'heading3', icon: Heading3, keywords: ['h3', 'small'] },

    // Lists
    { label: 'Bullet List', type: 'bullet', icon: List, keywords: ['ul', 'unordered', 'point'] },
    { label: 'Numbered List', type: 'numbered', icon: ListOrdered, keywords: ['ol', 'ordered', '1.'] },
    { label: 'To-do List', type: 'todo', icon: CheckSquare, keywords: ['check', 'box', 'task'] },
    { label: 'Toggle List', type: 'toggle', icon: ToggleRight, keywords: ['collapse', 'expand', 'summary'] },

    // Advanced Text
    { label: 'Callout', type: 'callout', icon: MessageSquare, keywords: ['box', 'note', 'alert'] },
    { label: 'Quote', type: 'quote', icon: Quote, keywords: ['blockquote', 'citation'] },
    { label: 'Divider', type: 'divider', icon: Minus, keywords: ['line', 'hr', 'separator'] },
    { label: 'Table', type: 'table', icon: Table, keywords: ['grid', 'rows', 'columns'] },

    // Media
    { label: 'Image', type: 'image', icon: Image, keywords: ['picture', 'photo', 'upload'] },
    { label: 'Video', type: 'video', icon: Film, keywords: ['movie', 'mp4', 'media'] },
    { label: 'File', type: 'file', icon: File, keywords: ['document', 'pdf', 'upload'] },

    // Layouts
    { label: '2 Columns', type: 'columns', icon: Columns2, keywords: ['2cols', 'layout', 'grid'], meta: { count: 2 } },
    { label: '3 Columns', type: 'columns', icon: Columns3, keywords: ['3cols', 'layout', 'grid'], meta: { count: 3 } },
    { label: '4 Columns', type: 'columns', icon: LayoutGrid, keywords: ['4cols', 'layout', 'grid'], meta: { count: 4 } },
];
