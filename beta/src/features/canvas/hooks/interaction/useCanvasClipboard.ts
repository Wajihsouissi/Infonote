import { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../../../store/useStore';
import { parseFiles } from '../../../editor/text/pasteUtils';
import { buildGraphClipboard } from '../../../clipboard/graphClipboard';
import { insertCanvasBlocks, pasteCanvasContent } from '../../../clipboard/pasteCanvasContent';
import { isEditableElement } from '../../../../utils/editableTarget';
import { BASE_UNIT } from '../../../../config/layout';
import { decodePayload } from '../../../clipboard/clipboardPayload';

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
    const lastPaste = useRef({ html: '', count: 0 });
    const sessionClipboard = useRef<{ html: string; text: string } | null>(null);
    const [clipboardNotice, setClipboardNotice] = useState(false);
    useEffect(() => {
        if (!clipboardNotice) return;
        const timer = setTimeout(() => setClipboardNotice(false), 6000);
        return () => clearTimeout(timer);
    }, [clipboardNotice]);

    useEffect(() => {
        const screenCenter = () => screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        const writeSelection = (e: ClipboardEvent, cut: boolean) => {
            if (isInEditableFieldRef.current || isEditableElement(e.target)) {
                // Text copied in an editor replaces the app selection cache too.
                sessionClipboard.current = null;
                return;
            }
            if (!e.clipboardData) return;
            const state = useStore.getState();
            const built = buildGraphClipboard(state.nodes, state.edges, state.selectedCanvasNodeIds);
            if (!built) return;
            e.clipboardData.setData('text/plain', built.text);
            e.clipboardData.setData('text/html', built.html);
            e.preventDefault();
            sessionClipboard.current = { html: built.html, text: built.text };
            lastPaste.current = { html: '', count: 0 };
            if (cut) useStore.getState().requestNodeDeletion(built.ids);
        };
        const onCopy = (e: ClipboardEvent) => writeSelection(e, false);
        const onCut = (e: ClipboardEvent) => writeSelection(e, true);

        const onPaste = async (e: ClipboardEvent) => {
            if (isEditableElement(e.target)) return;
            const files = e.clipboardData?.files;
            let html = e.clipboardData?.getData('text/html') ?? '';
            let text = e.clipboardData?.getData('text/plain') ?? '';
            if (!files?.length && !html && !text) {
                // Some browser ports accept custom copy/cut writes but return
                // empty flavors on paste. Keep the copied branch recoverable.
                if (!sessionClipboard.current) return;
                ({ html, text } = sessionClipboard.current);
                setClipboardNotice(true);
            } else if (html !== sessionClipboard.current?.html) {
                // Never let an old app copy override newer external content.
                sessionClipboard.current = null;
                setClipboardNotice(false);
            }
            e.preventDefault();
            const position = screenCenter();
            if (decodePayload(html)?.kind === 'nodes') {
                const count = lastPaste.current.html === html ? lastPaste.current.count + 1 : 0;
                lastPaste.current = { html, count };
                position.x += count * BASE_UNIT;
                position.y += count * BASE_UNIT;
            }
            if (files?.length) insertCanvasBlocks(await parseFiles(files), position);
            else pasteCanvasContent(html, text, position);
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
    return { clipboardNotice, dismissClipboardNotice: () => setClipboardNotice(false) };
}
