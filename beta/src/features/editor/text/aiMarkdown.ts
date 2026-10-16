import type { Block } from '../types';
import { parsePlainText } from './parsePlainText';

/**
 * Reading what a model actually wrote.
 *
 * Model markdown is close to markdown but not quite: a heading glued to the
 * previous sentence, an HTML tag that slipped in, a divider with no newline
 * before it. The ordinary parser reads text exactly as typed, so every one of
 * those slips reached a card as literal characters. Repair first, then the AI
 * conventions, then hand the result to the same trusted parser paste and
 * typing use — so todos, bullets, headings, tables and code stay consistent
 * everywhere.
 */

const HTML_ENTITIES: Record<string, string> = {
    '&gt;': '>',
    '&lt;': '<',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
};

/**
 * Undo the markup slips models make that no Markdown rule can read.
 *
 * Each of these reached a card or the AI panel as literal characters:
 * - `<br>` \u2014 models put it inside table cells to fake line breaks, and between
 *   lines of prose. In a table row it becomes a space (a cell cannot hold a
 *   line); anywhere else it becomes the newline it stands for.
 * - `<strong>`, `<em>`, `<code>`, `<li>`, `<hr>` and wrapper tags, plus escaped
 *   entities (`&gt;`, `&amp;`), when a model drifts from Markdown into HTML.
 * - A divider or heading that lost its newline: `---### Key criteria`, or
 *   `\u2026the end.### Next`. The marker rules only match a line that is ENTIRELY
 *   one marker, so a glued pair matched neither and showed as text.
 *
 * Fenced code is left exactly as written. Only known tag names are touched, so
 * prose like `a < b` survives.
 */
