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

// ---------------------------------------------------------------------------
// Live rich-HTML editing (marker-free, Notion-style)
//
// The block stays visually formatted while you edit — the contentEditable holds
// real <strong>/<em>/<u>/<del>/<code>/<a> and we serialize that back to markdown
// on every input. Formatting is applied by mutating the DOM selection directly
// (never execCommand), which gives instant visual feedback and always persists.
// ---------------------------------------------------------------------------

/** The element each format renders as — identical to what renderContentWithLinks
 *  emits, so live-typed and blur-rendered markup are the same tags. */
const FORMAT_TAG: Record<InlineFormat, string> = {
    bold: 'strong',
    italic: 'em',
    underline: 'u',
    strikeThrough: 's',
    code: 'code',
};

/** tag (+ historical aliases) -> the marker we persist / the active format. */
const TAG_MARKER: Record<string, string> = {
    strong: '**', b: '**',
    em: '*', i: '*',
    u: '++',
    del: '~~', s: '~~', strike: '~~',
    code: '`',
};
const TAG_FORMAT: Record<string, InlineFormat> = {
    strong: 'bold', b: 'bold',
    em: 'italic', i: 'italic',
    u: 'underline',
    del: 'strikeThrough', s: 'strikeThrough', strike: 'strikeThrough',
    code: 'code',
};

/**
 * Serialize a contentEditable's live HTML back to the markdown we store.
 * Inverse of renderContentWithLinks(): marker elements -> markers, links ->
 * [text](url), page chips -> [title](chnk://page/id), <br>/<div> -> newlines,
 * everything else -> its text. Only marker ELEMENTS become markers, so literal
 * asterisks the user typed stay literal. Newline handling mirrors innerText so
 * it is also correct for plain (renderLinks=false) code blocks.
 */
export function serializeInline(root: HTMLElement): string {
    let out = '';

    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.nodeValue ?? '';
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // Inline page chip -> [Title](chnk://page/ID). CSS renders the 📄 icon,
        // so textContent is just the title.
        const pageId = el.getAttribute('data-page-id');
        if (tag === 'a' && pageId) {
            out += `[${el.textContent ?? ''}](chnk://page/${pageId})`;
            return;
        }
        // Regular link -> [label](href); a bare URL (label === href) stays bare.
        if (tag === 'a') {
            const href = el.getAttribute('href') ?? '';
            const label = el.textContent ?? '';
            out += !href ? label : label === href ? href : `[${label}](${href})`;
            return;
        }

        if (tag === 'br') { out += '\n'; return; }

        const marker = TAG_MARKER[tag];
        if (marker) {
            out += marker;
            el.childNodes.forEach(walk);
            out += marker;
            return;
        }

        // Block-ish wrappers browsers inject (div/p) read as line breaks — matches
        // innerText and keeps multi-line code blocks intact.
        if (tag === 'div' || tag === 'p') {
            if (out && !out.endsWith('\n')) out += '\n';
            el.childNodes.forEach(walk);
            return;
        }

        el.childNodes.forEach(walk);
    };

    root.childNodes.forEach(walk);
    // Strip zero-width spaces browsers sometimes inject into contentEditable.
    out = out.replace(new RegExp('[\\u200B\\uFEFF]', 'g'), '');

    /* Browsers park a bogus <br> at the end of a line to keep it selectable,
       which the walk above turned into a real newline. Left in, the stored text
       differs from what is on screen — and it was one reason the markdown
       shortcuts fired only sometimes. */
    out = out.replace(/\n$/, '');

    /* A space typed at the END of a line is stored as a non-breaking space by
       most browsers — which one, and when, varies — so identical typing yields
       either "#" + U+0020 or "#" + U+00A0. Comparing against a plain space
       worked only some of the time, which is the single biggest cause of the
       shortcuts behaving randomly.

       Normalise the TRAILING run only. Interior non-breaking spaces are real
       content (French punctuation, "10 000 EUR") and rewriting those would
       silently corrupt what the user typed. */
    return out.replace(new RegExp('[\\u00A0\\u2007\\u202F ]+$'), (run) => ' '.repeat(run.length));
}

/** Nearest ancestor element with `tag`, stopping at (and excluding) `host`. */
function ancestorWithTag(node: Node | null, tag: string, host: HTMLElement): HTMLElement | null {
    let n: Node | null = node;
    while (n && n !== host) {
        if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName.toLowerCase() === tag) {
            return n as HTMLElement;
        }
        n = n.parentNode;
    }
    return null;
}

