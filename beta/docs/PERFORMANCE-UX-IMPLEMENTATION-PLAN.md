# Performance implementation with unchanged expanded-card content

تحديث 19 أكتوبر: تصلّحت إعادة البناء الزايدة للكارتات الكاملة وقت تبديل مستوى التكبير. [التقرير والاختبارات والنتائج المتكرّرة بالتونسي](PERFORMANCE-ZOOM-2026-10-19.md). أداء الجدول الكبير مازال ما وصلش للهدف بثبات، وتحسينات العرض والتحميل مازالت موش مكتملة.

Date: 18 October 2026. Status: first text/list/table slice implemented and locally validated. Desktop production typing met the local target in three runs per workload; CPU ×4 stress still misses its target. See [implementation scope and evidence](PERFORMANCE-READING-IMPLEMENTATION-2026-10-18.md). The remaining stages and all-block-family parity are not complete.

This is the current product contract for the next performance work. It takes precedence over the older plan's truncated passive previews, text-only expanded-card overview, and suggestions to aggregate expanded cards. Preserve the custom editor and the mind map. MiniMap and floating canvas controls stay removed.

19 October update: at the user's explicit request, folder autosave was restored as a separate storage slice. See [folder implementation, tests and diagnostic limits](FOLDER-AUTOSAVE-IMPLEMENTATION-2026-10-19.md). This does not complete stages C–E or replace their rendering/interaction acceptance gates.

## User outcome and release contract

An expanded card displays the same real content, layout, and design whether its editing engine is active or idle. Every expanded card remains independently scrollable through its entire content. Activation changes editing capability, not the document presentation.

- Preserve card position/size, compact cover/icon/title header, typography, rich formatting, indentation, numbering, columns, table widths/heights, images, and existing control affordances. Focus/caret and intentional edit controls may appear when appropriate without shifting document layout.
- Preserve the visible content and local scroll position through activation, demotion, selection changes, pan/zoom, viewport culling/re-entry, and nested-canvas return. Preserve each table's horizontal scroll and interactive presentation state too.
- Ordinary reading/scrolling does not require activating an editor. Clicking text begins editing at the intended location with the first click; keyboard access also activates the correct destination. No extra activation click, lost first character, scroll reset, or automatic camera movement.
- Inactive means that editing listeners, drag machinery, document effects, and unnecessary subscriptions are absent or asleep. It does not mean missing content, disabled reading controls, reduced opacity, skeletons replacing existing content, or an abbreviated table.
- Offscreen work may be deferred. As content enters a card's visible scroll viewport, show the real content with the same geometry. Do not expose virtual spacers as blank document content or replace deep content with “More content”.
- Keep text selection, links, checkboxes, toggles, files, galleries, media controls, and supported embedded content functional. A control may perform a small document transaction without mounting a full editor. Preserve legitimate embed permissions/sandbox boundaries.
- No new clustering, folding, summaries, or text-only substitutions for expanded cards to obtain a faster result. Zoom naturally scales the same presentation. Any different future overview design needs a separate product decision.

The visual baseline is the existing active expanded card at a fixed viewport, width, zoom, theme, and document revision. Compare the inactive result to that baseline, not merely to the existing limited preview. The full content model remains authoritative; a screenshot is not an accessible, scrollable replacement for it.

## Confirmed implementation gaps

