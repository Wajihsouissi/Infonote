# Heavy-content performance implementation plan

Status: core implementation applied; expanded-card production measurements expose remaining editor and canvas budget failures. See [current production results](PERFORMANCE-RESULTS-2026-10-18.md) and [implementation details](PERFORMANCE-RESULTS-2026-10-16.md). The conditional DOM/table windowing stages remain gated separately.
Date: 16 October 2026.

18 October product-contract update: follow [the current expanded-card implementation plan](PERFORMANCE-UX-IMPLEMENTATION-PLAN.md) for the next work. Inactive expanded cards must preserve the active card's real content, design, full scrolling, and interaction continuity. That contract supersedes this historical plan's fixed-prefix passive previews, lossy expanded-card overview, and aggregation suggestions. Performance targets remain unmet; the new plan is not an implemented result.

## Outcome and scope

Keep the current block editor and mind map. Make a long dossier pleasant to edit, including tables, columns, images, and toggles. Make canvas movement and nested navigation responsive as the workspace grows. Preserve the saved document format and the identity relationship between a note and its generated map.

The implementation should make work follow the changed block and the visible region, rather than the total amount of content. Do this incrementally, with a production comparison after each meaningful change. Keep the mind map. The user requested removal of the MiniMap and floating canvas controls; both have been removed.

## Evidence and limits

Authoritative evidence: [headed study report](../../output/audits/headed-investment-study/FINAL-REPORT.md), run `2026-10-16T18-59-46-336Z`.

| Observation | Meaning for the plan |
| --- | --- |
| 1,211-block dossier: input-to-second-rAF p95 236.7ms | Prioritize the editor's own render and layout work, independently of the map. |
| 968-cell table: p95 193.0ms; columns: p95 98.4ms | Measure these separately; a canvas-only fix will not establish that editing is fast. |
| 47 mounted map cards and 47 mounted block editors | Inactive map nodes need a cheaper representation and the shared eligibility policy. |
| Dossier phase: 23,268 DOM elements; substantial style recalculation | Leaf memoization alone does not bound the browser's rendering cost. |
| Workspace-load/nav phases contain 3.9s/4.2s tasks | Separate hydration, graph construction, mounting, layout, saving, and navigation before attributing the stalls. |
| Add cover blocked by toolbar at 30% zoom | Confirmed pointer-hit-area bug with a small, separate fix. |
| 30% minimum zoom cannot fit the large board/map | Overview needs both a lower zoom and a cheaper, useful level of detail. |
| All 921 cards and 882 edges restored semantically | Preserve this correctness baseline. No verified content-loss defect in this specimen. |

These timings came from a development build with recording and some CPU sampling. They are diagnostic evidence, not production baselines, official INP, or a prediction of percentage improvement. The long tasks belong to whole phases, not necessarily typing itself.

Source inspection also confirms full JSX-tree construction in `BlockEditor`, whole-table normalization after rows change, and serialized comparisons in map reconciliation. Their individual production cost still needs measurement.

## Existing work to preserve

These changes are already present locally and are not new tasks to implement again:

- Composition guards, caret-safe rich-text splitting, and removal of layout-dependent `innerText` reads from ordinary typing.
- Stable editor handlers, no-op text-update guards, and cleanup of unmounted block refs.
- Linear render-tree construction/list indexing and cached collapsed-toggle visibility.
- Debounced editor commits with a maximum wait; flush on blur, unmount, and page lifecycle events.
- Pending local/owner merge rules, preserving deletions and independent field updates.
- Stable table callbacks, memoized cells/body rows, and preservation of unchanged row references.
- Stable column identity and memoized sibling column editors.
- Core/DOM/document-hook checks and headed regression infrastructure.

The full check passed before the heavy study. Every subsequent change must rerun the checks relevant to its scope; that earlier pass does not validate future edits.

## 0. Establish a production baseline and acceptance contract

Files: `scripts/run-heavy-study.mjs`, `qa/investment-study.mjs`, the E2E support layer, and a new production performance runner/report.