function selectContents(node: Node) {
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(node);
    sel?.removeAllRanges();
    sel?.addRange(r);
}

/** Toggles the given format (bold, italic, etc.) on the current selection. */
export function applyInlineFormat(host: HTMLElement, format: InlineFormat, overrideRange?: Range): void {
    const sel = window.getSelection();
    let range: Range;
    if (overrideRange) {
        range = overrideRange;
    } else {
        if (!sel || sel.rangeCount === 0) return;
        range = sel.getRangeAt(0);
    }
    
    if (!host.contains(range.commonAncestorContainer)) return;

    const isInsideCode = ancestorWithTag(range.commonAncestorContainer, 'code', host) !== null;

    if (!isInsideCode) {
        if (format === 'bold') { document.execCommand('bold', false); return; }
        if (format === 'italic') { document.execCommand('italic', false); return; }
        if (format === 'underline') { document.execCommand('underline', false); return; }
        if (format === 'strikeThrough') { document.execCommand('strikeThrough', false); return; }
    }

    if (!host.contains(range.commonAncestorContainer)) return;

    const tag = FORMAT_TAG[format];
    
    let targetToUnwrap: HTMLElement | null = ancestorWithTag(range.commonAncestorContainer, tag, host);
    
    if (!targetToUnwrap) {
        const containedNodes: HTMLElement[] = [];
        const allMarks = Array.from(host.querySelectorAll(tag));
        for (const node of allMarks) {
            const nodeRange = document.createRange();
            nodeRange.selectNode(node);
            const isInside = range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0 &&
                             range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0;
            if (isInside) containedNodes.push(node as HTMLElement);
        }
        if (containedNodes.length === 1) {
            const node = containedNodes[0];
            if (range.toString().trim() === (node.textContent || '').trim()) {
                targetToUnwrap = node;
            }
        }
    }

    if (targetToUnwrap) {
        const parent = targetToUnwrap.parentNode;
        if (!parent) return;
        const frag = document.createDocumentFragment();
        while (targetToUnwrap.firstChild) frag.appendChild(targetToUnwrap.firstChild);
        const first = frag.firstChild;
        const last = frag.lastChild;
        parent.replaceChild(frag, targetToUnwrap);
        if (first && last) {
            const r = document.createRange();
            r.setStartBefore(first);
            r.setEndAfter(last);
            sel?.removeAllRanges();
            sel?.addRange(r);
        }
        return;
    }

    // Toggle on: wrap the selection in a fresh mark element.
    const contents = range.extractContents();
    
    // Destroy any nested marks of the same type to prevent messy nesting
    const existingMarks = Array.from(contents.querySelectorAll(tag));
    for (const mark of existingMarks) {
        const p = mark.parentNode;
        if (p) {
            while (mark.firstChild) p.insertBefore(mark.firstChild, mark);
            p.removeChild(mark);
        }
    }

    const wrapper = document.createElement(tag);
    if (tag === 'code') {
        wrapper.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        wrapper.style.fontSize = '0.85em';
        wrapper.style.padding = '0.2em 0.4em';
        wrapper.style.borderRadius = '3px';
        wrapper.style.color = '#eb5757'; // Notion-style red for inline code
        wrapper.style.backgroundColor = 'var(--glass-bg, rgba(135,131,120,0.15))';
    }
    
    try {
        wrapper.appendChild(contents);
        range.insertNode(wrapper);
        selectContents(wrapper);
    } catch {
        // extract/insert can throw on exotic partial selections — leave as-is.
    }
    
    // Final cleanup: browser DOM manipulations (like extractContents) can leave behind
    // empty tags or cause nesting if the insertion point was inside an empty remnant.
    // Flatten nested tags and remove empty ones to ensure clean serialization.
    const allMarksPost = Array.from(host.querySelectorAll(tag));
    for (const mark of allMarksPost) {
        // 1. Unwrap if nested inside another mark of the same type
        if (ancestorWithTag(mark.parentNode, tag, host)) {
            const p = mark.parentNode;
            if (p) {
                while (mark.firstChild) p.insertBefore(mark.firstChild, mark);
                p.removeChild(mark);
            }
        }
    }
    
    // Remove empty remnants
    const allMarksFinal = Array.from(host.querySelectorAll(tag));
    for (const mark of allMarksFinal) {
        if (!mark.textContent || mark.textContent.trim() === '') {
            mark.parentNode?.removeChild(mark);
        }
    }
}

