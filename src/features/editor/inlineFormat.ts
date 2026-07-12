/**
 * Inline text formatting for the block editor.
 *
 * Block content is stored as plain text with markdown markers (`**bold**`,
 * `*italic*`, `++underline++`, `~~strike~~`, `` `code` ``) and rendered to HTML
 * by renderContentWithLinks() on blur. So formatting must be applied by
 * wrapping the selection in those markers — NOT via document.execCommand
 * (which injects <b>/<i> tags that get stripped the moment innerText is
 * saved). We use execCommand('insertText') only as the insertion primitive
 * because it fires the native `input` event (persisting via onChange) and
 * participates in the contentEditable undo stack.
 */

export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'code';

export const INLINE_MARKERS: Record<InlineFormat, string> = {
    bold: '**',
    italic: '*',
    underline: '++',
    strikeThrough: '~~',
    code: '`',
};

/**
 * Toggle a markdown marker around the current selection inside a
 * contentEditable block. Wraps a plain selection, unwraps one that already
 * carries the marker, and — with no selection — drops an empty marker pair
 * with the caret between them so the user can type inside it.
 */
export function applyInlineFormat(format: InlineFormat): void {
    const marker = INLINE_MARKERS[format];
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const selected = sel.toString();

    // No selection → insert an empty pair, caret in the middle.
    if (!selected) {
        document.execCommand('insertText', false, marker + marker);
        try {
            const s = window.getSelection();
            if (s && s.rangeCount) {
                const r = s.getRangeAt(0);
                const offset = r.startOffset - marker.length;
                if (r.startContainer.nodeType === Node.TEXT_NODE && offset >= 0) {
                    r.setStart(r.startContainer, offset);
                    r.collapse(true);
                    s.removeAllRanges();
                    s.addRange(r);
                }
            }
        } catch { /* caret nicety only */ }
        return;
    }

    // Selection already wrapped in this marker → unwrap (toggle off).
    const isWrapped =
        selected.length >= marker.length * 2 &&
        selected.startsWith(marker) &&
        selected.endsWith(marker) &&
        // guard: "**x**" must not read as italic-wrapped ("*...*")
        !(format === 'italic' && selected.startsWith('**'));

    const inner = isWrapped
        ? selected.slice(marker.length, selected.length - marker.length)
        : selected;
    const replacement = isWrapped ? inner : `${marker}${selected}${marker}`;

    document.execCommand('insertText', false, replacement);

    // Re-select the inner text so the toolbar stays open, active states
    // update, and formats can be stacked (bold then italic).
    try {
        const s = window.getSelection();
        if (s && s.rangeCount) {
            const r = s.getRangeAt(0);
            const node = r.startContainer;
            const end = r.startOffset;
            const innerStart = isWrapped ? end - inner.length : end - marker.length - inner.length;
            const innerEnd = isWrapped ? end : end - marker.length;
            if (node.nodeType === Node.TEXT_NODE && innerStart >= 0) {
                const nr = document.createRange();
                nr.setStart(node, innerStart);
                nr.setEnd(node, innerEnd);
                s.removeAllRanges();
                s.addRange(nr);
            }
        }
    } catch { /* re-selection nicety only */ }
}

/**
 * Best-effort read of which markers wrap the current selection, for
 * highlighting active toolbar buttons. Detects markers immediately inside
 * OR immediately outside the selection (double-click selects the word
 * without its markers). Purely observational — never mutates.
 */
export function getActiveInlineFormats(): Set<InlineFormat> {
    const active = new Set<InlineFormat>();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return active;

    const text = sel.toString();
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    const value = node.nodeType === Node.TEXT_NODE ? node.nodeValue ?? '' : '';
    const sameNode = range.endContainer === node;

    (Object.keys(INLINE_MARKERS) as InlineFormat[]).forEach((format) => {
        const m = INLINE_MARKERS[format];
        const innerWrapped =
            text.length >= m.length * 2 && text.startsWith(m) && text.endsWith(m);
        const outerWrapped =
            sameNode &&
            value.slice(Math.max(0, range.startOffset - m.length), range.startOffset) === m &&
            value.slice(range.endOffset, range.endOffset + m.length) === m;

        if (!innerWrapped && !outerWrapped) return;
        // Disambiguate italic ("*") from bold ("**") which contains it.
        if (format === 'italic') {
            const boldInner = text.startsWith('**') && text.endsWith('**');
            const boldOuter =
                sameNode &&
                value.slice(Math.max(0, range.startOffset - 2), range.startOffset) === '**';
            if (boldInner || boldOuter) return;
        }
        active.add(format);
    });

    return active;
}

// Dev-only handle so QA harnesses can exercise the formatter directly (the
// canvas card's contentEditable is awkward to drive via synthetic events).
if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__inlineFormat = {
        applyInlineFormat,
        getActiveInlineFormats,
        INLINE_MARKERS,
    };
}