1. Run the actual production output using `npm run build` and `vite preview` on a separate port. Preserve the beta dev server.
2. Bootstrap an isolated browser profile through the existing IndexedDB schema or exported browser storage state. Let the application hydrate normally. Do not expose `window.__appStore` in production for testing.
3. Split initial fixture seeding from measured reload. Use persisted data and DOM assertions as the production oracle; do not time fixture construction as application startup.
4. Reuse the same document, cached image bytes, viewport, key rate, machine, browser, and instrumentation before/after. Keep profiling runs separate from the main timing series. Record cold and warm runs separately.
5. Measure at least three runs per condition, collecting at least 200 typing samples per workload across the runs. Report per-run distributions, medians of run p95 values, maxima, and variability. Do not hide a poor run inside one pooled average.
6. Capture input-to-second-rAF as the existing continuity metric, Event Timing where supported as a separate measurement, long-task attribution, frame intervals, DOM size, mounted editor count, write count/duration, and mount/commit work. Label each metric accurately.
7. Add temporary test-side counters or a profiling build for React render attribution. Keep those measurements separate from the standard production build and remove temporary app instrumentation before release.

Workload matrix:

- Documents: 100, 500, 1,211, and 5,000 mixed blocks. The 5,000-block case tests scaling; the existing specimen remains the primary acceptance case.
- Tables: existing 121 × 8 table, then 500 × 12 and 1,000 × 20; single-cell typing, paste, resizing, reordering, and keyboard growth measured separately.
- Columns: two long columns, then four columns and nested mixed content. Count nested editors separately from unrelated canvas editors.
- Canvas: existing 160-card room, then the saved 921-card workspace; normal viewing and fitted overview are different workloads.
- Dossier before map generation, and the same content after generation. A temporary map-disabled comparison quantifies map overhead without deleting the feature or user data.
- Standard desktop, repeatable 4× CPU throttling, then headed Firefox/WebKit/Edge and a small screen for correctness. Synthetic IME tests do not replace a real composition-keyboard check.

Initial acceptance targets, not measured promises:

| Area | Target on the recorded reference desktop |
| --- | --- |
| Settled typing in the 1,211-block dossier and existing large table | Input-to-second-rAF p95 ≤50ms; ≤100ms under 4× CPU throttling. |
| Small documents | No reproducible material regression; investigate changes larger than 10% after accounting for run noise. |
| Canvas editors | Zero live editors in inactive cards; at most one active canvas document owner. Its column/container child editors are legitimate. Record a bounded transition overlap separately. |
| Pan/zoom | Aim for median frame interval near 16.7ms and p95 ≤33.3ms on the reference machine; report dropped frames separately. |
| Long operations | Visible feedback within 100ms; no recurring main-thread task over 200ms attributed to settled typing. Chunk graph computation toward ≤8–12ms slices where feasible, and measure React commits separately. |
| Save correctness | All expected text, block IDs/order, table cells, ownership, and edges survive navigation and acknowledged save/reload. |
| Memory | After 20 repeated open/close/navigation cycles and settled cleanup, no accumulating detached editors, listeners, blob URLs, or queued jobs. Compare retained heap under a consistent GC protocol. |

Set first-open and map-completion latency gates after phase 0 supplies a production baseline. Record any target adjustment with evidence; do not redefine a metric to turn a failure into a pass.

## 1. Reduce the long dossier's per-keystroke work

Files: `src/features/editor/BlockEditor.tsx`, `blockTree.ts`, `BlockItem.tsx`; small new render-model/components beside them if needed.

- Separate document content changes from structural changes. Typing text should not repeat list numbering and toggle grouping when type, order, indentation, and structural metadata are unchanged.
- Replace the local recursive `renderNode` closure/full element construction with memoized render components and a render model that retains unchanged subtree identities. Preserve stable block IDs and existing block-object references.
- Invalidate the affected structure for insert/delete, move, indent/outdent, type conversion, collapse changes, list-start changes, and between-block decorations. A cached structure must never display a stale ordinal or hide a new sibling.
- Keep selection state correct at the memoization boundary: an unchanged text block can still need to update when its selection, parent indent, first-child status, or handles change.
- Keep caches scoped to a document/editor and prune removed blocks. Do not mutate a shared cache during render in a way that makes concurrent React renders observe another snapshot.
- Keep ordinary text input urgent. Move optional preview/outline/map work off the urgent path; do not debounce what appears under the caret or wrap the active input update in a transition.
- Retain the simple immutable `Block[]` persistence/API boundary. Initially accept a cheap linear array copy or scan if profiling shows it is insignificant; the objective is to remove expensive subtree work, not claim every operation is O(1).

