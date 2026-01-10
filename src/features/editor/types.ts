export type BlockType =
    | 'text'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'bullet'
    | 'numbered'
    | 'todo'
    | 'toggle'
    | 'callout'
    | 'quote'
    | 'table'
    | 'divider'
    | 'image'
    | 'video'
    | 'file'
    | 'page'
    | 'container'
    | 'columns';

export type Block = {
    id: string;
    type: BlockType;
    content: string;
    metadata?: Record<string, any>;
    indent?: number; // 0 to 3 or more
};
