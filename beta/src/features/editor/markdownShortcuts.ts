import type { BlockMetadata, BlockType } from './types';

/**
 * The markdown auto-format shortcuts, in one place.
 *
 * These used to be two separate rule sets — a chain of exact string comparisons
 * for typing (`content === '# '`) and a chain of regexes for pasting — which is
 * how typing `- ` came to make a checkbox while pasting `- ` made a bullet.
 * One table, consulted by both, means they cannot drift apart again.
 *
 * Two deliberate design choices, both of which fix real bugs:
 *
 *  - **Prefix matching, not equality.** The old check only fired when the line
 *    was *exactly* the marker. Type quickly and the editor receives `"# Hello"`
 *    in a single input event, which never equals `"# "`, so the shortcut
 *    silently didn't fire. Here the marker is consumed and the rest is kept.
 *
 *  - **Every space a browser might produce.** A trailing space in a
 *    contentEditable is stored as a normal space, a non-breaking space, or one
 *    of a couple of rarer variants, depending on the browser and the caret
 *    position. Comparing against a plain `' '` therefore worked only some of the
 *    time — the single biggest cause of the run-to-run randomness.
 */

/** Any character a browser may substitute for the space after a marker. */
const SP = '[ \\u00A0\\u2007\\u202F]';

export type ShortcutContext = 'type' | 'paste';

export interface MarkerRule {
    /** Stable identity, used by the revert logic and by tests. */
    id: string;
    type: BlockType;
    /** Anchored at the start; group 1 (when present) is the remaining text. */
    typed?: RegExp;
    pasted?: RegExp;
    /** Derived from the match — currently only the to-do's ticked state. */
    metadata?: (match: RegExpMatchArray) => BlockMetadata | undefined;
}

/**
 * Longest markers first: `###` has to be tested before `##` before `#`, and
 * `>>` before `>`, or the shorter rule wins and the extra characters survive as
 * text.
 */
export const MARKER_RULES: MarkerRule[] = [
    { id: 'h3', type: 'heading3', typed: new RegExp(`^###${SP}(.*)$`, 's'), pasted: new RegExp(`^###${SP}(.*)$`, 's') },
    { id: 'h2', type: 'heading2', typed: new RegExp(`^##${SP}(.*)$`, 's'), pasted: new RegExp(`^##${SP}(.*)$`, 's') },
    { id: 'h1', type: 'heading1', typed: new RegExp(`^#${SP}(.*)$`, 's'), pasted: new RegExp(`^#${SP}(.*)$`, 's') },

    { id: 'toggle', type: 'toggle', typed: new RegExp(`^>>${SP}(.*)$`, 's') },
    { id: 'quote', type: 'quote', typed: new RegExp(`^>${SP}(.*)$`, 's'), pasted: new RegExp(`^>${SP}(.*)$`, 's') },

    /* The trailing space is optional so `---` alone works, which is what the
       written spec always said even though the code demanded `"--- "`. */
    { id: 'divider', type: 'divider', typed: new RegExp(`^(?:-{3,}|\\*{3,}|_{3,})${SP}?$`), pasted: /^[-*_]{3,}$/ },

    { id: 'code', type: 'code', typed: new RegExp('^```' + SP + '?(.*)$', 's') },

    /* To-do before bullet: `- [ ] x` has to read as a ticked-box line, not as a
       bullet whose text happens to start with a bracket. */
    {
        id: 'todo',
        type: 'todo',
        typed: new RegExp(`^\\[([ xX]?)\\]${SP}(.*)$`, 's'),
        pasted: new RegExp(`^[-*•]?\\s*\\[([ xX]?)\\]${SP}(.*)$`, 's'),
        metadata: (m) => ({ checked: /[xX]/.test(m[1] ?? '') }),
    },

    /* `- ` makes a bullet when typed AND when pasted. It used to make a to-do
       when typed, which meant pasting an ordinary markdown list from a web page
       turned every line into a checkbox. Checkboxes are `[] `. */
    { id: 'bullet', type: 'bullet', typed: new RegExp(`^[-*•]${SP}(.*)$`, 's'), pasted: new RegExp(`^[-*•]${SP}(.*)$`, 's') },

    { id: 'numbered', type: 'numbered', typed: new RegExp(`^\\d+\\.${SP}(.*)$`, 's'), pasted: new RegExp(`^\\d+\\.${SP}(.*)$`, 's') },
];

/**
 * Block types a typed shortcut may transform.
 *
 * An allow-list rather than a "not code" exclusion: typing `# ` inside a code
 * block used to turn it into a heading, and the same bug was latent for every
 * other literal block type. Anything added later is protected by default.
 */
export const AUTOFORMAT_SOURCE_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
    'text', 'heading1', 'heading2', 'heading3',
    'bullet', 'numbered', 'todo', 'toggle', 'quote', 'callout',
]);

export interface MarkerMatch {
    rule: MarkerRule;
    /** How many characters to remove from the front of the line. */
    markerLength: number;
    /** What is left once the marker is gone — becomes the block's content. */
    rest: string;
    metadata?: BlockMetadata;
}

/** The shortcut a line starts with, or null. Pure — no DOM, easy to test. */
export function matchMarkerShortcut(text: string, context: ShortcutContext): MarkerMatch | null {
    if (!text) return null;

    for (const rule of MARKER_RULES) {
        const pattern = context === 'type' ? rule.typed : rule.pasted;
        if (!pattern) continue;

        const match = pattern.exec(text);
        if (!match) continue;

        // The last capture group is the remainder; a divider has none.
        const rest = match.length > 1 ? (match[match.length - 1] ?? '') : '';
        return {
            rule,
            markerLength: text.length - rest.length,
            rest,
            metadata: rule.metadata?.(match),
        };
    }

    return null;
}

/**
 * Remove the first `visibleChars` characters from a contentEditable, leaving
 * inline markup alone.
 *
 * Needed because React does not necessarily rebuild the element: converting a
 * heading to a bigger heading, or adding a second bullet to a list, keeps the
 * very same DOM node, and the editor deliberately skips re-syncing a focused
 * element so the caret doesn't jump mid-typing. The marker characters would
 * otherwise stay visible and be re-read into state on the next keystroke.
 *
 * Rewriting `innerText` wholesale would work but flattens live `<strong>` /
 * `<em>` / `<a>` nodes into literal markdown, so that is only the fallback for
 * the rare case where the marker straddles element boundaries.
 */
export function stripLeadingChars(host: HTMLElement, visibleChars: number, fallbackText: string): void {
    if (visibleChars <= 0) return;

    let remaining = visibleChars;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
    const emptied: Text[] = [];

    while (remaining > 0) {
        const node = walker.nextNode() as Text | null;
        if (!node) {
            // The marker spans more than the text nodes we could reach.
            host.innerText = fallbackText;
            return;
        }
        const take = Math.min(remaining, node.data.length);
        node.deleteData(0, take);
        remaining -= take;
        if (node.data.length === 0) emptied.push(node);
    }

    for (const node of emptied) node.remove();
}
