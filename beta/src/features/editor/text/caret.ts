import { serializeInline } from './inlineFormat';

/**
 * Caret and selection maths for the block editor.
 *
 * Numeric caret offsets count visible characters, like placeCaret and DOM
 * selections. Stored Markdown offsets are not DOM offsets: splitting a marked
 * prefix by its serialized length can cut in the middle of another word.
 */

/** Where the caret sits inside `host`, in visible characters. */
export function caretOffsetIn(host: HTMLElement | null): number {
    const selection = window.getSelection();
    if (!host || !selection || selection.rangeCount === 0) return 0;
    try {
        const range = selection.getRangeAt(0);
        if (!host.contains(range.commonAncestorContainer)) return 0;
        const preCaret = range.cloneRange();
        preCaret.selectNodeContents(host);
        preCaret.setEnd(range.endContainer, range.endOffset);
        return preCaret.toString().length;
    } catch {
        return 0;
    }
}

/** Split the selected DOM, then serialize each half with balanced marks.
 * A non-collapsed selection is replaced by the split, just like native Enter. */
export function splitInlineSelection(host: HTMLElement): { before: string; after: string; collapsed: boolean } | null {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const selected = selection.getRangeAt(0);
    if (!host.contains(selected.startContainer) || !host.contains(selected.endContainer)) return null;
    const before = selected.cloneRange(), after = selected.cloneRange();
    before.selectNodeContents(host);
    before.setEnd(selected.startContainer, selected.startOffset);
    after.selectNodeContents(host);
    after.setStart(selected.endContainer, selected.endOffset);
    const serialize = (range: Range) => {
        const holder = document.createElement('div');
        holder.appendChild(range.cloneContents());
        if (!holder.textContent?.replace(/[\u200B\uFEFF]/g, '') && !holder.querySelector('br')) return '';
        return serializeInline(holder);
    };
    return { before: serialize(before), after: serialize(after), collapsed: selected.collapsed };
}

/**
 * A range spanning [start, end) visible characters of `host`, walking the
 * nodes that are there NOW. That is what makes a saved selection survive the
 * re-render a toolbar click causes: the original nodes are gone, the offsets
 * are not. Offsets past the end clamp to the last text node.
 */
export function offsetsToRange(host: HTMLElement, start: number, end: number): Range | null {
    const locate = (target: number): { node: Node; offset: number } | null => {
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        let seen = 0;
        let node: Node | null;
        let lastText: Node | null = null;
        while ((node = walker.nextNode())) {
            lastText = node;
            const length = (node.nodeValue ?? '').length;
            if (seen + length >= target) return { node, offset: target - seen };
            seen += length;
        }
        return lastText ? { node: lastText, offset: (lastText.nodeValue ?? '').length } : null;
    };

    const from = locate(start);
    const to = locate(end);
    if (!from || !to) return null;
    const range = document.createRange();
    try {
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
    } catch {
        return null;
    }
    return range;
}

/** The caret's x position on screen, for keeping a column across blocks. */
export function caretX(): number | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width !== 0 || rect.height !== 0) return rect.left;
    const rects = range.getClientRects();
    return rects.length > 0 ? rects[0].left : null;
}

/** Which line of its block the caret is on — `edge` decides which end. */
function caretOnEdgeLine(edge: 'first' | 'last'): boolean {
    try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return true;
        const rects = selection.getRangeAt(0).cloneRange().getClientRects();
        if (rects.length === 0) return true;

        const active = document.activeElement as HTMLElement | null;
        if (!active) return true;

        const box = active.getBoundingClientRect();
        const style = window.getComputedStyle(active);
        const lineHeight = parseFloat(style.lineHeight) || 24;
        // One line of slack: a caret sitting on the first line is never more
        // than a line-height away from the content edge.
        if (edge === 'first') {
            const top = box.top + parseFloat(style.paddingTop || '0') + parseFloat(style.borderTopWidth || '0');
            return (rects[0].top - top) < lineHeight * 1.2;
        }
        const bottom = box.bottom - parseFloat(style.paddingBottom || '0') - parseFloat(style.borderBottomWidth || '0');
        return (bottom - rects[0].bottom) < lineHeight * 1.2;
    } catch {
        return true;
    }
}

