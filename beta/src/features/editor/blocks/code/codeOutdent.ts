/** Remove one leading indent from the caret's line, preserving its text. */
export function codeOutdent(text: string, offset: number): { start: number; end: number; caret: number } | null {
    const caret = Math.max(0, Math.min(text.length, offset));
    const start = caret === 0 ? 0 : text.lastIndexOf('\n', caret - 1) + 1;
    const leading = /^(?:[ \u00a0]{1,2}|\t)/.exec(text.slice(start))?.[0];
    if (!leading) return null;
    return { start, end: start + leading.length, caret: Math.max(start, caret - leading.length) };
}