export function repairAIMarkdown(text: string): string {
    const out: string[] = [];
    let inFence = false;

    for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
        if (raw.trim().startsWith('```')) {
            inFence = !inFence;
            out.push(raw);
            continue;
        }
        if (inFence) {
            out.push(raw);
            continue;
        }

        let line = raw.replace(/&(?:gt|lt|amp|quot|#39|apos|nbsp);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
        const isTableRow = line.trim().startsWith('|');

        line = line
            .replace(/<\/?(?:strong|b)>/gi, '**')
            .replace(/<\/?(?:em|i)>/gi, '*')
            .replace(/<\/?code>/gi, '`')
            .replace(/<hr\s*\/?>/gi, isTableRow ? ' ' : '\n---\n')
            .replace(/<li(?:\s[^>]*)?>/gi, isTableRow ? ' ' : '\n- ')
            .replace(/<\/?(?:p|div|span|u|ul|ol|li|mark|small|sup|sub|font)(?:\s[^>]*)?>/gi, '')
            .replace(/[ \t]*<br\s*\/?>[ \t]*/gi, isTableRow ? ' ' : '\n');

        if (!isTableRow) {
            // `\u2026text---### Heading`: a divider stranded mid-line before a heading.
            line = line.replace(/(\S)[ \t]*-{3,}[ \t]*(?=#{1,6}[ \t]*\S)/g, '$1\n---\n');
            // `---### Heading` / `--- Heading`: a divider glued to the next line.
            // Dashes only \u2014 `***bold***` must stay emphasis \u2014 and never before a
            // pipe or colon, which is a table delimiter row.
            line = line.replace(/^([ \t]*)-{3,}[ \t]*(?=[#*A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF])/, '$1---\n$1');
            // `\u2026the end.### Next`: a heading glued to the previous sentence.
            line = line.replace(/([.!?:)\]])[ \t]*(#{2,6})[ \t]*(?=\S)/g, '$1\n$2 ');
        }

        out.push(...line.split('\n'));
    }

    return out.join('\n');
}

/**
 * The parser for anything a model wrote \u2014 AI panel answers AND the cards, docs,
 * board cards and timeline steps the runner places.
 *
 * Canvas placement used to call `parsePlainText` directly, which reads Markdown
 * exactly as typed and so left every model slip (`####`, `-item`, `1) step`,
 * `<br>`) as literal characters on the card. Repair first, then the AI
 * conventions below, then the same trusted parser as paste and typing, so todos,
 * bullets, headings, tables and code stay consistent everywhere else.
 */
export function parseAIContent(text: string): Block[] {
    const lines = repairAIMarkdown(text).split('\n');
    const normalized: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        let line = lines[index];
        const next = lines[index + 1];

        // Setext headings are still common in model output, especially when a
        // response was shaped from a document rather than written as Markdown.
        // Consume the underline so the general parser never mistakes it for a
        // divider. A `---` underline is ambiguous, though: models far more often
        // put a divider straight after a paragraph than write a setext H2, and
        // reading that as a heading swallowed the divider AND turned a whole
        // paragraph into a heading. So `-` only counts under a short standalone
        // line that does not read as a sentence.
        const previous = lines[index - 1];
        const setextDash = next != null
            && /^\s*-+\s*$/.test(next)
            && line.trim().length <= 60
            && !/[.!?:;,]\s*$/.test(line)
            && (previous == null || !previous.trim());
        if (
            line.trim()
            && next != null
            && (/^\s*=+\s*$/.test(next) || setextDash)
            && !/^\s*(?:[-*•+]\s|\d+[.)]\s|#{1,6}\s|\|)/.test(line)
        ) {
            normalized.push(`${next.trim().startsWith('=') ? '#' : '##'} ${line.trim()}`);
            index += 1;
            continue;
        }

        // Models frequently omit the required space after ATX markers. Without
        // this, `##1. Start here` becomes literal text instead of a heading.
        const atxHeading = line.match(/^(\s*)(#{1,6})(?!#)\s*(\S.*)$/);
        if (atxHeading) {
            // The editor has three native heading levels; deeper Markdown
            // levels retain their hierarchy as the closest supported level.
            const marker = atxHeading[2].slice(0, 3);
            line = `${atxHeading[1]}${marker} ${atxHeading[3]}`;
        }

        /* `> ` used to be rewritten to `>> ` here, meant as a toggle. But the
           paste parser has no `>>` rule — that marker exists only as a typed
           shortcut — so every quote in an AI answer rendered as the literal
           text ">> Tip: …". A quote is what the prompts ask for, so a quote is
           what it now stays; the general parser handles `> ` natively. */

        // The same missing-space repair for common list, task and quote forms.
        // Keep negative numbers and ordinary hyphenated words untouched by
        // requiring a letter-like start after a compact bullet marker.
        const compactTask = line.match(/^(\s*)(?:[-*•+]\s*)?\[([ xX]?)\](\S.*)$/);
        if (compactTask) line = `${compactTask[1]}[${compactTask[2]}] ${compactTask[3]}`;

        const ordered = line.match(/^(\s*)(\d+)[.)]\s*(\S.*)$/);
        if (ordered) line = `${ordered[1]}${ordered[2]}. ${ordered[3]}`;

        const bullet = line.match(/^(\s*)([-*+•])\s*(?=[A-Za-zÀ-ÖØ-öø-ÿ])(\S.*)$/);
        if (bullet) line = `${bullet[1]}${bullet[2] === '+' ? '-' : bullet[2]} ${bullet[3]}`;

        const compactQuote = line.match(/^(\s*)>(?!>)(\S.*)$/);
        if (compactQuote) line = `${compactQuote[1]}> ${compactQuote[2]}`;

        // A standalone bold phrase is almost always a model's substitute for
        // a missing heading marker. Keep bold phrases inside body text intact.
        const boldHeading = line.match(/^\s*(?:\*\*|__)([^*_\n].*?)(?:\*\*|__)\s*$/);
        // Needs a letter: a bold date or number (`**2026-09-01**`) is a
        // label, not a section heading.
        if (boldHeading && /\p{L}/u.test(boldHeading[1])) {
            normalized.push(`## ${boldHeading[1].trim()}`);
            continue;
        }

        normalized.push(line);
    }

    return parsePlainText(normalized.join('\n'));
}
