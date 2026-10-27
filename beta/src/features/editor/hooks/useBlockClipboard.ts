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
import { parseFiles, parseTextOrHtml } from '../text/pasteUtils';
import { useStableCallback } from '../../../utils/useStableCallback';
import { blocksForDrag } from '../drag/blockReorder';
import { rebasePastedBlocks } from '../document/pasteBlocks';
import { isHiddenByCollapsedToggle } from '../document/blockTree';
import { sameDocument } from '../document/documentMerge';

interface UseBlockClipboardOptions {
    editorRef: React.RefObject<HTMLDivElement | null>;
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
    editorRef,
    blocksRef,
    selectedBlockIdsRef,
    writeBlocks,
    setSelectedBlockIds,
    focusBlock,
}: UseBlockClipboardOptions) {
    /** The selected blocks, in document order. */
    const selectedBlocks = useCallback(
        () => blocksForDrag(blocksRef.current, selectedBlockIdsRef.current),
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
        const ids = new Set(blocks.map(block=>block.id));
        void writeRichClipboard(text, html).then(written => {
            // Clipboard access can fail or resolve after another edit. Never
            // delete content that was not successfully copied in this snapshot.
            if (written && sameDocument(blocks,blocksRef.current.filter(block=>ids.has(block.id)))) removeBlocks(ids);
        });
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
        const ownsEvent = (event: ClipboardEvent) => {
            const target = event.target instanceof Element ? event.target : document.activeElement;
            return target?.closest('[data-chnk-it-block-editor]') === editorRef.current;
        };
        const writeToEvent = (event: ClipboardEvent, blocks: Block[]) => {
            if (blocks.length === 0 || !event.clipboardData) return false;
            const { text, html } = flavours(blocks);
            event.clipboardData.setData('text/plain', text);
            event.clipboardData.setData('text/html', html);
            event.preventDefault();
            return true;
        };

        const onCopy = (event: ClipboardEvent) => {
            if (!ownsEvent(event) || selectedBlockIdsRef.current.size === 0) return;
            writeToEvent(event, selectedBlocks());
        };

        const onCut = (event: ClipboardEvent) => {
            if (!ownsEvent(event) || selectedBlockIdsRef.current.size === 0) return;
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
    }, [selectedBlocks, flavours, removeBlocks, selectedBlockIdsRef, editorRef]);

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
            || !!target.closest('[contenteditable="true"]')
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
        const chosen = selectedBlocks();
        const selected = new Set(chosen.map(block=>block.id));
        let at = current.length;
        if (selected.size > 0) {
            const last = current.reduce((acc, block, i) => (selected.has(block.id) ? i : acc), -1);
            if (last >= 0) at = last + 1;
        }
        const targetIndent = chosen.length ? chosen.reduce((depth,block)=>Math.min(depth,block.indent||0),Infinity) : 0;
        pasted = rebasePastedBlocks(pasted,targetIndent);
        const next = current.slice(0,at).concat(pasted,current.slice(at));
        writeBlocks(next);
        setSelectedBlockIds(new Set());
        let visible = pasted.length-1;
        while (visible>0 && isHiddenByCollapsedToggle(pasted,visible)) visible--;
        focusBlock(pasted[visible].id);
    });

    return { copySelection, cutSelection, pasteIntoDocument };
}
