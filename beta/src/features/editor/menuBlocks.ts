import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockMetadata } from './types';
import type { MenuItem } from './menuConstants';
import { isMediaType } from './mediaTypes';
import { createGalleryMetadata, GALLERY_NODE_WIDTH } from './galleryTypes';
import { MIN_EXPANDED_SIZE } from '../../config/layout';

/*
 * One definition of "a new block from a menu", shared by every menu that
 * creates one (bottom bar, right-click menu, canvas "/" menu) so a block looks
 * the same whichever way it was added.
 */

type MenuEntry = Pick<MenuItem, 'type' | 'meta'>;

/** A fresh table: a header row and one empty row. Seeded at creation so the
 *  table never has to write its own defaults on mount — that write would land
 *  as a separate, surprising undo step. */
export const emptyTableMetadata = (): BlockMetadata => ({
    rows: [['Column 1', 'Column 2'], ['', '']],
    alignments: ['left', 'left'],
});

/** Fresh columns, each seeded with an empty text block to type into. */
export const emptyColumnsMetadata = (count = 2): BlockMetadata => ({
    columns: Array.from({ length: count }, () => ({
        id: uuidv4(),
        content: [{ id: uuidv4(), type: 'text' as const, content: '' }],
    })),
});

/**
 * A fresh, empty block. Columns, tables and galleries come with their empty
 * structure — without it they render as empty boxes.
 */
export function createMenuBlock(item: MenuEntry): Block {
    const metadata = item.type === 'columns' ? emptyColumnsMetadata(item.meta?.count || 2)
        : item.type === 'table' ? emptyTableMetadata()
            : item.type === 'gallery' ? createGalleryMetadata([], item.meta)
                : item.meta;
    return { id: uuidv4(), type: item.type, content: '', ...(metadata ? { metadata } : {}) };
}

/**
 * The size a new standalone block starts at on the canvas. Each column needs
 * ~220px to be editable (four columns lay out as 2×2); media starts at its own
 * 208 footprint rather than snapping to it on mount; a table opens wide enough
 * for its default columns instead of with a permanent horizontal scrollbar.
 */
export function menuBlockNodeSize(item: MenuEntry): { width: number; height: number } {
    const columnCount = item.type === 'columns' ? (item.meta?.count || 2) : 0;
    const columnsPerRow = columnCount === 4 ? 2 : columnCount;
    const width = item.type === 'columns' ? Math.max(550, columnsPerRow * 220)
        : item.type === 'gallery' ? GALLERY_NODE_WIDTH
            : isMediaType(item.type) ? 208
                : item.type === 'table' ? MIN_EXPANDED_SIZE
                    : 300;
    return { width, height: 100 };
}
