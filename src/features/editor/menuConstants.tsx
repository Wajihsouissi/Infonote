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
    ImagePlay,
    Columns2,
    Code,
    Palette,
    Link,
    Sparkles,
    LayoutGrid
} from '../../components/icons';
import type { BlockType, BlockMetadata } from './types';

export interface MenuItem {
    label: string;
    description?: string;
    type: BlockType;
    icon: React.ElementType;
    keywords?: string[];
    meta?: BlockMetadata;
}

export const MENU_ITEMS: MenuItem[] = [
    // AI Generation
    { label: 'Generate with AI', description: 'Ask AI to write for you', type: 'ai', icon: Sparkles, keywords: ['ai', 'generate', 'magic', 'write'] },

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
    { label: 'Smart Link', description: 'Embed a smart bookmark or iframe link', type: 'link', icon: Link, keywords: ['link', 'bookmark', 'embed', 'youtube', 'figma', 'spotify'] },

    // Media — one block for every kind. It resolves itself to image/video/file from
    // whatever you drop, paste or link, so the old three entries are folded in here
    // (their names stay as keywords: /image, /video and /file all still find it).
    {
        label: 'Media',
        description: 'Upload, drop or paste an image, video, or any file',
        type: 'media',
        icon: ImagePlay,
        keywords: [
            'media', 'upload', 'attach', 'attachment',
            'image', 'picture', 'photo', 'png', 'jpg', 'gif', 'svg',
            'video', 'movie', 'mp4', 'youtube',
            'file', 'document', 'pdf', 'audio',
        ],
    },

    // Gallery — media arranged as a composition. Two pieces of media dropped on
    // each other make one of these on their own; this is the way in from a blank
    // block, for people who know they want a board before they have the pictures.
    {
        label: 'Gallery',
        description: 'A bento moodboard — arrange images and video side by side',
        type: 'gallery',
        icon: LayoutGrid,
        keywords: ['gallery', 'moodboard', 'mood board', 'bento', 'grid', 'collage', 'album', 'photos', 'masonry', 'board'],
    },

    // Layouts
    { label: 'Columns', description: 'Side-by-side layout — add or remove columns anytime', type: 'columns', icon: Columns2, keywords: ['cols', 'columns', 'layout', 'grid', 'side by side'], meta: { count: 2 } },
    { label: 'Color Block', description: 'Display a color swatch', type: 'color', icon: Palette, keywords: ['color', 'swatch', 'hex'] },
];
