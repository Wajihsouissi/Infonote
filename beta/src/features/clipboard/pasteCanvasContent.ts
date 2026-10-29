import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import type { Block } from '../editor/types';
import { parseTextOrHtml } from '../editor/text/pasteUtils';
import { decodePayload, payloadBlocks } from './clipboardPayload';

const STANDALONE_TYPES = new Set(['image', 'video', 'file', 'media', 'link']);

export function insertCanvasBlocks(blocks: Block[], position: { x: number; y: number }) {
    if (!blocks.length) return;
    const { addNode, currentParentId, setSelectedCanvasNodeIds } = useStore.getState();
    const type = blocks.length === 1 && STANDALONE_TYPES.has(blocks[0].type) ? 'block' : 'fused-note';
    const id = uuidv4();
    addNode(type, position, { content: blocks, isStandaloneBlock: true }, { width: 432, height: 120 }, currentParentId || undefined, id);
    // addNode can reject quota violations. Never select a nonexistent card.
    if (useStore.getState().nodes.some(n => n.id === id)) setSelectedCanvasNodeIds(new Set([id]));
}

/** Menu and native paste share parsing, selection and active-canvas ownership. */
export function pasteCanvasContent(html: string, text: string, position: { x: number; y: number }) {
    const payload = decodePayload(html);
    if (payload?.kind === 'nodes') {
        useStore.getState().pasteClipboardNodes(payload, position);
        return;
    }
    const blocks = payload ? payloadBlocks(payload) : null;
    insertCanvasBlocks(blocks ?? parseTextOrHtml({
        clipboardData: { getData: (type: string) => type === 'text/html' ? html : text },
    } as Parameters<typeof parseTextOrHtml>[0]), position);
}
