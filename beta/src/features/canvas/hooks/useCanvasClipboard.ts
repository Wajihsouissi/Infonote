import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../store/useStore';
import { getNodeBlocks, getNodeLabel } from '../../../types';
import type { Block } from '../../editor/types';
import {
    blocksToHtml,
    blocksToPlainText,
    decodePayload,
    encodePayload,
    type NodesPayload,
} from '../../clipboard/clipboardPayload';
import { parseFiles, parseTextOrHtml } from '../../editor/pasteUtils';
import { isEditableElement } from '../../../utils/editableTarget';

/** A lone piece of media or a link stays a block; anything else becomes a fused note. */
const STANDALONE_TYPES = new Set(['image', 'video', 'file', 'media', 'link']);

/** The selected cards as clipboard data: our structured payload plus readable
 *  text and HTML, so pasting into another program still gives something useful. */
function buildSelectionClipboard() {
    const { nodes: allNodes, edges, selectedCanvasNodeIds } = useStore.getState();
    const nodes = allNodes.filter((n) => selectedCanvasNodeIds.has(n.id));
    if (nodes.length === 0) return null;

    // Positions relative to the selection's top-left keep the group's shape
    // wherever it is pasted.
    const minX = Math.min(...nodes.map((n) => n.position.x));
    const minY = Math.min(...nodes.map((n) => n.position.y));
    const indexById = new Map(nodes.map((n, i) => [n.id, i]));

    const payload: NodesPayload = {
        v: 1,
        kind: 'nodes',
        nodes: nodes.map((n, i) => ({
            ref: i,
            type: n.type || 'note',
            dx: n.position.x - minX,
            dy: n.position.y - minY,
            width: typeof n.style?.width === 'number' ? n.style.width : undefined,
            height: typeof n.style?.height === 'number' ? n.style.height : undefined,
            data: n.data as unknown as Record<string, unknown>,
        })),
        edges: edges
            .filter((e) => indexById.has(e.source) && indexById.has(e.target))
            .map((e) => ({
                source: indexById.get(e.source)!,
                target: indexById.get(e.target)!,
                sourceHandle: e.sourceHandle ?? null,
                targetHandle: e.targetHandle ?? null,
                type: e.type,
            })),
    };

    const text = nodes
        .map((n) => {
            const blocks = getNodeBlocks(n.data);
            return [getNodeLabel(n.data), blocks ? blocksToPlainText(blocks) : ''].filter(Boolean).join('\n');
        })
        .filter(Boolean)
        .join('\n\n---\n\n');
    const html = nodes
        .map((n) => {
            const blocks = getNodeBlocks(n.data);
            return blocks ? blocksToHtml(blocks) : '';
        })
        .join('<hr />');

    return { ...encodePayload(payload, text, html), ids: nodes.map((n) => n.id) };
}

/**
 * Canvas clipboard, outside text fields (where copy and paste stay native).
 *
 * Copy/cut ride the native events rather than keydown: only inside those can a
 * page put both a readable flavour and our structured payload on the clipboard.
 * Paste rebuilds copied cards (with their connections) on whichever canvas is
 * open, or turns pasted text, HTML and files into a block or fused note.
 */
export function useCanvasClipboard(isInEditableFieldRef: React.RefObject<boolean>) {
    const { screenToFlowPosition } = useReactFlow();

    useEffect(() => {
        const screenCenter = () => screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

        const writeSelection = (e: ClipboardEvent, cut: boolean) => {
            if (isInEditableFieldRef.current || !e.clipboardData) return;
            const built = buildSelectionClipboard();
            if (!built) return;
            e.clipboardData.setData('text/plain', built.text);
            e.clipboardData.setData('text/html', built.html);
            e.preventDefault();
            if (cut) useStore.getState().requestNodeDeletion(built.ids);
        };
        const onCopy = (e: ClipboardEvent) => writeSelection(e, false);
        const onCut = (e: ClipboardEvent) => writeSelection(e, true);

        const onPaste = async (e: ClipboardEvent) => {
            if (isEditableElement(e.target)) return;
            const { pasteClipboardNodes, addNode, setSelectedCanvasNodeIds, currentParentId } = useStore.getState();

            const internal = decodePayload(e.clipboardData?.getData('text/html'));
            if (internal?.kind === 'nodes') {
                e.preventDefault();
                pasteClipboardNodes(internal, screenCenter());
                return;
            }

            let blocks: Block[];
            const files = e.clipboardData?.files;
            if (files && files.length > 0) {
                e.preventDefault();
                blocks = await parseFiles(files);
            } else {
                const text = e.clipboardData?.getData('text/plain')?.trim();
                const html = e.clipboardData?.getData('text/html');
                if (!text && !html) return;
                e.preventDefault();
                blocks = parseTextOrHtml({ clipboardData: e.clipboardData } as Parameters<typeof parseTextOrHtml>[0]);
            }
            if (blocks.length === 0) return;

            // A little jitter so repeated pastes do not stack exactly.
            const center = screenCenter();
            const position = { x: center.x + (Math.random() - 0.5) * 40, y: center.y + (Math.random() - 0.5) * 40 };
            const type = blocks.length === 1 && STANDALONE_TYPES.has(blocks[0].type) ? 'block' : 'fused-note';
            const id = uuidv4();
            addNode(type, position, { content: blocks, isStandaloneBlock: true }, { width: 432, height: 120 }, currentParentId || undefined, id);
            setSelectedCanvasNodeIds(new Set([id]));
        };

        document.addEventListener('copy', onCopy);
        document.addEventListener('cut', onCut);
        window.addEventListener('paste', onPaste);
        return () => {
            document.removeEventListener('copy', onCopy);
            document.removeEventListener('cut', onCut);
            window.removeEventListener('paste', onPaste);
        };
    }, [isInEditableFieldRef, screenToFlowPosition]);
}
