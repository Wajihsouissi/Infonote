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
    /** Unresolved media — renders the picker, then becomes image/video/file. */
    | 'media'
    | 'image'
    | 'video'
    | 'file'
    /** Bento container for media — what two pieces of media make when they meet. */
    | 'gallery'
    | 'page'
    | 'container'
    | 'columns'
    | 'code'
    | 'color'
    | 'link'
    | 'ai';

export type BlockAlignment = 'left' | 'center' | 'right';

/**
 * Where a dragged block lands relative to the block under the cursor.
 * `center` means "into it" rather than "next to it" — offered only when both
 * sides are media, where it merges them into a gallery.
 */
export type BlockDropPosition = 'top' | 'bottom' | 'center';

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
    // Gallery — the media it holds are ordinary media blocks, so a block can
    // move between "loose on the canvas" and "tile on a board" unchanged.
    items?: Block[];
    galleryLayout?: 'bento' | 'grid' | 'masonry' | 'scatter';
    galleryFit?: 'cover' | 'contain';
    /** Hand-dragged board height, in px. The board scales its tiles to fill it.
     *  Absent means the board sizes itself to its contents. */
    galleryHeight?: number;
    /** Set on an ITEM, not the gallery: its hand-picked bento footprint. */
    span?: 'sm' | 'wide' | 'tall' | 'lg';
    /**
     * Set on an ITEM: a downscaled copy of `content`, drawn in the tile so a
     * board of twenty photographs isn't twenty full-resolution bitmaps decoded
     * at thumbnail size. `content` stays the original and is what the lightbox
     * and every export path use — this is a render optimisation, never the
     * picture of record.
     */
    thumb?: string;
    /**
     * Set on an ITEM: the focal point of the picture, as percentages fed
     * straight to `object-position`. Absent means centred, which is what
     * `cover` already does on its own.
     */
    focal?: { x: number; y: number };
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
