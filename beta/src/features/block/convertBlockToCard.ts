import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import type { AppNode } from '../../types';
import type { Block } from '../editor/types';
import { BASE_UNIT, MAX_WIDTH, MEDIUM_SIZE, MIN_EXPANDED_SIZE, getStrictSize } from '../../config/layout';
import { TITLE_BLOCK_TYPES, titleFromBlock } from './blockNodeShape';

/**
 * Turns a canvas block into a card in place.
 *
 * A line of prose already carries its own title: the line. So a text block
 * becomes a TITLE-VIEW card whose title is that text, rather than an expanded
 * page repeating the same words in an otherwise empty body. Everything else
 * (media, tables, code, files…) converts to an expanded card holding the block.
 *
 * `measuredWidth` is the block's rendered width in flow units; a title card
 * keeps it (snapped to the grid) so the card lands where the text was.
 */
export function convertBlockToCard(id: string, measuredWidth = MEDIUM_SIZE) {
    const { nodes, setNodes } = useStore.getState();
    const node = getNodeById(nodes, id);
    if (!node) return;

    const blocks = Array.isArray(node.data.content) ? (node.data.content as Block[]) : [];
    const single = blocks.length === 1 ? blocks[0] : undefined;
    const titleText = single && TITLE_BLOCK_TYPES.has(single.type) ? titleFromBlock(single.content || '') : '';
    const asTitleCard = titleText.length > 0;

    // Title view is one grid unit tall, floored at the stock 208px title card.
    const width = asTitleCard
        ? Math.min(MAX_WIDTH, Math.max(MEDIUM_SIZE, getStrictSize(measuredWidth)))
        : MIN_EXPANDED_SIZE;
    const height = asTitleCard ? BASE_UNIT : MIN_EXPANDED_SIZE;

    setNodes((current) => current.map((n) => (n.id !== id ? n : {
        ...n,
        type: 'note',
        data: {
            label: asTitleCard ? titleText : (node.data.label || 'Untitled Card'),
            viewMode: asTitleCard ? 'titleview' : 'expanded',
            // The words moved into the title — keeping the block as content too
            // would show the same line twice once the card is opened.
            content: asTitleCard ? [] : blocks,
            description: '',
            createdAt: new Date().toISOString(),
            color: node.data.color,
        },
        style: { ...n.style, width, height },
    } as AppNode)));
}