Acceptance: unchanged heavy block components do not rerender for an unrelated paragraph edit; long-note typing and script/style time improve in production; toggle/list/selection behavior remains correct.

If this still leaves document-wide reconciliation as a measured dominant cost, introduce a document-scoped block-ID subscription model in a separate change. Keep one transaction/owner and an array adapter at the boundary. Do not perform a global store/schema rewrite speculatively.

## 2. Finish the table and column hot paths

Files: `blocks/TableBlock.tsx`, `TableBodyRow.tsx`, `TableCell.tsx`, `text/markdownTables.ts`, `ColumnsBlock.tsx`, `hooks/useEditorDocument.ts`.

Tables:

- Preserve the current row/cell identity contract: a cell edit copies its row and the outer rows array, while untouched rows retain identity. Test render counts rather than assuming memoization is effective.
- Remove repeated whole-table repair from the trusted single-cell update path. Normalize/validate at creation, paste/import, external-owner replacement, and legacy hydration boundaries. A trusted valid cell update must retain a rectangular table; keep defensive handling for untrusted external content.
- Separate cell text edits from row/column structural operations. Resize feedback remains local DOM feedback during drag and commits once on completion.
- Profile native table auto-layout and forced geometry reads. Batch layout reads before writes and retain the distinction between automatic column widths and explicitly sized columns. Do not force fixed layout everywhere to make a benchmark faster.
- Audit ref-callback and pending-focus retention through repeated insert/delete/reorder, and bound cleanup without introducing ref detach/attach churn on every input.
- Preserve header semantics, rich formatting, Tab/Shift+Tab, arrow boundaries, Enter growth, selection, and the focused cell's DOM during composition.

Important audit correction: the local `alignments || []` fallback is not passed to `TableBodyRow`; the row receives `block.metadata?.alignments` directly. Do not invent a row-memoization fix for that fallback.

Columns:

- Keep column IDs, arrays, and unchanged siblings stable; confirm typing in one column does not reconcile every sibling document.
- Keep immediate child-to-parent ownership updates for correctness. Avoid multiplying parent rendering and owner-echo merging for an unchanged acknowledged snapshot; use reference/revision fast paths with a semantic fallback at external boundaries.
- Do not add another independent debounce that can overwrite a sibling edit. Flush all pending child edits in order before column removal, view closure, or lifecycle persistence.
- If many long columns remain expensive, apply the same document rendering strategy to each column, rather than introducing a second editor implementation.

Acceptance: single-cell edits only update the relevant cell/row and necessary owner layers; unrelated tables/columns stay stable; large paste and table growth preserve every value after reload.

## 3. Bound off-screen rendering without breaking editing

Files: editor render components/CSS, table body renderer, note scroll-owner integration, and new focused rendering helpers only where required.

This phase is conditional on phase 1/2 profiling. It has greater selection and accessibility risk than memoization.

1. First test browser rendering containment/content visibility on passive, independent sections with reserved height. Verify it actually reduces style/layout work, and check find-in-page, selection, copy, print, and screen-reader behavior. Avoid containment that changes intrinsic table/column sizing or clips toolbars.
2. If mounted DOM is still dominant, add viewport-based rendering for long documents and large table bodies with overscan and measured heights. Use the actual scroller: expanded card, side pane, fullscreen, or column. Do not assume the window is the scroll owner.
3. Pin the active/composing block or row, drag source/target, pending focus destination, and the range of a native selection. Mount a keyboard destination before moving the caret. Keep selection growth possible across a window boundary.
4. Preserve scroll anchors when heights change, images decode, toggles open, or table rows are added. Do not remount a focused editable to refresh its content.
5. Preserve native table structure and sticky-header behavior. Row spacers must retain column geometry and accessible row position/count. Variable-height cells and user-resized rows need separate coverage.
6. Give operations needing the complete document a complete-data path: select/copy all, export, search, outline navigation, and print. Where native browser features cannot be preserved reliably, keep a full-render fallback and do not enable windowing in that case.