| Current code | Gap against this contract | Planned change |
| --- | --- | --- |
| `src/features/card/NoteBodyPreview.tsx` | Caps blocks by depth, tables at 12 rows/8 columns, galleries at 12 items, columns at four, and nesting at four; some embeds/media become fallbacks. | Replace the expanded-card path with a complete reading surface using shared block presentation. Mount by visible range when safe, never by a fixed prefix. |
| `NoteBodyPreview.module.css` | Disables pointer events and text selection; loading can dim content. | Give the reading surface genuine reading/selection/control behavior. Keep only editing behavior conditional. |
| `NoteBody.tsx` / `NoteBody.module.css` | Distinct preview/editor trees and a 180ms dissolve conceal differing layout metrics. | Share layout and scroll ownership. A fade must not be used as proof of parity; eliminate duplicate content layers after handoff is stable. |
| `CanvasNodeBody.tsx` | Remembers a minimum height but cannot preserve arbitrary full-document layout or scroll by itself. | Use the same body/session contract for ordinary, fused, and block nodes, preserving each node's existing design. |
| `useCanvasEditorEligibility.ts` / `useScheduledMount.ts` | Viewport streaming/overview can remove editing eligibility immediately. | Separate render availability from edit ownership. Protect composition, focus, native selection, and unsaved draft handoff. |
| `canvas/CanvasNodeRenderer.tsx` and preview overview branch | Far zoom can replace expanded content with a label or first-content excerpt. | Exempt expanded surfaces from lossy substitution as part of the new rendering path; measure the resulting cost honestly. |
| `editor/blocks/TableBlock.tsx` | All body rows mount; the passive table independently implements layout. | Share table geometry/presentation, then conditionally virtualize rows with a full-content correctness path. |
| `storage/LocalWorkspaceStore.ts` | Already writes changed node/edge records, but loads all records and scans entities on save. | Preserve incremental writes. Profile loading/scans separately before introducing dirty-record tracking and on-demand document loading. |

These are source observations, not new timing measurements. The measured compositor bottleneck and unmet typing/frame budgets remain documented in [the production report](PERFORMANCE-RESULTS-2026-10-18.md).

## Architecture

### One presentation, optional editing behavior

Introduce shared, memoized block presentation primitives consumed by both reading and editing. Share markup/geometry where possible, plus parsing, formatting, layout tokens, table geometry, list ordinals, media sizing, and nesting. Avoid a second hand-maintained renderer that gradually diverges.

The reading surface consumes the actual document and supports complete scrolling without constructing `BlockEditor` for every card. The active block or editing window adds caret/input/selection/drag behavior. Migrate one block family at a time behind an internal switch; initially retain the existing editor adapter while establishing presentation parity. `readOnly` alone is not a performance boundary if it still mounts all editor effects.

Use one stable outer card and one stable vertical scroll host. Do not change React keys or scroll containers when edit ownership changes. Keep nested horizontal scrollers stable. Media dimensions and decoded assets survive ownership changes; activation must not reload an image/iframe or restart a playing video. Shared rich-text HTML must retain the existing sanitization path.

### Document and view state have different owners

- Document session: stable block IDs, ordered structure, immutable block records, revisioned commands/transactions, dirty records, and one acknowledged draft. Preserve the current `Block[]` boundary through adapters until a separate migration is justified.
- View session: card/surface ID, scroll anchor plus offset, fallback scrollTop, table scrollLeft by block ID, and transient control state. Keep this state across culling and re-entry, scoped to the workspace; prune it on deletion/closure. Scroll events do not create document edits or undo entries.
- Editing session: active owner/block/cell, caret and selection, composition state, pending commit, and pending activation intent. Columns may have coordinated child editors under that owner; “one owner” does not mean one DOM editable in every case.
- Layout cache: block/row measurements keyed by document structure, available width, typography/theme metrics, and media dimensions. Invalidate affected entries on resize, font load, wrapping changes, or media decode. Retain a stable visible anchor while correcting measurements.

Typing updates the changed block/cell urgently. Structural commands invalidate affected structure. Previews, search, persistence, and map projections consume revisioned changes without adding another independent source of text. A future note/map canonical-source migration is a separate, versioned change with ownership and undo tests.

### Interaction handoff

| State | Visible result | Permitted work |
| --- | --- | --- |
| Reading | Real, selectable, fully scrollable content | Visible block presentation and lightweight control actions; no full editing engine per card. |
| Preparing edit | Same content and same anchor | Prioritized preparation for the clicked/focused destination. Record logical block/cell ID and caret/range intent before changing anything. |
| Editing | Same layout with caret/edit affordances | Attach the necessary editing behavior; preserve the focused DOM during typing/composition. |
| Releasing edit | Latest draft remains visible at the same anchor | Publish pending draft to the shared session, flush dependent ownership work in order, then detach editing behavior when safe. |

