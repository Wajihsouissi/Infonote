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
    LayoutGrid,
    Code
} from 'lucide-react';
import type { BlockType } from './types';

export interface MenuItem {
    label: string;
    description?: string;
    type: BlockType;
    icon: React.ElementType;
    keywords?: string[];
    meta?: any;
}

export const MENU_ITEMS: MenuItem[] = [
    // Basic Text
    { label: 'Text', description: 'Plain text paragraph', type: 'text', icon: Type, keywords: ['p', 'paragraph'] },
    { label: 'Heading 1', description: 'Big section heading', type: 'heading1', icon: Heading1, keywords: ['h1', 'title', 'big'] },
    { label: 'Heading 2', description: 'Medium section heading', type: 'heading2', icon: Heading2, keywords: ['h2', 'subtitle', 'medium'] },
    { label: 'Heading 3', description: 'Small section heading', type: 'heading3', icon: Heading3, keywords: ['h3', 'small'] },

    // Lists
    { label: 'Bullet List', description: 'Simple bullet points', type: 'bullet', icon: List, keywords: ['ul', 'unordered', 'point'] },
    { label: 'Numbered List', description: 'Ordered list', type: 'numbered', icon: ListOrdered, keywords: ['ol', 'ordered', '1.'] },
    { label: 'To-do List', description: 'Track tasks', type: 'todo', icon: CheckSquare, keywords: ['check', 'box', 'task'] },
    { label: 'Toggle List', description: 'Collapsible content', type: 'toggle', icon: ToggleRight, keywords: ['collapse', 'expand', 'summary'] },

    // Advanced Text
    { label: 'Callout', description: 'Highlight information', type: 'callout', icon: MessageSquare, keywords: ['box', 'note', 'alert'] },
    { label: 'Code', description: 'Capture a code snippet', type: 'code', icon: Code, keywords: ['code', 'block', 'snippet'] },
    { label: 'Quote', description: 'Capture a quote', type: 'quote', icon: Quote, keywords: ['blockquote', 'citation'] },
    { label: 'Divider', description: 'Visual separator', type: 'divider', icon: Minus, keywords: ['line', 'hr', 'separator'] },
    { label: 'Table', description: 'Tabular data', type: 'table', icon: Table, keywords: ['grid', 'rows', 'columns'] },

    // Media
    { label: 'Image', description: 'Upload or embed image', type: 'image', icon: Image, keywords: ['picture', 'photo', 'upload'] },
    { label: 'Video', description: 'Embed video', type: 'video', icon: Film, keywords: ['movie', 'mp4', 'media'] },
    { label: 'File', description: 'Upload file attachment', type: 'file', icon: File, keywords: ['document', 'pdf', 'upload'] },

    // Layouts
    { label: '2 Columns', description: 'Side-by-side layout', type: 'columns', icon: Columns2, keywords: ['2cols', 'layout', 'grid'], meta: { count: 2 } },
    { label: '3 Columns', description: 'Three column grid', type: 'columns', icon: Columns3, keywords: ['3cols', 'layout', 'grid'], meta: { count: 3 } },
    { label: '4 Columns', description: 'Four column grid', type: 'columns', icon: LayoutGrid, keywords: ['4cols', 'layout', 'grid'], meta: { count: 4 } },
];
