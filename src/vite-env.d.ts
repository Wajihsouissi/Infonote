/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_AI_GATEWAY_API_KEY: string;
    readonly VITE_AI_GATEWAY_TEXT_MODEL?: string;
    readonly VITE_AI_GATEWAY_IMAGE_MODEL?: string;
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
}