Native pointer hit testing, double/triple click, selection drag, touch/pen input, keyboard focus, and IME need explicit coverage. Prefer retaining the same text host when feasible. Never synthesize/replay `beforeinput`, composition, clipboard, or arbitrary keystrokes to hide slow mounting. If the current adapter cannot meet first-click/first-input correctness, retain it for that interaction while refactoring the attachment boundary.

Do not demote an editor in the middle of composition, selection drag, or a pending input. Camera movement may pause unrelated work without destroying the active draft. Rapid A → B → A activation and navigation cancel obsolete preparation jobs using owner and revision checks. No older preparation result may steal focus or camera ownership.

### Rendering and background work

Keep camera transforms separate from document updates. Cache the shared presentation and profile CSS/layer changes on a frozen fixture. Begin with controlled compositor experiments; do not assume another `memo` or `will-change` fixes the measured bottleneck.

Spatial indexes and per-parent adjacency caches can reduce viewport graph scans. They must update incrementally on move/resize/structure changes and preserve existing edge visibility semantics, including edges crossing the viewport. They do not make an all-visible zoomed-out scene free to paint.

For many visible expanded cards, evaluate lossless cached rendering of noninteractive decoration/edges, not a replacement of real readable content. A bitmap-only card is insufficient for selection, accessibility, scrolling, and media interaction. A graphics renderer must pass the same presentation/interaction contract before adoption; it is not assumed to solve this project.

Workers may handle measured pure graph planning, layout, search indexing, and import work. Send small revisioned changes, cancel obsolete jobs, and apply coherent results. They cannot manipulate the editing DOM or fix compositor cost. Keep urgent input off background queues.

## Delivery sequence

### A. Establish visual and interaction contracts first

Add headed expanded-card fixtures with a long mixed dossier, deep nesting, more than four columns, tables beyond the existing preview caps, gallery overflow, images, links/embeds, and supported Intelligent UI content. Freeze fonts, media, viewport, zoom, and initial revision for comparisons.

Capture active versus inactive top/middle/bottom views at identical local scroll anchors. Assert content values/IDs, bounding boxes, line wrapping, table dimensions, scrollbar ranges, selected text, and control actions alongside screenshots. Mask only caret/blink and documented intentional focus controls; do not mask content differences. This baseline should expose current failures rather than declare the current preview correct.

### B. Unify card presentation and interaction handoff

Extract shared block presentation and use a stable reading/editing body in `NoteExpandedContent`, `NoteBody`, and `CanvasNodeBody`. Start with text, headings, lists, toggles, and tables; cover columns, media, files, links, galleries, and embeds before replacing the existing expanded-card path globally.

Remove lossy prefix/depth/row/column caps from that new path. Initially prefer a complete semantic reading path plus existing safe containment while measuring DOM cost. Do not remove all caps and mount every full editor as the production solution. Unsupported blocks retain their existing correct rendering until migrated; publish remaining cost/coverage explicitly.

Implement view-state retention and commit-safe activation/demotion. Remove obsolete preview/fade branches only after all expanded node variants pass. Update the old overview regression's expectations to the new product contract; keep its authoritative bounds, edge, focus, and navigation checks.

### C. Bound update work within a document

Introduce document-scoped per-block subscriptions/transactions if profiling confirms remaining document-wide reconciliation cost. Preserve stable identity and update only the affected block/row and necessary structural owners. Retain current caret/IME guards, debounce maximum waits, owner merge rules, and save ordering. Do not perform a global state-library rewrite.

### D. Virtualize table rows, then documents where safe

Use the expanded card's actual scroll viewport, including canvas scale and nested horizontal scrolling. Evaluate `@tanstack/react-virtual` for measured variable-height rows; column virtualization and whole-document windowing are separate changes.

Preserve column geometry in both modes. Native automatic table sizing can depend on unmounted rows: do not silently switch to fixed widths. Use shared measurements/layout data or retain full rendering for that table until parity is established. Width, row height, and wrapping must not change on activation.

