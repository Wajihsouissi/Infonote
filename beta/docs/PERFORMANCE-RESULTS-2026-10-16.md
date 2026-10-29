# Heavy editor implementation and validation

16 October 2026 implementation record. The newer [expanded-card production report](PERFORMANCE-RESULTS-2026-10-18.md) contains the accepted timing cohorts, stress results, and remaining budget failures.

The existing editor and mind map remain. The changes reduce repeated React work, stabilize native table layout during editing, keep inactive canvas cards passive, and preserve complete saved documents. This is a local working-tree change, with no release commit or deployment.

## Enabled changes

- **Incremental editor branches.** A per-editor render-tree builder retains unchanged branch identities. Memoized branch components stop before creating their leaf JSX; structural edits rebuild the correct hierarchy/list numbering. Content-only edits retain the focused DOM element.
- **Table hot path.** Normalize immutable incoming rows once; copy only the edited row. During an automatic table's editing session, temporarily hold its measured column widths with fixed layout. Restore automatic sizing after leaving the session, without saving new column widths. Defer restoration through an outside pointer gesture so the target cannot move between mousedown and click. Explicit resize still saves the user's widths.
- **Canonical table content.** The optional `tableRowsVersion: 1` marker distinguishes edited cell data from legacy Markdown delimiter rows. Literal `---` cells survive remount, reload, and external plain-text/HTML clipboard rendering.
- **Large clipboard payloads.** Base64 encoding uses bounded byte chunks instead of spreading an entire document into one function call. A 2,000-block multilingual round trip now avoids the previous engine argument-limit stack overflow.
- **Long-document native rendering.** At 200+ blocks, non-minimal editors defer offscreen text subtrees with CSS `content-visibility: auto`. Every editable remains in the DOM. Tables, media, nested containers, and their controls retain their normal layout. Hover, focus, selected blocks, and print use complete rendering. This is browser rendering containment, not JavaScript DOM virtualization. [Browser behavior reference](https://web.dev/articles/content-visibility).
- **Canvas editor ownership.** Block/fused nodes now use scheduled editor eligibility and bounded static previews. Unselected/overview nodes do not mount editors. Foreground panes suppress background canvas editors. Empty-media picking and media opening retain explicit actions.
- **Overview and fitting.** Overview uses a lightweight snippet with zoom hysteresis. Fit uses authoritative current-canvas bounds, including culled nodes, with a 1% floor. Keyboard and nested navigation share these rules. On 17 October, the MiniMap and floating canvas control buttons were removed at the user's request, together with their component/styles. Keyboard navigation and the document mind map remain enabled.
- **Graph/save work.** Reuse indexes per immutable graph revision and identity-first document comparisons. Parent sync has trailing/max-wait timers and an explicit drain before persistence snapshots, including queued ancestors.
- **Pointer/keyboard fixes.** The card toolbar's hover bridge no longer overlaps Add cover at zoom. Selected cards keep their toolbar reachable. Cover-picker Escape and keyboard focus handling are explicit. Standalone table Escape consumes its event.

The native text deferral has a temporary build-time fallback: set `VITE_EDITOR_DEFER_OFFSCREEN=false` and restart Vite/rebuild. Engines without CSS support keep complete rendering automatically. Retain this fallback until manual OS composition and assistive-technology validation completes; remove the rollout switch only after those gates pass.

## Measurement method and provenance

Production measurements use the real built app, headed Chromium at 1600×1000, isolated IndexedDB workspaces, and requested 8ms/key typing. Each workload retains the 160-card research fixture. The three workloads are the 1,211-block dossier, 968-cell table, and two long column documents. The focused production runner excludes source photos to separate text/layout work; the complete headed case includes two real cached source photos across 50 image blocks.

The timing is **input event to second animation frame**, a rendering proxy, not official INP. Report per-run distributions and the median of three per-run p95 values. Baseline raw samples were not retained, so do not label the comparison as a pooled p95. Typing wall time includes automation/protocol overhead and is reported separately.

Clean baseline selections:

- `output/audits/production-editor/2026-10-16T19-43-40-061Z-before`, run 2 only. Earlier repetitions overlapped checks and are excluded.
- `output/audits/production-editor/2026-10-16T19-50-55-472Z-before-quiet`, both repetitions.

Their median p95 values are 104.3ms dossier, 230.0ms table, and 76.8ms columns. Baseline build fingerprint and raw input samples were not captured; these are observational local comparisons, not a reproducible release-to-release performance guarantee.

Concurrent unrelated Intelligent UI edits appeared in the shared workspace. The production artifact and development source were snapshotted so subsequent edits/HMR/builds cannot change a running study. See `output/audits/production-editor/release-artifact.json` for artifact hashes. The development snapshot can include unrelated work present when copied; the study exercises the existing block types. Later workspace changes are outside this validation.

The first post-change cohorts remain diagnostic evidence. Some phases overlapped snapshot creation; one phase delivered only 66/99 input samples with roughly 1Hz animation frames. It is an incomplete foreground measurement and is excluded from the final comparison. The runner now requires foreground visibility/focus, all 99 input callbacks, and no hidden-state transition during capture. It also restores a minimized benchmark window and records browser version, CPU rate, errors, network failures, and raw samples.

## Correctness and resource evidence already completed

- `npm run check` passed lint, 20 editor core checks, TypeScript/production build, and knip on the checked working-tree state. Subsequent harness-only edits are checked separately; unrelated concurrent source changes are not covered by that earlier result.
- Core checks cover immutable render-tree reuse, structural/list changes, pending/incoming edits and deletions, toggle visibility, canonical tables, large multilingual clipboard payloads, and external table clipboard formats.
- Headed Chromium covered editor ownership/demotion, fullscreen ownership, cover pointer hits at 30/50/100/200%, fitting culled cards, literal table-cell reload, keyboard navigation, formatting, toggles and selection.
- Headed Firefox and WebKit passed the focused long-document and table contracts in an isolated run: all 1,500 editables retained; distant editing and insertion; original editable identity retained; composition-confirmation guard; native find; print; complete 1,501-block copy; table width stability; keyboard and pointer row growth; restoration without persisted widths.
- Performance-fixture DOM trace snapshots are disabled: forcing the complete DOM snapshot interfered with deferred rendering and stalled Firefox. Assertions and failure screenshots remain. The cross-browser run is `beta/node_modules/.cache/deferred-cross-isolated.log` (4 passed). Earlier failed harness attempts are retained in adjacent logs, not counted as passes.
- Two resource soaks completed: an earlier 20-cycle dossier open/close run, and a focused 20-cycle table open/focus/close run after 3 warmups. In the table run, retained DOM nodes were **10,864 → 10,864**, listeners **1,064 → 1,064**, and post-GC JS heap **18.64 → 19.15 MB**. This establishes no accumulating DOM/listener retention over those cycles; it does not prove a long editing/history session leak-free.

The focused table soak is in `output/audits/production-editor/2026-10-16T21-18-09-556Z-final-deferred/results.json`. Its typing phases are not the final clean performance cohort. The `skippedBlocks` counter in that earlier cohort checked wrapper boxes rather than descendants and is not evidence about actual skipped content; the runner has been corrected.

## Limits and remaining gates

No JavaScript block/row windowing is enabled. Document data, editable nodes, and table rows still consume memory proportional to total content. Native containment reduces rendering work, not the number of DOM nodes. The 5,000-block/20,000-cell scaling gate and an editing/history soak remain separate work if measured limits require windowing.

Automated composition guards are covered; a real OS IME and assistive-technology session are not yet covered. Large graph hydration/generation and all-visible overview can still create long tasks. Media thumbnail generation, worker/chunked graph planning, and dirty-node persistence tracking have not been introduced without separate cost attribution.

Current production distributions, CPU stress results, and heavy-case outcomes are recorded in the [18 October validation report](PERFORMANCE-RESULTS-2026-10-18.md). The entire performance plan is not achieved: typing under CPU stress and large-map panning still miss their targets.
