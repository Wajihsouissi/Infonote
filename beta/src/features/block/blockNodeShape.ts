import type { Block } from '../editor/types';
import { HIGHLIGHT_PATTERN } from '../editor/inlineFormat';
import { isMediaType } from '../editor/mediaTypes';
import { isGalleryType } from '../editor/galleryTypes';
import { getFileView, isFileBlock, type FileView } from '../file';

/* Resize bounds for a standard block. These mirror --block-node-w and
   --block-node-max-user in design-system.css §5; the drag clamps to them and
   CSS enforces the same floor, so the two can't disagree. A block grows to
   --block-node-max (432) on its own — dragging is what takes it past that. */
export const BLOCK_MIN_W = 260;
export const BLOCK_MAX_USER_W = 800;
export const BLOCK_MIN_H = 56;
/** Narrowest a table node may be dragged. */
export const TABLE_MIN_W = 240;

/** A colour block with no stored value paints this. */
const DEFAULT_SWATCH = '#1E944A';

const STANDARD_BLOCK_NODE_TYPES = new Set([
    'text', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered',
    'todo', 'callout', 'code', 'quote', 'link', 'toggle',
]);

/* Blocks whose whole content is a line of prose. Converting one of these to a
   card has an obvious title — the line itself — so it becomes a title-view
   card. A todo (its tick would be lost), code (its formatting is the point), a
   link, and a toggle (it has children) all keep the block as card content. */
export const TITLE_BLOCK_TYPES = new Set([
    'text', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'quote', 'callout',
]);

/** Markdown is the storage format; a card title wants the words only. */
export function titleFromBlock(raw: string): string {
    return raw
        .replace(HIGHLIGHT_PATTERN, '$2')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
        .replace(/\+\+(.+?)\+\+/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/^#{1,6}\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Whether this content uses the compact standalone-block shell. */
function usesStandardBlockShell(blocks: Block[]) {
    const first = blocks[0];
    if (!first) return false;
    if (first.type === 'toggle') return true;
    if (blocks.length !== 1 || !STANDARD_BLOCK_NODE_TYPES.has(first.type)) return false;
    const linkMode = first.type === 'link' ? first.metadata?.displayMode ?? 'bookmark' : undefined;
    const isRichLink = first.type === 'link'
        && Boolean(first.content.trim())
        && (linkMode === 'bookmark' || linkMode === 'embed');
    return !isRichLink;
}

const isBlank = (block: Block | undefined) => !block?.content || block.content.trim() === '';

/**
 * What kind of canvas block a node's content makes it. Everything about a
 * block node — its size rules, its surface, which handles it shows — follows
 * from this, so it is derived in one place rather than flag by flag.
 */
export function describeBlockNode(blocks: Block[]) {
    const single = blocks.length === 1 ? blocks[0] : undefined;
    const type = single?.type;

    const isSingleMedia = isMediaType(type);
    // A board is a wide object like a table or a column set: it owns its width,
    // sits on a transparent node so the tiles read edge to edge, and resizes.
    const isSingleGallery = isGalleryType(type);

    // A link renders in one of four ways. The bookmark / embed CARDS bring their
    // own full-bleed surface and are resizable objects (like media), so they sit
    // on a transparent node. The empty "paste a URL" input and the inline text
    // link are lightweight — they look like every other block.
    const linkMode = single?.metadata?.displayMode || 'bookmark';
    const isLinkCard = type === 'link' && !isBlank(single) && (linkMode === 'bookmark' || linkMode === 'embed');

    /* A file is a media block that grew a second state. Closed it is a card the
       size of a folder; open it is the live document. Which one shows is the
       block's own `metadata.fileView`, so the state survives the block moving
       between a card's content and the canvas. */
    const isSingleFile = isFileBlock(single);
    const fileView: FileView = isSingleFile ? getFileView(single) : 'file';
    const isFileClosed = isSingleFile && fileView === 'file';

    // A table is a wide object like a column set: it gets its own default width
    // and the drag handle, and resizes in width only (rows set the height).
    const isSingleTable = type === 'table';
    /* Once every column has a hand-set width, the TABLE owns the width and the
       node shrink-wraps to it (CSS: .blockNode:has([data-table-sized])). A
       pinned px width here would leave node background stranded beside a
       narrowed table. "Fit columns to width" in the column menu clears the
       widths and hands control back. */
    const tableColCount = isSingleTable ? (single?.metadata?.rows?.[0]?.length ?? 0) : 0;
    const tableWidths = isSingleTable ? single?.metadata?.columnWidths : undefined;
    const isTableSized = tableColCount > 0
        && Array.isArray(tableWidths)
        && tableWidths.length === tableColCount
        && tableWidths.every((w) => typeof w === 'number' && w > 0);

    // A toggle keeps its nested children in the SAME node, so it is still one
    // logical block however much content it holds.
    const isToggleRoot = blocks[0]?.type === 'toggle';
    const isSingleColor = type === 'color';

    return {
        singleBlock: single,
        isSingleMedia,
        isMediaEmpty: isSingleMedia && isBlank(single),
        isSingleGallery,
        isLinkCard,
        isSingleFile,
        fileView,
        isFileClosed,
        isFileOpen: isSingleFile && fileView === 'expandedfile',
        isSingleColor,
        swatch: isSingleColor ? (single?.content || DEFAULT_SWATCH) : undefined,
        isSingleNumbered: type === 'numbered',
        isSingleTable,
        isTableSized,
        isColumns: type === 'columns',
        isToggleRoot,
        hasMultipleRootBlocks: blocks.length > 1 && !isToggleRoot,
        // Link CARDS are resizable rich objects, not uniform 56px blocks; empty
        // and text links keep the standard footprint like the rest.
        isStandardBlock: usesStandardBlockShell(blocks),
        // Only the rich link cards resize — the empty input and text link do
        // not. A closed file card is a fixed object like the folder card it
        // mirrors; an open one is a page you can pull to any size.
        isResizable: (isSingleMedia && !isFileClosed) || isLinkCard || isSingleGallery,
    };
}

export type BlockNodeShape = ReturnType<typeof describeBlockNode>;
