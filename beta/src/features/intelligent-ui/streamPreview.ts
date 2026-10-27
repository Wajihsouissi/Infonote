import type { UIStreamPreview } from './types';
import { clampUIHeight } from './types';
import { splitUIProse } from './nativeBlocks';

/** Decode a JSON string even when the network chunk stops mid escape/token. */
function stringAt(source: string, start: number) {
    let value = '';
    for (let i = start + 1; i < source.length; i++) {
        const c = source[i];
        if (c === '"') return { value, end: i + 1, complete: true };
        if (c !== '\\') { value += c; continue; }
        const escape = source[++i];
        if (escape === undefined) break;
        if (escape === 'u') {
            const hex = source.slice(i + 1, i + 5);
            if (!/^[\da-f]{4}$/i.test(hex)) break;
            value += String.fromCharCode(parseInt(hex, 16)); i += 4;
        } else {
            const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
            if (!(escape in escapes)) break;
            value += escapes[escape];
        }
    }
    return { value, end: source.length, complete: false };
}

/** Read only top-level CSS/HTML; nested prose or JS strings cannot become a preview. */
export function readUIStreamPreview(source: string): UIStreamPreview | undefined {
    let depth = 0;
    let css: string | undefined;
    let html: string | undefined;
    let height = 360;
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (c === '{' || c === '[') { depth++; continue; }
        if (c === '}' || c === ']') { depth--; continue; }
        if (c !== '"') continue;
        const key = stringAt(source, i);
        i = key.end - 1;
        if (!key.complete) break;
        const colon = /^\s*:\s*/.exec(source.slice(key.end));
        if (depth !== 1 || !colon) continue;
        const start = key.end + colon[0].length;
        if (source[start] === '"') {
            const field = stringAt(source, start);
            if (key.value === 'css' && field.complete && field.value.length <= 30_000) css = field.value;
            if (key.value === 'html' && field.value.length <= 80_000) html = field.value;
            i = field.end - 1;
        } else if (key.value === 'initialHeight') height = clampUIHeight(Number(/^\d+/.exec(source.slice(start))?.[0])) ?? height;
    }
    if (css === undefined || !html?.trim()) return undefined;
    // Only complete markup prefixes are useful. DOMParser handles unclosed
    // containers; a trailing half-written tag must not appear as visible text.
    const trailingTag = html.lastIndexOf('<');
    if (trailingTag > html.lastIndexOf('>')) html = html.slice(0, trailingTag);
    html = splitUIProse(html, '', []).html;
    return html.trim() ? { css, html, initialHeight: height } : undefined;
}
