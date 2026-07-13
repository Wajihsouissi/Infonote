/**
 * Inline text formatting helpers for the block editor.
 *
 * Block content is stored as plain text with markdown markers (`**bold**`,
 * `*italic*`, `++underline++`, `~~strike~~`, `` `code` ``) and rendered to HTML
 * by renderContentWithLinks() on blur. Focused blocks are in "source mode" — a
 * single text node showing the raw markdown.
 *
 * These are PURE (or DOM-read-only) helpers. The actual mutation lives in
 * BlockEditor, which updates React state (updateBlock) and syncs the block's
 * text node directly — we deliberately avoid document.execCommand, whose
 * `input` event reaches React unreliably in an uncontrolled contentEditable
 * ("the buttons don't do anything" / formatting that doesn't persist).
 */

export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'code';

export const INLINE_MARKERS: Record<InlineFormat, string> = {
    bold: '**',
    italic: '*',
    underline: '++',
    strikeThrough: '~~',
    code: '`',
};

/** A concrete place to apply formatting: a text host and offsets into its text. */
export interface FormatTarget {
    host: HTMLElement;
    start: number;
    end: number;
}

/**
 * Pure string transform: wrap / toggle the [start,end) slice of `raw` with the
 * given format's marker. Returns the new text and where the selection should
 * land afterward. No DOM involved — trivially testable.
 */
export function computeInlineFormat(
    raw: string,
    start: number,
    end: number,
    format: InlineFormat,
): { text: string; selStart: number; selEnd: number } {
    const marker = INLINE_MARKERS[format];
    const m = marker.length;
    const selected = raw.slice(start, end);
    const italicSafe = (probe: string) => !(format === 'italic' && probe.startsWith('**'));

    // Collapsed caret → drop an empty marker pair, caret between them.
    if (start === end) {
        return {
            text: raw.slice(0, start) + marker + marker + raw.slice(start),
            selStart: start + m,
            selEnd: start + m,
        };
    }

    // Case 1 — the selection itself includes the markers ("**word**") → strip.
    if (selected.length >= m * 2 && selected.startsWith(marker) && selected.endsWith(marker) && italicSafe(selected)) {
        const inner = selected.slice(m, selected.length - m);
        return { text: raw.slice(0, start) + inner + raw.slice(end), selStart: start, selEnd: start + inner.length };
    }

    // Case 2 — markers sit just outside the selection (double-clicking a word
    // inside **word** selects only the word) → strip the outer markers.
    const before = raw.slice(Math.max(0, start - m), start);
    const after = raw.slice(end, end + m);
    const boldProbe = raw.slice(Math.max(0, start - 2), start);
    if (before === marker && after === marker && italicSafe(boldProbe)) {
        return {
            text: raw.slice(0, start - m) + selected + raw.slice(end + m),
            selStart: start - m,
            selEnd: start - m + selected.length,
        };
    }

    // Case 3 — wrap.
    return {
        text: raw.slice(0, start) + marker + selected + marker + raw.slice(end),
        selStart: start + m,
        selEnd: start + m + selected.length,
    };
}

/** The raw text a source-mode block currently shows (its single text node). */
export function sourceText(host: HTMLElement): string | null {
    const node = host.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    return node.nodeValue ?? '';
}

/** The text a saved target currently covers. */
export function targetText(target: FormatTarget): string {
    const raw = sourceText(target.host) ?? target.host.textContent ?? '';
    return raw.slice(Math.min(target.start, raw.length), Math.min(target.end, raw.length));
}

/**
 * Best-effort read of which markers wrap the current selection, for
 * highlighting active toolbar buttons. Detects markers immediately inside OR
 * immediately outside the selection. Purely observational.
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
        const innerWrapped = text.length >= m.length * 2 && text.startsWith(m) && text.endsWith(m);
        const outerWrapped =
            sameNode &&
            value.slice(Math.max(0, range.startOffset - m.length), range.startOffset) === m &&
            value.slice(range.endOffset, range.endOffset + m.length) === m;

        if (!innerWrapped && !outerWrapped) return;
        if (format === 'italic') {
            const boldInner = text.startsWith('**') && text.endsWith('**');
            const boldOuter = sameNode && value.slice(Math.max(0, range.startOffset - 2), range.startOffset) === '**';
            if (boldInner || boldOuter) return;
        }
        active.add(format);
    });

    return active;
}

// Dev-only handle so QA harnesses can exercise the pure logic directly.
if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__inlineFormat = {
        computeInlineFormat,
        getActiveInlineFormats,
        INLINE_MARKERS,
    };
}
