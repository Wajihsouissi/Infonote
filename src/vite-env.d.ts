/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_GEMINI_TEXT_MODEL?: string;
    readonly VITE_GEMINI_IMAGE_MODEL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

/**
 * Cross-editor drag/drop coordination flags stashed on `window` so independent
 * BlockEditor instances (each a separate React tree) can hand a drag off to one
 * another without a shared store. Declared here so call sites stay untyped-cast-free.
 */
interface Window {
    chnkItBlockDragging?: boolean;
    chnkItCrossEditorDropHandled?: boolean;
    chnkItDragCleanup?: (() => void) | undefined;
    chnkItMultiDragCleanup?: (() => void) | undefined;
    chnkItRemoveDraggedBlocks?: ((ids: string[]) => void) | null;
    /**
     * Set by a gallery while one of its tiles is being dragged. A tile is not a
     * top-level block — it lives in the board's `metadata.items` — so the generic
     * "remove the dragged blocks from the source node" cleanup can never find it.
     * Whoever accepts the drop calls this instead, and the board drops the tile.
     */
    chnkItGalleryItemTaken?: ((ids: string[]) => void) | null;
}
