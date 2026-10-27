/**
 * Caret helpers for table cells.
 *
 * A cell is not a block of its own — one table block holds many — so these
 * work on the cell's own contentEditable rather than going through the
 * editor's block-level caret code.
 */

export type TableAlign = 'left' | 'center' | 'right';

/** A DOM node a table cell's persist hook is attached to, read by
 *  BlockEditor's toolbar-driven persistHost (see __persistInline below). */
export type PersistableEl = HTMLDivElement & { __persistInline?: (text: string) => void };

/** Place the caret at the start or end of a contentEditable element. */
export function placeCaretInCell(el: HTMLElement, toEnd: boolean) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(!toEnd);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}

/** Caret/selection position as character offsets into a contentEditable
 *  cell's visible text — the Selection-API equivalent of a textarea's
 *  selectionStart/selectionEnd, used to detect "caret at the boundary" for
 *  arrow-key cell-to-cell navigation. */
export function getCellCaretOffsets(el: HTMLElement): { start: number; end: number; length: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return null;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + range.toString().length;
    const length = el.textContent?.length ?? 0;
    return { start, end, length };
}
