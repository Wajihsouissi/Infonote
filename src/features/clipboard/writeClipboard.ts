/**
 * Write both a plain-text and an HTML flavour to the system clipboard.
 *
 * Used by the toolbar Copy buttons. Keyboard copy/cut don't need this — they
 * ride the native `copy`/`cut` events, where `clipboardData.setData` can set
 * both flavours directly. `navigator.clipboard.write` is the only way to do the
 * same outside an event, and it needs a ClipboardItem.
 *
 * Falls back to text-only rather than failing outright: a plain-text copy is
 * still far better than nothing if the browser refuses the rich write.
 */
export async function writeRichClipboard(text: string, html: string): Promise<boolean> {
    try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                    'text/html': new Blob([html], { type: 'text/html' }),
                }),
            ]);
            return true;
        }
    } catch {
        /* fall through to the text-only path */
    }

    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
