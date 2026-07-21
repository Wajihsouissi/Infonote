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
    | 'columns'
    | 'code'
    | 'color'
    | 'link'
    | 'ai';

export type BlockAlignment = 'left' | 'center' | 'right';

/** A single column inside a `columns` block. */
export type ColumnData = {
    id: string;
    content: Block[];
};

/**
 * Per-block extras. All fields are optional because each block type uses its
 * own subset; unknown legacy keys survive via the index signature but read as
 * `unknown` so new code has to narrow them.
 */
export type BlockMetadata = {
    // Media (image / video / file)
    width?: number;
    height?: number;
    alignment?: BlockAlignment;
    name?: string;
    size?: number;
    type?: string;
    // Link block / bookmark preview
    title?: string;
    description?: string;
    favicon?: string;
    image?: string;
    embedUrl?: string;
    isEmbeddable?: boolean;
    displayMode?: 'bookmark' | 'embed' | 'text';
    isLoading?: boolean;
    // Todo / toggle
    checked?: boolean;
    isCollapsed?: boolean;
    dueDate?: string;
    toggleHeaderLevel?: number;
    // Callout / color
    icon?: string;
    backgroundColor?: string;
    textColor?: string;
    // Code
    language?: string;
    // Table
    rows?: string[][];
    columnWidths?: number[];
    rowHeights?: number[];
    alignments?: BlockAlignment[];
    // Columns layout
    columns?: ColumnData[];
    // Nested blocks (container / toggle children)
    blocks?: Block[];
    content?: Block[];
    // Page block
    nodeId?: string;
    customTitle?: string;
    // Columns block: requested column count when first created
    count?: number;
    [key: string]: unknown;
};

export type Block = {
    id: string;
    type: BlockType;
    content: string;
    metadata?: BlockMetadata;
    indent?: number; // 0 to 3 or more
};
