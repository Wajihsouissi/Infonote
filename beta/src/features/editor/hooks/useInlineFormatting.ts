import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    applyHighlight,
    applyInlineFormat,
    applyLinkElement,
    getActiveFormatsFromSelection,
    getActiveHighlightFromSelection,
    getActiveLinkUrlFromSelection,
    serializeInline,
    type HighlightHue,
    type InlineFormat,
} from '../text/inlineFormat';
import { offsetsToRange } from '../text/caret';
import { useStore } from '../../../store/useStore';
import type { Block } from '../types';

/** Ignore a selection rect that moved less than this (in px). */
const RECT_EPSILON = 5;

interface UseInlineFormattingOptions {
    editorRef: React.RefObject<HTMLDivElement | null>;
    blockRefs: React.RefObject<Record<string, HTMLElement | null>>;
    /** Writes a block's text back to the document. */
    updateBlock: (id: string, content: string) => void;
}

/**
 * Everything that acts on a text selection: the floating toolbar's state, the
 * marks it applies, and the saved selection that survives the toolbar taking
 * focus away.
 *
 * One `selectionchange` listener serves all of it. There used to be two per
 * editor — one saving the range, one measuring the toolbar's rectangle — which
 * on a canvas full of open editors is a lot of listeners for one caret move.
 */