Ship document and table windowing separately. Use a temporary rollout switch, with a full-render fallback and a removal plan for the switch once validated.

Acceptance: mounted rendering work grows mainly with the visible region on the 5,000-block/20,000-cell scaling cases, while keyboard navigation, native selection, copy, composition, and scroll remain correct. A fast benchmark with broken selection is a failed optimization.

## 4. Stop inactive canvas cards mounting live editors

Files: `features/block/BlockNode.tsx`, `features/card/FusedNoteNode.tsx`, `NoteBody.tsx`, `NoteBodyPreview.tsx`, `canvas/hooks/useCanvasEditorEligibility.ts`, and the existing mount scheduler.

- Reuse the ordinary note card's eligibility and scheduled promotion for block/fused nodes. Inactive nodes render static content; selection and interaction readiness promote the active owner.
- Suppress a duplicate background editor while a foreground card pane owns editing. Define the ownership rule explicitly for all four view modes and multi-selection.
- Preserve meaningful non-text controls: image/gallery opening, file opening, toggle affordances, links, and page chips. Current media opening can dispatch to a live media target; give the passive representation an explicit action instead of leaving a missing target.
- Match passive/live typography and footprint, particularly auto-height standalone blocks, numbered blocks, tables, and fused-note scrolling. Keep the measured geometry for edge placement and culling valid.
- Flush before demotion/unmount; avoid demoting a composing/focused editor without a deliberate focus handoff. Bound any existing crossfade overlap so old editors actually leave the tree.

Acceptance: the heavy map no longer mounts one `BlockEditor` per visible card; editing still updates its parent note, and all special block actions work without a forced click.

## 5. Reduce background graph work, preserving save and undo semantics

Files: `store/contentSync.ts`, `graphHelpers.ts`, `slices/nodeContentSlice.ts`, `slices/nestedCanvasSlice.ts`, hydration helpers, `historyConfig.ts`, and local persistence only where the profile justifies edits.

- Replace unconditional `JSON.stringify` equality in normal note/map reconciliation with identity-first comparisons of ordered block references and a semantic fallback for external reconstructed values. Do not replace serialization with an equally expensive deep walk on every key.
- Reuse graph/parent/block indexes per immutable graph revision; reconcile the affected note/branch. Add explicit structural invalidation. Do not rebuild the same index independently for every mounted editor or child.
- Keep parent-sync scheduling bounded and flushable. Test rapid map edit → return → reload, deletion during a queued sync, and continuous edits. Add maximum-wait/cancel/flush behavior if those tests expose the existing trailing-only scheduler's risks.
- Profile large-map planning separately. If its pure computation creates long tasks, split it with real event-loop yields or use a worker for the pure plan. Apply a coherent graph transaction on completion; reject stale results when the note revision or navigation changed. Moving compute to a worker does not solve React mount cost.
- Preserve the current incremental IndexedDB writes and serialized save order. Instrument graph scanning, transaction duration, queue growth, and undo retention before changing them; do not rewrite the whole workspace per key.
- Keep undo/redo atomic for one user action, and keep measurement/selection updates out of history. Add dirty-ID/revision tracking only if whole-graph scans are measured as significant, including correct behavior for import, undo, delete, and hydration.
- Flush editor state, then dependent parent sync, then snapshot/persist. Expose/report actual save completion; a queued asynchronous unload write cannot guarantee durability after a crash or power loss.

Acceptance: no repeated graph-wide serialization during ordinary acknowledged typing, no unbounded sync/save queue, and the 921-card/882-edge semantic round trip still passes after edit/delete/reorder/undo scenarios.

## 6. Make passive previews, media, and overview cheaper

Files: `NoteBodyPreview.tsx`/CSS, asset ingestion/rendering helpers, `useViewportStreaming.ts`, canvas zoom/fit callers, and `canvasConstants.ts`.

