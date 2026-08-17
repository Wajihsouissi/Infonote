/**
 * Downscaled copies of inline media, for boards.
 *
 * Media is stored as a data URL inside the block, so a gallery of twenty
 * photographs is twenty full-resolution bitmaps living in the document: they are
 * decoded at full size to be painted into a 200px tile, they are re-serialised
 * on every unrelated edit to the card, and they ride along in every sync
 * payload. At the 10MB-per-file ceiling that is a 200MB board.
 *
 * A tile is a few hundred pixels wide, so it only ever needed a few hundred
 * pixels of picture. The original stays in `content` — it is what the lightbox
 * opens and what any export writes out — and the thumbnail is a second, small
 * copy the tiles draw instead. Nothing downstream has to know it exists.
 */

/** Longest edge of a generated thumbnail, in px.
 *
 *  A tile tops out around 520px (a `lg` bento tile on a wide board), and this
 *  doubles that for retina. Larger buys nothing a moodboard can show; smaller
 *  starts to look soft on a hero tile. */
export const THUMB_MAX_EDGE = 1024;

/** JPEG quality. High enough that colour and grain still read — the whole point
 *  of a reference board — without paying for detail a tile cannot resolve. */
const THUMB_QUALITY = 0.78;

/** Below this saving, keep the original: a second copy that is 90% the size of
 *  the first makes the document bigger, not smaller. */
const MIN_SAVING = 0.7;

/** Give up rather than hold a board's render hostage to one broken picture. */
const DECODE_TIMEOUT_MS = 8000;

/**
 * Only inline images are worth thumbnailing.
 *
 * A remote URL costs nothing to store and would taint the canvas — `toDataURL`
 * on a cross-origin bitmap throws a SecurityError, so there is no thumbnail to
 * be had anyway. SVG is already a few KB of text and rasterising it would make
 * it *bigger* while throwing away its one advantage, which is that it stays
 * sharp at any tile size.
 */
export const canThumbnail = (src?: string): boolean =>
    !!src && src.startsWith('data:image/') && !src.startsWith('data:image/svg');

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('decode timed out')), DECODE_TIMEOUT_MS);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('could not decode')); };
    img.src = src;
});

/**
 * A downscaled JPEG copy of `src`, or null when one isn't worth having.
 *
 * Null is a perfectly good answer and every caller must treat it as "just use
 * the original": the source may already be small, may be a format worth
 * keeping whole, or may simply have failed to decode. None of those is an
 * error the user needs to hear about — the board renders identically either
 * way, just heavier.
 */
export async function makeThumbnail(src: string, maxEdge = THUMB_MAX_EDGE): Promise<string | null> {
    if (!canThumbnail(src)) return null;

    try {
        const img = await loadImage(src);
        const { naturalWidth: w, naturalHeight: h } = img;
        if (!w || !h) return null;

        const scale = Math.min(1, maxEdge / Math.max(w, h));
        // Already tile-sized: re-encoding would only lose a generation of
        // quality for no saving.
        if (scale === 1) return null;

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        /* Transparency is flattened onto white by the JPEG encode, so a PNG
           logo would arrive with a black plate on some browsers. Painting the
           plate ourselves makes it the same white everywhere. */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const thumb = canvas.toDataURL('image/jpeg', THUMB_QUALITY);
        return thumb.length < src.length * MIN_SAVING ? thumb : null;
    } catch {
        // Tainted canvas, a decode failure, a timeout — the original still
        // works, so there is nothing to report.
        return null;
    }
}

/** What a tile should draw: the thumbnail when there is one, else the original. */
export const displaySrc = (content: string, thumb?: string): string => thumb || content;
