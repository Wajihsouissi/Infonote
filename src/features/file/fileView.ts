/**
 * fileView
 * --------------------------------------------------------------------------
 * A file on the canvas is a `block` node holding one `file` block — not a node
 * type of its own. That was a deliberate choice: roughly twenty places in the
 * app hard-code the `note | block | fused-note` triad (drag and fuse, drop,
 * search, the AI runner, the context menu, and the loadGraph allow-list that
 * silently drops anything unlisted), and a file inherits every one of those
 * behaviours for free by being a block.
 *
 * Its open/closed state therefore lives on the block rather than the node:
 * `metadata.fileView`. Putting it there means the state travels with the block
 * when it moves between a card's content and the canvas, the same choice
 * `galleryLayout` and `span` already make.
 */
import type { Block } from '../editor/types';
import { type AppNode, type BlockNode, getNodeBlocks } from '../../types';
import { BASE_UNIT, MIN_EXPANDED_SIZE } from '../../config/layout';

/** `file` is the closed card; `expandedfile` is the live document. */
export type FileView = 'file' | 'expandedfile';

/** Closed: the folder card's footprint, because they are the same kind of
 *  object and should sit at the same weight on a board. */
export const FILE_CLOSED_SIZE = { width: 120, height: 120 } as const;

/** Open: a page. `MIN_EXPANDED_SIZE` wide is the expanded card's width, and
 *  11 base units tall lands within a hair of A4 at that width. */
export const FILE_OPEN_SIZE = { width: MIN_EXPANDED_SIZE, height: BASE_UNIT * 11 } as const;

export const isFileBlock = (block?: Block): boolean =>
    block?.type === 'file' && !!block.content?.trim();

/** The single `file` block a node is built around, or undefined when the node
 *  is anything else. */
export const fileBlockOf = (blocks: Block[] | undefined): Block | undefined => {
    if (!Array.isArray(blocks) || blocks.length !== 1) return undefined;
    return isFileBlock(blocks[0]) ? blocks[0] : undefined;
};

/** A canvas node that is a file: a block node built around one `file` block. */
export const isFileNode = (node: AppNode): node is BlockNode =>
    node.type === 'block' && !!fileBlockOf(getNodeBlocks(node.data));

/** The file block of a node, or undefined when the node is anything else. */
export const nodeFileBlock = (node: AppNode): Block | undefined =>
    node.type === 'block' ? fileBlockOf(getNodeBlocks(node.data)) : undefined;

export const getFileView = (block?: Block): FileView =>
    block?.metadata?.fileView === 'expandedfile' ? 'expandedfile' : 'file';

export const sizeForFileView = (view: FileView) =>
    view === 'expandedfile' ? FILE_OPEN_SIZE : FILE_CLOSED_SIZE;