Pin composing/focused rows, selection endpoints/range, drag destinations, and pending keyboard destinations. Mount a destination before focusing it. Use logical identity through row/column reorder rather than relying on viewport indexes. Test rapid scrollbar jumps, end-of-document navigation, resize, image decode, and wheel scrolling through several unselected cards.

Keep complete-model copy/export/print/search paths. Programmatic model search alone does not preserve browser find or native cross-window selection. Retain a correct full-render path wherever those behaviors cannot be supported; do not ship windowing for that case until the product contract passes. An optimization with missing content or blank visible regions fails even if DOM count improves.

### E. Optimize canvas and background work against the same presentation

Apply winning CSS/compositor changes from controlled experiments, then evaluate incremental spatial indexing (`rbush`) and graph planning workers (native Worker; optionally Comlink). Preserve presentation during pan/zoom rather than reverting expanded cards to abbreviated previews. Keep camera/focus fixes and generated-map resize guards.

Loading, media cache limits, dirty-record persistence, and bounded undo retention follow measured attribution. Reserve intrinsic media dimensions and use appropriate image variants without visibly reducing quality. Loading a saved workspace may require an honest initial loading state; once real content is shown, activation/demotion must not replace it with loading UI or stale content.

### F. Production validation and cleanup

Run the frozen expanded-card fixture before/after each enabled stage. Preserve unrelated work in the shared repository. Keep changes reviewable, with an internal fallback to the last correct presentation and a removal plan for temporary switches. No dependency or persisted-schema migration is required by this planning document alone.

## Acceptance gates

| Area | Required evidence |
| --- | --- |
| Presentation | Active/inactive screenshots and DOM geometry agree at top/middle/bottom across supported zooms and themes; no content substitution, clipping regression, dimming, or layout shift attributable to handoff. |
| Full content | Last paragraph, deep nested block, last gallery item, final row/column, and all column content are reachable and correct while the card is inactive. No fixed-prefix rendering contract. |
| Continuity | Same visible block anchor/offset and nested scroll positions through A → B → A, pan/cull/re-entry, nested navigation, resize, and content updates. Fractional-pixel tolerance is documented; no perceptible jump. |
| Editing | First-click caret, first typed character, rapid card switching, Tab/Shift+Tab, drag selection, copy/paste, undo/redo, and composition remain correct. No forced-click testing workaround. |
| Media and controls | Links, toggles, checkboxes, galleries/files, sandboxed embeds, and supported interactive blocks retain behavior. Ownership changes do not remount persistent media unnecessarily. |
| Accessibility | Reading order, keyboard navigation, focus indication, table semantics, accessible names, and supported native find/selection/print behavior pass. Include real IME and screen-reader sessions before broad windowing rollout. |
| Persistence | Edits through either state, map ownership, deletes/reorders/undo, table growth, and acknowledged save/reload preserve semantic content. No new scroll/measurement history entries. |
| Performance | At least three foreground production runs and at least 200 typing samples per workload; report per-run p95/max and variability. Targets: typing p95 ≤50ms desktop and ≤100ms CPU ×4; pan frame p95 ≤33.3ms on the fixed heavy case. Targets are not current results or hardware-independent guarantees. |
| Resource use | No live full editor per inactive card. Record mounted content, DOM size, retained heap, listeners, media resources, worker/save queues, and long tasks. Run repeated editing/history/navigation sessions and a settled 20-cycle resource check. |
| Scale | Keep the existing 1,211-block/919-card case; add 5,000-block documents, 20,000-cell tables, and staged larger canvases. Report capacity actually tested and the cost of all-visible real-content overview separately. |

A performance gain is accepted only when the visual, interaction, accessibility, and persistence gates pass. If the exact-content all-visible scene still misses the frame target, report the measured limit and continue renderer work; do not silently change the user's presentation to manufacture a passing result.

## First implementation slice

Deliver A plus the text/list/table portion of B in isolation: failing active/inactive continuity fixtures, shared presentation primitives, a stable scroll host, and safe first-click activation. Verify top/middle/bottom reading and A → B → A before expanding to other block families or enabling virtualization. This is the next concrete code change, not a renderer rewrite or dependency installation.
