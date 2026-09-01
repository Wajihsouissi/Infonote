/**
 * assetRef
 * --------------------------------------------------------------------------
 * A media block's `content` used to be the file itself, inlined as a base64
 * data URL. That put every uploaded file inside the document — and so inside
 * every nodes.json write and every Supabase `data_json` row, inflated a
 * further ~33% by base64. Ten megabytes was the
 * only thing holding the documents together, and it is far too small for the
 * PDFs and spreadsheets this app is meant to hold.
 *
 * The bytes now live in the asset store and `content` holds a reference to
 * them: `asset:<uuid>`. Everything downstream that treated `content` as a URL
 * keeps working, because `useAssetUrl` resolves a reference to a blob URL and
 * passes every other string (`data:`, `https:`, `blob:`) straight through.
 * Legacy documents therefore need no migration at all.
 */

export const ASSET_SCHEME = 'asset:';

export const makeAssetRef = (id: string): string => `${ASSET_SCHEME}${id}`;

export const isAssetRef = (value: unknown): value is string =>
    typeof value === 'string' && value.startsWith(ASSET_SCHEME);

/** The asset id inside a reference, or null for any other kind of URL. */
export const parseAssetRef = (value: unknown): string | null => {
    if (!isAssetRef(value)) return null;
    return value.slice(ASSET_SCHEME.length) || null;
};

/** Every asset id referenced anywhere in a block tree, including gallery items
 *  and nested container/column children. Used by the orphan sweep. */
export const collectAssetIds = (
    blocks: unknown,
    into: Set<string> = new Set(),
): Set<string> => {
    if (!Array.isArray(blocks)) return into;
    for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        const b = block as { content?: unknown; metadata?: Record<string, unknown> };
        const id = parseAssetRef(b.content);
        if (id) into.add(id);
        const meta = b.metadata;
        if (!meta) continue;
        const posterId = parseAssetRef(meta.poster);
        if (posterId) into.add(posterId);
        const thumbId = parseAssetRef(meta.thumb);
        if (thumbId) into.add(thumbId);
        // Gallery tiles, container/toggle children and column contents are all
        // ordinary blocks living one level down.
        collectAssetIds(meta.items, into);
        collectAssetIds(meta.blocks, into);
        collectAssetIds(meta.content, into);
        if (Array.isArray(meta.columns)) {
            for (const col of meta.columns) {
                collectAssetIds((col as { content?: unknown })?.content, into);
            }
        }
    }
    return into;
};