export const isCaretOnFirstLine = () => caretOnEdgeLine('first');
export const isCaretOnLastLine = () => caretOnEdgeLine('last');

/**
 * Where the caret should land when focus moves to a block: an end, a stored
 * offset, or the x position of the line it came from (so up/down keeps the
 * reader's column).
 */
export type CaretTarget =
    | 'start'
    | 'end'
    | number
    | { x: number; line: 'first' | 'last'; fallbackOffset: number };

/** Collapses the selection into `el` at `target`. */
export function placeCaret(el: HTMLElement, target: CaretTarget | null): void {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();

    const toOffset = (offset: number) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();
        let seen = 0;
        while (node) {
            const length = node.textContent?.length ?? 0;
            if (seen + length >= offset) {
                range.setStart(node, offset - seen);
                range.collapse(true);
                return true;
            }
            seen += length;
            node = walker.nextNode();
        }
        range.selectNodeContents(el);
        range.collapse(false);
        return false;
    };

    try {
        if (target !== null && typeof target === 'object' && 'x' in target) {
            const box = el.getBoundingClientRect();
            const y = target.line === 'last' ? box.bottom - 10 : box.top + 10;
            const fromPoint = rangeFromPoint(target.x, y);
            if (fromPoint && el.contains(fromPoint.commonAncestorContainer)) {
                selection.removeAllRanges();
                selection.addRange(fromPoint);
                return;
            }
            toOffset(target.fallbackOffset);
        } else if (typeof target === 'number') {
            toOffset(target);
        } else {
            range.selectNodeContents(el);
            range.collapse(target === 'start');
        }
        selection.removeAllRanges();
        selection.addRange(range);
    } catch {
        // A detached node mid-render: leaving the caret where it is beats
        // throwing inside a focus handler.
    }
}

function rangeFromPoint(x: number, y: number): Range | null {
    try {
        if (typeof document.caretRangeFromPoint === 'function') return document.caretRangeFromPoint(x, y);
        // Firefox: caretPositionFromPoint is absent from older DOM typings.
        const withCaretPosition = document as Document & {
            caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        };
        const position = withCaretPosition.caretPositionFromPoint?.(x, y);
        if (!position) return null;
        const range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
        return range;
    } catch {
        return null;
    }
}

/** The scrollable ancestor a block lives in, if any. */
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
    const container = el.closest('[class*="custom-scrollbar"]')
        ?? el.closest('[class*="noteArea"]')
        ?? el.closest('[style*="overflow-y"]');
    return container instanceof HTMLElement ? container : null;
}

/**
 * Brings a newly focused block into view inside its own scroll container.
 *
 * Never `scrollIntoView` on the canvas: it bubbles and pans the whole board.
 */
export function revealBlock(el: HTMLElement): void {
    const box = scrollParentOf(el) ?? (el.parentElement as HTMLElement | null);
    if (box && box !== document.body) {
        const containerRect = box.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom <= containerRect.bottom && elRect.top >= containerRect.top) return;
        /* Rects are screen pixels, scaled by the canvas zoom; scrollTop is in
           the container's own pixels. Mixing them scrolls to the wrong place at
           any zoom other than 1 — usually all the way to the top. */
        const scale = box.offsetHeight ? containerRect.height / box.offsetHeight : 1;
        const target = box.scrollTop
            + ((elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2)) / scale;
        box.scrollTo({ top: target, behavior: 'smooth' });
        return;
    }
    // Outside the canvas the document-level fallback is safe.
    if (el.closest('.react-flow__node')) return;
    try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch {
        el.scrollIntoView({ block: 'nearest' });
    }
}
