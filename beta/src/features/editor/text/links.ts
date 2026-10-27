import { DEFAULT_HIGHLIGHT_HUE, HIGHLIGHT_PATTERN } from './inlineFormat';
import { toSafeHttpUrl } from './safeLink';

export function isUrl(str: string): boolean {
    return /^(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i.test(str.trim());
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const renderMarks = (html: string): string => html
    .replace(/\*\*\*([\s\S]*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\+\+([\s\S]*?)\+\+/g, '<u>$1</u>')
    .replace(/(^|[^*])\*(?!\s)([\s\S]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([\s\S]*?)~~/g, '<s>$1</s>');

/** Recognize atoms before interpreting emphasis. URLs never pass through the
 * mark renderer, and code cannot accidentally turn its contents into links.
 * The private token prefix is absent from the input, so literal user data
 * cannot impersonate an atom or disappear during restoration. */
export function renderContentWithLinks(content: string, linkify = true): string {
    if (!content) return '';
    const atoms: string[] = [];
    let prefix = '\uE000chnk-inline-', collision = 0;
    while (content.includes(prefix)) prefix = `\uE000chnk-inline-${++collision}-`;
    const protect = (html: string) => { const token = prefix + atoms.length + '\uE001'; atoms.push(html); return token; };
    let html = '', cursor = 0;
    while (cursor < content.length) {
        if (content[cursor] === '\x60') {
            let length = 1;
            while (content[cursor + length] === '\x60') length++;
            const fence = '\x60'.repeat(length), end = content.indexOf(fence, cursor + length);
            if (end >= 0 && end > cursor + length) {
                const code = renderMarks(escapeHtml(content.slice(cursor + length, end)));
                html += protect('<code style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.85em; padding: 0.2em 0.4em; border-radius: 3px; color: #eb5757; background: var(--glass-bg, rgba(135,131,120,0.15));">' + code + '</code>');
                cursor = end + length; continue;
            }
        }
        if (linkify && content[cursor] === '[') {
            const labelEnd = content.indexOf('](', cursor + 1);
            if (labelEnd >= 0 && !content.slice(cursor, labelEnd).includes('\n')) {
                let end = labelEnd + 2, depth = 1;
                for (; end < content.length && depth; end++) {
                    if (content[end] === '(') depth++;
                    else if (content[end] === ')') depth--;
                }
                if (!depth) {
                    const url = content.slice(labelEnd + 2, end - 1);
                    const label = content.slice(cursor + 1, labelEnd);
                    const internal = /^chnk:\/\/(page|node)\/([A-Za-z0-9_-]+)$/.exec(url);
                    const href = !/[\s<>]/.test(url) ? toSafeHttpUrl(url) : null;
                    if (internal && label) {
                        const attribute = internal[1] === 'page' ? 'data-page-id' : 'data-cite-node';
                        const className = internal[1] === 'page' ? 'editor-page-chip' : 'editor-cite-chip';
                        // Firefox cannot focus anchors nested in an editable.
                        // An atomic link-role span retains keyboard access there.
                        html += protect('<span ' + attribute + '="' + escapeHtml(internal[2]) + '" contenteditable="false" role="link" tabindex="0" class="' + className + '">' + renderContentWithLinks(label, false) + '</span>');
                    } else if (href && label) {
                        html += protect('<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" class="editor-inline-link" style="text-decoration: underline; font-weight: 500;">' + renderContentWithLinks(label, false) + '</a>');
                    } else html += escapeHtml(content.slice(cursor, end));
                    cursor = end; continue;
                }
            }
        }
        if (linkify && /[hw]/i.test(content[cursor]) && /^(?:https?:\/\/|www\.)/i.test(content.slice(cursor, cursor + 8))
            && (cursor === 0 || !/[\w]/.test(content[cursor - 1]))) {
            const raw = /^(?:https?:\/\/|www\.)[^\s<>"']+/i.exec(content.slice(cursor))?.[0];
            if (raw) {
                let url = raw.replace(/[.,!?;:]+$/, '');
                const before = content.slice(0, cursor);
                const surrounding = /(\*{1,3}|\+\+|~~)$/.exec(before)?.[1]
                    ?? (/==(?:[a-z]+\|)?$/.test(before) ? '==' : null);
                if (surrounding && url.endsWith(surrounding)) url = url.slice(0, -surrounding.length);
                for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
                    while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
                }
                const href = toSafeHttpUrl(url);
                if (href) {
                    html += protect('<a href="' + escapeHtml(href) + '" data-bare-url="true" target="_blank" rel="noopener noreferrer" class="editor-inline-link" style="text-decoration: underline; font-weight: 500;">' + escapeHtml(url) + '</a>');
                    cursor += url.length; continue;
                }
            }
        }
        html += escapeHtml(content[cursor++]);
    }
    // Preserve the existing repair for a streamed, truncated model label.
    html = html.replace(/^(\s*)\*{1,2}([^\s*:\n][^*:\n]{0,78}:)\*(?!\*)\s*/, '$1<strong>$2</strong> ');
    html = html.replace(HIGHLIGHT_PATTERN, (_match, hue: string | undefined, text: string) =>
        '<mark class="editor-mark" data-hue="' + (hue || DEFAULT_HIGHLIGHT_HUE) + '">' + text + '</mark>');
    html = renderMarks(html);
    return html.replace(new RegExp(prefix + '(\\d+)\uE001', 'g'), (_match, index: string) => atoms[Number(index)] ?? _match);
}