export function useInlineFormatting({ editorRef, blockRefs, updateBlock }: UseInlineFormattingOptions) {
    const [activeFormats, setActiveFormats] = useState<Set<InlineFormat>>(new Set());
    const [activeLinkUrl, setActiveLinkUrl] = useState<string | null>(null);
    const [activeHighlight, setActiveHighlight] = useState<HighlightHue | null>(null);
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);

    /* The last selection made in this editor, as offsets into the block's
       stored text plus the block id. A toolbar click blurs the editable
       (preventDefault through a portal is unreliable) and the blur can
       re-render it, which kills a saved DOM Range — offsets survive that. */
    const savedRef = useRef<{ blockId: string | null; host: HTMLElement | null; start: number; end: number } | null>(null);
    const rectRef = useRef<DOMRect | null>(null);

    const blockIdForHost = useCallback((host: HTMLElement): string | null => {
        for (const [id, el] of Object.entries(blockRefs.current)) {
            if (el && (el === host || el.contains(host))) return id;
        }
        return null;
    }, [blockRefs]);

    useEffect(() => {
        // Measure in the native event: retaining a live Range in a timer lets
        // a subsequent DOM format collapse it and hide a valid new selection.
        const measureRect = (range: Range | null) => {
            if (!range) {
                if (rectRef.current !== null) {
                    rectRef.current = null;
                    setSelectionRect(null);
                }
                return;
            }
            const rect = range.getBoundingClientRect();
            if (rect.width <= 2) {
                if (rectRef.current !== null) {
                    rectRef.current = null;
                    setSelectionRect(null);
                }
                return;
            }
            const previous = rectRef.current;
            const moved = !previous
                || Math.abs(previous.x - rect.x) > RECT_EPSILON
                || Math.abs(previous.y - rect.y) > RECT_EPSILON
                || Math.abs(previous.width - rect.width) > RECT_EPSILON;
            if (moved) {
                rectRef.current = rect;
                setSelectionRect(rect);
            }
        };

        const onSelectionChange = () => {
            const selection = window.getSelection();
            const inEditor = selection
                && selection.rangeCount > 0
                && editorRef.current?.contains(selection.getRangeAt(0).commonAncestorContainer)
                && (selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection.anchorNode?.parentElement)
                    ?.closest('[data-chnk-it-block-editor]') === editorRef.current;

            if (!inEditor || selection.isCollapsed) {
                measureRect(null);
                return;
            }

            const range = selection.getRangeAt(0);
            measureRect(range);

            const anchor = range.commonAncestorContainer;
            const el = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as HTMLElement) : anchor.parentElement;
            const host = el?.closest('[contenteditable="true"]') as HTMLElement | null;
            if (!host) return;

            const before = range.cloneRange();
            before.selectNodeContents(host);
            before.setEnd(range.startContainer, range.startOffset);
            const start = before.toString().length;
            savedRef.current = { blockId: blockIdForHost(host), host, start, end: start + range.toString().length };

            setActiveFormats(getActiveFormatsFromSelection());
            setActiveLinkUrl(getActiveLinkUrlFromSelection());
            setActiveHighlight(getActiveHighlightFromSelection());
        };

        document.addEventListener('selectionchange', onSelectionChange);
        return () => document.removeEventListener('selectionchange', onSelectionChange);
    }, [editorRef, blockIdForHost]);

    /** Puts the saved selection back into the live DOM and focuses its block. */
    const restoreSelection = useCallback((): { host: HTMLElement; range?: Range } | null => {
        const saved = savedRef.current;
        if (!saved) return null;
        // Resolve by block id where possible: it survives a re-render that
        // detached the original host element.
        const byId = saved.blockId ? blockRefs.current[saved.blockId] : null;
        const host = byId?.isConnected ? byId : saved.host;
        if (!host?.isConnected) return null;

        host.focus({ preventScroll: true });
        const range = offsetsToRange(host, saved.start, saved.end);
        if (!range) return { host };
        const selection = window.getSelection();
        selection?.removeAllRanges();
        try {
            selection?.addRange(range);
        } catch {
            return { host };
        }
        return { host, range };
    }, [blockRefs]);

    /**
     * The editable a toolbar action should act on: the live selection when it
     * is still where we last saw it, otherwise the saved one restored.
     */
    const editTarget = useCallback((): { host: HTMLElement; range?: Range } | null => {
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor?.parentElement;
        const host = element?.closest<HTMLElement>('[contenteditable="true"]');
        if (selection?.rangeCount && host?.closest('[data-chnk-it-block-editor]') === editorRef.current) return { host };
        return restoreSelection();
    }, [restoreSelection, editorRef]);

    /**
     * Writes the host's live HTML back as markdown (`serializeInline` is the
     * inverse of the on-blur render), then refreshes the toolbar state.
     */
    const persistHost = useCallback((host: HTMLElement) => {
        /* A table cell is not a whole block — one block holds many — so cells
           stash their own persist hook on the DOM node. See TableCellEditor. */
        const cellPersist = (host as HTMLElement & { __persistInline?: (text: string) => void }).__persistInline;
        if (cellPersist) {
            cellPersist(serializeInline(host));
        } else {
            const blockId = blockIdForHost(host);
            if (blockId) updateBlock(blockId, serializeInline(host));
        }
        setActiveFormats(getActiveFormatsFromSelection());
        setActiveHighlight(getActiveHighlightFromSelection());
    }, [blockIdForHost, updateBlock]);

    const formatSelection = useCallback((format: InlineFormat) => {
        const target = editTarget();
        if (!target) return;
        applyInlineFormat(target.host, format, target.range);
        persistHost(target.host);
    }, [editTarget, persistHost]);

    const applyLink = useCallback((url: string) => {
        const target = editTarget();
        if (!target) return;
        applyLinkElement(target.host, { href: url.trim() }, target.range);
        persistHost(target.host);
    }, [editTarget, persistHost]);

    const highlightSelection = useCallback((hue: HighlightHue | null) => {
        const target = editTarget();
        if (!target) return;
        applyHighlight(target.host, hue, target.range);
        persistHost(target.host);

        /* Picking a colour ends the job — bold invites a second click, a colour
           does not — and the toolbar is mounted on the live selection, so
           dropping the selection is what dismisses it. The caret lands AFTER
           the highlight so the next thing typed is not swallowed by it. */
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        let node: Node | null = range.endContainer;
        let mark: HTMLElement | null = null;
        while (node && node !== target.host) {
            if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'MARK') {
                mark = node as HTMLElement;
                break;
            }
            node = node.parentNode;
        }
        const caret = document.createRange();
        try {
            if (mark) caret.setStartAfter(mark);
            else caret.setStart(range.endContainer, range.endOffset);
            caret.collapse(true);
            selection.removeAllRanges();
            selection.addRange(caret);
        } catch {
            selection.collapseToEnd();
        }
    }, [editTarget, persistHost]);

    /**
     * "Turn into page": the selected words become a new card, and a chip
     * linking to it replaces them in the line.
     *
     * The text around the selection is read straight off the DOM either side of
     * the range, so any formatting it carries survives. (This used to insert a
     * marker string with `execCommand` and then undo it, which fought the
     * browser's own undo stack and occasionally left the marker in the text.)
     */
    const createPageChip = useCallback((
        splitBlock: (blockId: string, before: string, title: string, after: string, pageNodeId: string) => void,
    ) => {
        const target = editTarget();
        const host = target?.host;
        if (!host) return;

        const selection = window.getSelection();
        const range = target.range
            ?? (selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null);
        if (!range || range.collapsed || !host.contains(range.commonAncestorContainer)) return;

        const title = range.toString().trim();
        if (!title) return;

        const markdownOf = (fragment: DocumentFragment) => {
            const holder = document.createElement('div');
            holder.appendChild(fragment);
            return serializeInline(holder);
        };

        const beforeRange = range.cloneRange();
        beforeRange.selectNodeContents(host);
        beforeRange.setEnd(range.startContainer, range.startOffset);
        const afterRange = range.cloneRange();
        afterRange.selectNodeContents(host);
        afterRange.setStart(range.endContainer, range.endOffset);

        const before = markdownOf(beforeRange.cloneContents());
        const after = markdownOf(afterRange.cloneContents());

        const blockId = blockIdForHost(host);
        if (!blockId) return;

        const pageNodeId = useStore.getState().createPageFromText(title);
        // React may keep this DOM node; blurring lets it be overwritten with
        // the new, shorter content.
        host.blur();
        splitBlock(blockId, before, title, after, pageNodeId);
    }, [editTarget, blockIdForHost]);

    return {
        activeFormats,
        activeLinkUrl,
        activeHighlight,
        selectionRect,
        formatSelection,
        highlightSelection,
        applyLink,
        createPageChip,
        persistHost,
        restoreSelection,
    };
}

/** The blocks a "turn into page" split produces, in document order. */
export function pageChipBlocks(original: Block, before: string, title: string, after: string, pageNodeId: string) {
    const page: Block = {
        id: uuidv4(),
        type: 'page',
        content: title, // PageBlock reads its title from the content.
        metadata: { nodeId: pageNodeId },
        indent: original.indent,
    };
    const trailing: Block | null = after.length > 0
        ? { id: uuidv4(), type: 'text', content: after, indent: original.indent }
        : null;
    return {
        keepOriginal: before.length > 0,
        before,
        inserted: trailing ? [page, trailing] : [page],
        focusId: trailing ? trailing.id : page.id,
    };
}
