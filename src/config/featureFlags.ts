/**
 * Beta feature flags (see BETA_SCOPE.md — "Feature checklist" decision,
 * 2026-07-11).
 *
 * Deferred features stay in the tree — compiled, typechecked, and
 * refactored together with everything else — but their entry points are
 * hidden while the flag is off. Bringing one back is a one-line change
 * here (plus its QA pass), never a branch merge.
 *
 * Local/dev override without code changes: set VITE_FEATURE_<NAME> in
 * .env(.local), e.g. VITE_FEATURE_COLLABORATION=true
 */

const envFlag = (name: string): boolean | undefined => {
    const raw = (import.meta.env as Record<string, string | undefined>)[`VITE_FEATURE_${name}`];
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return undefined;
};

export const FEATURES = {
    /** Realtime co-editing, live cursors, invitations, workspace switching UI. */
    collaboration: envFlag('COLLABORATION') ?? false,
    /** Notion workspace import. */
    notionImport: envFlag('NOTION_IMPORT') ?? false,
    /** AI image generation — text/mindmap/Chunk-It AI stays on. */
    aiImages: envFlag('AI_IMAGES') ?? false,
    /** Marketplace page (currently a placeholder). */
    marketplace: envFlag('MARKETPLACE') ?? false,
    /** Board node: plan note cards in lanes driven by their own metadata.
     *  Rebuilt 2026-08-10; set VITE_FEATURE_KANBAN=false to pull it from the
     *  beta surface again without touching code. */
    kanban: envFlag('KANBAN') ?? true,
    /** Files: upload any filetype, hold it in the asset store, open it as a
     *  card on the canvas or in a peek. Replaces the old `pdfBlock` flag —
     *  react-pdf is gone and files render natively, so there is no longer a
     *  heavy dependency to defer. */
    files: envFlag('FILES') ?? true,
    /**
     * Expanded card metadata as a wrapping chip bar instead of stacked
     * property rows (2026-08-29).
     *
     * The old NotePropertiesPanel is untouched and still wired up behind this
     * flag, so going back is this one line — or `VITE_FEATURE_COMPACT_CARD_META=false`
     * in .env.local, with no code change at all. The stacked panel cost 303px
     * of a 542px card to show seven words; the bar costs about 60.
     */
    compactCardMeta: envFlag('COMPACT_CARD_META') ?? true,
    /** Timestamp-linked YouTube study studio. Kept off until Study Core QA. */
    youtubeStudy: envFlag('YOUTUBE_STUDY') ?? false,
    /** Paid rewrite/summary actions; deliberately ships behind its own gate. */
    youtubeStudyAI: envFlag('YOUTUBE_STUDY_AI') ?? false,
} as const;
