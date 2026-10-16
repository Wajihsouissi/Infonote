import { DEFAULT_HIGHLIGHT_HUE, HIGHLIGHT_PATTERN } from '../inlineFormat';

/**
 * Turning URLs in stored text into links, safely.
 *
 * The text is markdown, and it is rendered into a contentEditable — so anything
 * that reaches innerHTML has to be escaped first, and only http(s) may become a
 * clickable href.
 */

export function isUrl(str: string): boolean {
    const trimmed = str.trim();
    // Match standard HTTP/HTTPS URLs or raw www. domains or valid domain patterns
    const urlPattern = /^(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;
    return urlPattern.test(trimmed);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toSafeHttpUrl(value: string): string | null {
    const normalized = value.startsWith('www.') ? `https://${value}` : value;
    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.href;
    } catch {
        return null;
    }
}

// Renders a single line of content to safe HTML with inline markdown support:
// links ([label](url) + bare URLs), **bold**, *italic*, `code`, and ~~strike~~.
// Everything is HTML-escaped FIRST, so user/AI text can never inject markup;
// markdown markers survive escaping and are converted afterward.
export function renderContentWithLinks(content: string): string {
    if (!content) return '';

    // 1) Escape everything up front (XSS-safe baseline).
    let html = escapeHtml(content);

    // Recover a streamed label such as `**Solution:*` before regular emphasis
    // parsing. This is a model truncation shape, not a user-authored literal,
    // and without repair the marker remains visible in an otherwise formatted
    // editor block.
    html = html.replace(/^(\s*)\*{1,2}([^\s*:\n][^*:\n]{0,78}:)\*(?!\*)\s*/, '$1<strong>$2</strong> ');

    // 2) Protect inline code spans so their contents aren't treated as
    //    bold/italic/links. Stash them and restore at the very end.
    const codeStash: string[] = [];
    html = html.replace(/`([^`]+)`/g, (_m, code: string) => {
        const token = `\uE000${codeStash.length}\uE001`;
        
        // Parse basic markdown emphasis inside the code span so users can have bold code
        const innerHTML = code
            .replace(/\*\*\*([\s\S]*?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\+\+([\s\S]*?)\+\+/g, '<u>$1</u>')
            .replace(/(^|[^*])\*(?!\s)([\s\S]*?)\*(?!\*)/g, '$1<em>$2</em>')
            .replace(/~~([\s\S]*?)~~/g, '<s>$1</s>');

        codeStash.push(
            `<code style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 0.85em; padding: 0.2em 0.4em; border-radius: 3px; color: #eb5757; background: var(--glass-bg, rgba(135,131,120,0.15));">${innerHTML}</code>`
        );
        return token;
    });

    // 2.5) Inline page chips: [Title](chnk://page/<id>) -> an atomic, non-editable
    //      chip. CSS adds the 📄 icon so the title stays clean for serialization.
    html = html.replace(/\[([^\]]+)\]\(chnk:\/\/page\/([A-Za-z0-9_-]+)\)/g, (_m, title: string, id: string) =>
        `<a data-page-id="${escapeHtml(id)}" contenteditable="false" class="editor-page-chip">${title}</a>`
    );

    // 2.55) Node citations: [Title](chnk://node/<id>) -> an atomic chip that
    //       flies the canvas to the card the AI leaned on. Same mechanism as the
    //       page chip above rather than a second one, so it serialises, copies
    //       and survives a round trip like every other inline chip already does.
    //       See features/ai/aiCitations.ts.
    html = html.replace(/\[([^\]]+)\]\(chnk:\/\/node\/([A-Za-z0-9_-]+)\)/g, (_m, title: string, id: string) =>
        `<a data-cite-node="${escapeHtml(id)}" contenteditable="false" class="editor-cite-chip">${title}</a>`
    );

    // 2.6) Highlights: ==hue|text== (or a bare ==text==) -> <mark>. Before links
    //      and emphasis so markers *inside* a highlight still convert, and the
    //      hue comes from a fixed alternation so it can't inject an attribute.
    html = html.replace(HIGHLIGHT_PATTERN, (_m, hue: string | undefined, text: string) =>
        `<mark class="editor-mark" data-hue="${hue || DEFAULT_HIGHLIGHT_HUE}">${text}</mark>`
    );

    // 3) Links: [label](url) and bare URLs (operating on the escaped string).
    //    Groups: 1=label, 2=markdownUrl, 3=rawUrl.
    const linkPattern = /\[([^\]]+)\]\(([^\s()<>]+)\)|((?:https?:\/\/|www\.)[^\s()<>]+(?:\([\w\d]+\)|[^\s`!()[\]{};:'".,<>?«»“”‘’]))/gi;
    html = html.replace(linkPattern, (match, label: string, markdownUrl: string, rawUrl: string) => {
        const url = label ? markdownUrl : rawUrl;
        // The URL was escaped, so &→&amp;. Decode for validation/href value.
        const href = toSafeHttpUrl((url || '').replace(/&amp;/g, '&'));
        if (!href) return match;
        const text = label || rawUrl;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="editor-inline-link" style="text-decoration: underline; font-weight: 500;">${text}</a>`;
    });

    // 4) Emphasis. Bold before italic so ** isn't eaten by the * rule.
    //    Underline (++x++) runs before italic too so its plus signs are safe.
    html = html
        .replace(/\*\*\*([\s\S]*?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\+\+([\s\S]*?)\+\+/g, '<u>$1</u>')
        .replace(/(^|[^*])\*(?!\s)([\s\S]*?)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/~~([\s\S]*?)~~/g, '<s>$1</s>');

    // 5) Restore protected code spans.
    html = html.replace(/\uE000(\d+)\uE001/g, (_m, i: string) => codeStash[Number(i)] || '');

    return html;
}
