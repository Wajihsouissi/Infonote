import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Block } from '../types';
import {
    blocksToHtml,
    blocksToPlainText,
    cloneBlocks,
    decodePayload,
    encodePayload,
    payloadBlocks,
} from '../../clipboard/clipboardPayload';
import { writeRichClipboard } from '../../clipboard/writeClipboard';
import { parseFiles, parseTextOrHtml } from '../pasteUtils';
import { useStableCallback } from '../../../utils/useStableCallback';

interface UseBlockClipboardOptions {
    blocksRef: React.RefObject<Block[]>;
    selectedBlockIdsRef: React.RefObject<Set<string>>;
    writeBlocks: (next: Block[]) => void;
    setSelectedBlockIds: (ids: Set<string>) => void;
    focusBlock: (id: string) => void;
}

/**
 * Copy, cut and paste for whole blocks.
 *
 * Two flavours go on the clipboard: readable text for other programs, and HTML
 * carrying the real block data, so pasting back into the app restores
 * headings, checkboxes, images and tables exactly as they were.
 */
export function useBlockClipboard({
    blocksRef,
    selectedBlockIdsRef,
    writeBlocks,
    setSelectedBlockIds,
    focusBlock,
}: UseBlockClipboardOptions) {
    /** The selected blocks, in document order. */
    const selectedBlocks = useCallback(
        () => blocksRef.current.filter((block) => selectedBlockIdsRef.current.has(block.id)),
        [blocksRef, selectedBlockIdsRef],
    );

    const flavours = useCallback((blocks: Block[]) => encodePayload(
        { v: 1, kind: 'blocks', blocks: cloneBlocks(blocks) },
        blocksToPlainText(blocks),
        blocksToHtml(blocks),
    ), []);

    /** Removes `ids`, never leaving a note with nowhere to put the caret. */
    const removeBlocks = useCallback((ids: Set<string>) => {
        const remaining = blocksRef.current.filter((block) => !ids.has(block.id));
        writeBlocks(remaining.length > 0 ? remaining : [{ id: uuidv4(), type: 'text', content: '' }]);
        setSelectedBlockIds(new Set());
    }, [blocksRef, writeBlocks, setSelectedBlockIds]);

    const copySelection = useStableCallback(() => {
        const blocks = selectedBlocks();
        if (blocks.length === 0) return;
        const { text, html } = flavours(blocks);
        void writeRichClipboard(text, html);
    });

    const cutSelection = useStableCallback(() => {
        const blocks = selectedBlocks();
        if (blocks.length === 0) return;
        const { text, html } = flavours(blocks);
        void writeRichClipboard(text, html).then(() => removeBlocks(new Set(blocks.map((b) => b.id))));
    });

    /**
     * Ctrl+C / Ctrl+X over a block selection.
     *
     * Handled through the native events rather than a keydown listener: the
     * event is the only place the browser lets a page put more than one flavour
     * on the clipboard, which is what makes a lossless paste possible. With no
     * block selection this does nothing, so selecting text inside one block
     * keeps the browser's own behaviour.
     */
    useEffect(() => {
        const writeToEvent = (event: ClipboardEvent, blocks: Block[]) => {
            if (blocks.length === 0 || !event.clipboardData) return false;
            const { text, html } = flavours(blocks);
            event.clipboardData.setData('text/plain', text);
            event.clipboardData.setData('text/html', html);
            event.preventDefault();
            return true;
        };

        const onCopy = (event: ClipboardEvent) => {
            if (selectedBlockIdsRef.current.size === 0) return;
            writeToEvent(event, selectedBlocks());
        };

        const onCut = (event: ClipboardEvent) => {
            if (selectedBlockIdsRef.current.size === 0) return;
            const blocks = selectedBlocks();
            if (!writeToEvent(event, blocks)) return;
            removeBlocks(new Set(blocks.map((b) => b.id)));
        };

        document.addEventListener('copy', onCopy);
        document.addEventListener('cut', onCut);
        return () => {
            document.removeEventListener('copy', onCopy);
            document.removeEventListener('cut', onCut);
        };
    }, [selectedBlocks, flavours, removeBlocks, selectedBlockIdsRef]);

    /**
     * A paste that landed on the editor itself rather than in a line: files,
     * blocks copied from the app, or outside text. It lands just after the
     * selection instead of at the very end, where it could be out of sight.
     */
    const pasteIntoDocument = useStableCallback(async (event: React.ClipboardEvent) => {
        const target = event.target as HTMLElement;
        const inEditable = typeof target?.closest === 'function' && (
            target.tagName === 'INPUT'
            || target.tagName === 'TEXTAREA'
            || target.isContentEditable
            || !!target.closest('[contenteditable]')
        );
        if (inEditable) return; // The block's own paste handler owns this.

        let pasted: Block[] = [];
        const files = event.clipboardData.files;
        if (files && files.length > 0) {
            event.preventDefault();
            pasted = await parseFiles(files);
        } else {
            const text = event.clipboardData.getData('text/plain')?.trim();
            const html = event.clipboardData.getData('text/html');
            if (!text && !html) return;
            event.preventDefault();
            const internal = payloadBlocks(decodePayload(html) ?? { v: 1, kind: 'blocks', blocks: [] });
            pasted = internal && internal.length > 0 ? internal : parseTextOrHtml(event);
        }
        if (pasted.length === 0) return;

        const current = blocksRef.current;
        const selected = selectedBlockIdsRef.current;
        let at = current.length;
        if (selected.size > 0) {
            const last = current.reduce((acc, block, i) => (selected.has(block.id) ? i : acc), -1);
            if (last >= 0) at = last + 1;
        }
        const next = [...current];
        next.splice(at, 0, ...pasted);
        writeBlocks(next);
        setSelectedBlockIds(new Set());
        focusBlock(pasted[pasted.length - 1].id);
    });

    return { copySelection, cutSelection, pasteIntoDocument };
}