- Add explicit overview, normal-preview, and active-editor detail levels. Publish changes at meaningful thresholds/settle with hysteresis; avoid waking every node on every wheel tick or rewriting inherited CSS variables per frame.
- Budget total preview content, including table columns/cells and nested columns, rather than only top-level blocks. The existing 12-row limit does not bound an arbitrarily wide table. Indicate omitted content; never mutate or truncate the saved document to enforce preview limits.
- Preserve original assets and the existing ref-counted URL lifecycle. Add reusable thumbnail variants for expensive local images if decoded-image/memory measurements justify them; keep full media for the viewer. Reserve dimensions and defer off-screen decoding.
- Lower fit/overview zoom coherently across React Flow, keyboard zoom, framing, and nested navigation. At overview scale show spatial structure/labels, with a focus action into a readable card. Define behavior below the current 30% floor rather than displaying the full editor at 2%.
- Profile the all-visible overview separately: ordinary viewport culling cannot discard nodes when the whole board is on screen. If the cheap node representation is still too expensive, aggregate/fold distant groups and simplify edge detail while preserving discoverability and selection.

Acceptance: fit frames the complete authoritative board/map with padding; selecting/focusing a card returns to useful detail; overview does not recreate hundreds of live editors or full table previews.

## 7. Fix the confirmed cover hit-area bug independently

Files: `features/card/noteCard/layout.css`, targeted headed card regression.

- Size/reposition the toolbar's transparent hover bridge to the actual card/menu gap under zoom compensation, including the opening transition.
- Preserve the pointer path into the toolbar and keyboard focus visibility; do not make the toolbar inaccessible to fix the overlap.
- Check normal clicks on Add cover and adjacent header controls at 30%, 50%, 100%, and 200%, plus the new overview's focus-to-edit behavior. Include first hover, immediately after hover, and settled hover.

Acceptance: real Playwright clicks succeed without `force`, focusing as a workaround, or changing the zoom. The toolbar still stays reachable when moving the pointer from card to menu.

## Delivery order and release gates

| Change | Dependency | Required evidence before proceeding |
| --- | --- | --- |
| A. Production runner and fixed fixture | None | Repeatable baseline; persisted content oracle; same instrument settings. |
| B. Editor render boundaries | A | Production long-dossier gain; keyboard/toggle/list/selection regressions pass. |
| C. Table/column hot paths | A, then B comparison | Cell/column render attribution; typing/paste/growth/resize correctness. |
| D. Inactive map editor projection | A; can remain a separate change from B/C | Editor-instance count, geometry/media tests, note-map round trip. |
| E. Cover bridge | Independent small fix | Headed pointer and keyboard regressions at supported zooms. |
| F. Scoped graph sync/background work | B–D measurements | Cost attribution plus save/undo/stale-result tests. |
| G. Preview/media/overview detail | D | All-visible overview frame/DOM/memory measurements and fit/focus correctness. |
| H. Document then table windowing, if required | B/C measured against targets | Selection/IME/copy/search/print/accessibility gates and full-render fallback. |
| I. Final production heavy run and soak | All enabled changes | Same specimen, no semantic loss, all targets/results reported, no accumulating resources. |

Keep changes reviewable and independently reversible. B/C are essential even if the mind map is later removed. H is deliberately gated by evidence and correctness, rather than bundled into the first patch.

Verification for the final enabled implementation:

- Run `npm run check` (lint, existing editor checks, production build, dead-code checks).
- Run focused headed editor, table, columns, scroll, card, file/gallery, camera, persistence, and map-sync regressions against the relevant build.
- Replay the same heavy case with rapid typing, long scroll, table growth/paste, four card views, map generation/editing, three-level navigation, media, and semantic save/reload.
- Add a 20-cycle resource soak and a continuous-edit session long enough to exercise maximum commit/save delays.
- Use cross-browser checks and a real composition keyboard before enabling DOM windowing broadly.
- Publish before/after distributions, build/revision/environment, content checks, unresolved limits, and rollback/fallback behavior. State clearly if a target was missed.

This plan does not require Tiptap, removal of features, a persisted-schema migration, a new global state system, or a large dependency. Any later need for those must follow measured evidence from the staged changes above.