/** Wrap the current selection in a link (or a page chip when pageId is given). */
export function applyLinkElement(host: HTMLElement, opts: { href?: string; pageId?: string; text?: string }, overrideRange?: Range): void {
    const sel = window.getSelection();
    let range: Range;
    if (overrideRange) {
        range = overrideRange;
    } else {
        if (!sel || sel.rangeCount === 0) return;
        range = sel.getRangeAt(0);
    }
    
    if (!host.contains(range.commonAncestorContainer)) return;

    const a = document.createElement('a');
    if (opts.pageId) {
        a.setAttribute('data-page-id', opts.pageId);
        a.setAttribute('contenteditable', 'false');
        a.className = 'editor-page-chip';
        a.textContent = opts.text ?? range.toString();
        try {
            range.deleteContents();
            range.insertNode(a);
            const after = document.createRange();
            after.setStartAfter(a);
            after.collapse(true);
            sel?.removeAllRanges();
            sel?.addRange(after);
        } catch { /* ignore */ }
        return;
    }

    const contents = range.extractContents();
    
    // Destroy any nested links in the selection
    const existingMarks = Array.from(contents.querySelectorAll('a'));
    for (const mark of existingMarks) {
        const p = mark.parentNode;
        if (p) {
            while (mark.firstChild) p.insertBefore(mark.firstChild, mark);
            p.removeChild(mark);
        }
    }

    if (opts.href) {
        a.setAttribute('href', opts.href);
        a.className = 'editor-inline-link';
        a.style.textDecoration = 'underline';
        a.style.fontWeight = '500';
        try {
            a.appendChild(contents);
            range.insertNode(a);
            selectContents(a);
        } catch { /* ignore */ }
    } else {
        // Toggle OFF (Unlink)
        try {
            // Need a reference to the first and last child to select it after insertion
            const firstChild = contents.firstChild;
            const lastChild = contents.lastChild;
            range.insertNode(contents);
            if (firstChild && lastChild) {
                const newRange = document.createRange();
                newRange.setStartBefore(firstChild);
                newRange.setEndAfter(lastChild);
                sel?.removeAllRanges();
                sel?.addRange(newRange);
            }
        } catch { /* ignore */ }
    }
    
    // Final cleanup: browser DOM manipulations (like extractContents) can leave behind
    // empty tags or cause nesting if the insertion point was inside an empty remnant.
    const allMarksPost = Array.from(host.querySelectorAll('a'));
    for (const mark of allMarksPost) {
        const parentLink = ancestorWithTag(mark.parentNode, 'a', host);
        if (parentLink) {
            // Nested link found! Unwrap the OUTER link so the new inner link survives.
            const p = parentLink.parentNode;
            if (p) {
                while (parentLink.firstChild) p.insertBefore(parentLink.firstChild, parentLink);
                p.removeChild(parentLink);
            }
        }
    }
    
    const allMarksFinal = Array.from(host.querySelectorAll('a'));
    for (const mark of allMarksFinal) {
        if (!mark.textContent || mark.textContent.trim() === '') {
            mark.parentNode?.removeChild(mark);
        }
    }
}

/** Which marks wrap the current selection, for highlighting toolbar buttons.
 *  Walks the selection start's ancestors up to the editable. */
export function getActiveFormatsFromSelection(): Set<InlineFormat> {
    const active = new Set<InlineFormat>();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return active;

    let node: Node | null = sel.getRangeAt(0).startContainer;
    while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const fmt = TAG_FORMAT[el.tagName.toLowerCase()];
            if (fmt) active.add(fmt);
            if (el.getAttribute('contenteditable') === 'true') break;
        }
        node = node.parentNode;
    }
    return active;
}

/** Get the URL of the link wrapping the current selection, if any. */
export function getActiveLinkUrlFromSelection(): string | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

    let node: Node | null = sel.getRangeAt(0).startContainer;
    while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName.toLowerCase() === 'a' && el.hasAttribute('href')) {
                return el.getAttribute('href');
            }
            if (el.getAttribute('contenteditable') === 'true') break;
        }
        node = node.parentNode;
    }
    return null;
}

// Dev-only handle so QA harnesses can exercise the pure logic directly.
if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__inlineFormat = {
        computeInlineFormat,
        getActiveInlineFormats,
        getActiveFormatsFromSelection,
        serializeInline,
        applyInlineFormat,
        INLINE_MARKERS,
    };
}
