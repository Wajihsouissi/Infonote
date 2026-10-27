# Expanded-card and canvas production validation

18 October 2026 (Europe/Berlin). Local working-tree changes; no deployment or GitHub push.

The primary surface is the **expanded card inside the canvas**. Fullscreen measurements are excluded from the results below. Correctness has improved, but the heavy-workspace performance targets are **not yet met**.

## Workload and measurement

Headed Chromium, 1600 × 1000, isolated browser contexts, the actual production application, and the existing format-3 IndexedDB schema. The production development-store hook must be absent. Bulk fixture creation occurs before application boot. Setup uses the application's `focusCanvasNodes` command; measured typing, wheel scrolling, mouse/keyboard panning, row growth, and nested navigation use actual browser input.

The research fixture contains 160 cards, 13,419 blocks, 6,072 table cells, a 1,211-block dossier, long columns, and three nested canvas levels. The canvas study also uses two cached Wikimedia photographs across 50 image blocks, and verifies that a displayed cover has decoded. The typing cohort excludes photographs to isolate editor/layout cost. The generated workspace contains 919 cards and 882 edges, with 759 cards on the dossier map.

Typing uses a requested 8ms key delay and 99 characters per sample. Browser automation overhead means this does not establish a sustained human typing rate. Input-to-second-rAF is a rendering continuity proxy, **not official INP**. All accepted typing runs require all 99 callbacks, foreground visibility/focus, no hidden transition during capture, and persisted text restored in the actual editor after reload. Raw samples remain beside each report.

Builds are frozen in separate output directories. Build A precedes the edge cleanup; build B includes it; build C adds authoritative offscreen-node focusing; build D also fixes generated-map resize observation. Unrelated Intelligent UI work also exists in the shared workspace. Timing differences are local observations, not an isolated causal estimate or a release guarantee.

| Build | Fingerprint manifest | Preview |
| --- | --- | --- |
| A | [17 October baseline artifact](../../output/audits/production-editor/release-artifact-2026-10-17.json) | 5180 |
| B | [Edge cleanup artifact](../../output/audits/production-editor/release-artifact-2026-10-17-edges.json) | 5181 |
| C | [Offscreen focus artifact](../../output/audits/production-editor/release-artifact-2026-10-18-focus.json) | 5182 |
| D | [Navigation fixes artifact](../../output/audits/production-editor/release-artifact-2026-10-18-navigation.json) | 5183 |
| Current | [Camera ownership artifact](../../output/audits/production-editor/release-artifact-2026-10-18-camera-final.json) | 5185 |

Report directories use UTC timestamps, including runs after midnight Berlin time.

## Expanded-card typing

Build B: three independent runs per workload, 297 input samples per workload, nine successful save/reload checks, no recorded browser errors or failed requests. One foreground document owns the live editor; columns legitimately have one root editor and two child editors.

| Workload | Per-run p95 (ms) | Median of run p95 (ms) | Pooled p95 (ms) | Target |
| --- | --- | --- | --- | --- |
| 1,211-block dossier | 64.8 / 55.4 / 45.0 | 55.4 | 52.9 | ≤50ms: missed |
| 968-cell table | 86.9 / 57.5 / 60.6 | 60.6 | 68.8 | ≤50ms: missed |
| Long columns | 44.2 / 42.7 / 67.1 | 44.2 | 44.2 | Variable; one run missed |

[Build B typing evidence](../../output/audits/production-editor/2026-10-17T19-35-56-676Z-expanded-cards-edge-cleanup/results.json). The dossier's largest recorded typing task was 226ms in its first run, so the settled-task gate is not satisfied either. Edge cleanup did not establish faster typing: build A pooled p95 values were 50.6 / 48.6 / 29.9ms respectively. Preserve the variability instead of selecting the fastest cohort.

A separate scrolled dossier check on build A passed at p95 39.7ms, with scrollTop exactly 2100 before/after typing and an unchanged paragraph screen position. [Scrolled-card evidence](../../output/audits/production-editor/2026-10-17T19-17-55-693Z-expanded-scrolled/results.json).

Build A's completed 4× CPU-emulation cohort passed save/reload but missed the ≤100ms stress target in every workload: dossier **211.1ms**, table **313.6ms**, columns **138.7ms**. Maximum typing tasks were 290 / 327 / 129ms. [CPU stress evidence](../../output/audits/production-editor/2026-10-17T19-29-07-079Z-expanded-cpu4-verified/results.json). CPU emulation is not a physical low-end-device test. Later build-B cold-start attempts failed before collecting typing samples and are excluded, not counted as successful stress runs.

The **current candidate's isolated 4× CPU cohort** completed all three cases, with 99 input callbacks per case, successful persistence and actual editor reload, and no recorded browser errors or failed requests. This is one stress run per workload, not a three-run distribution or a physical-device guarantee.

| Current CPU ×4 workload | Input-to-second-rAF p95 (ms) | Largest typing task (ms) | ≤100ms target |
| --- | --- | --- | --- |
| Dossier | 144.8 | 303 | Missed |
| Table | 210.0 | 225 | Missed |
| Columns | 121.1 | 110 | Missed |

[Current isolated CPU stress evidence](../../output/audits/production-editor/2026-10-17T23-08-17-577Z-expanded-camera-isolated-cpu4/results.json). These results do not establish a causal percentage improvement over build A: the artifacts, bootstrap readiness, network isolation, and shared workspace state differ.

## Canvas changes and defects

- Inactive cards and generated map nodes retain no live block editors. Distant overview nodes use a small representation while keeping geometry, handles, selection, and the complete saved graph.
- `CenteredEdge` now shares its CSS, creates only requested marker definitions, creates handle gradients only when needed, and omits inactive glow paths. Handle gradient IDs are unique. Stroke hit testing replaces duplicated per-edge global overrides.
- A genuine navigation defect was exposed when the study tried to focus a root card culled from the DOM. React Flow's rendered-node `fitView` could not frame it. The focus shortcut now uses authoritative saved-node bounds, restricted to the current parent canvas. The same helper serves keyboard focus, armed-click focus, and the application's focus command.
- The new headed regression places a card 40,000 × 30,000 canvas units away, confirms it is culled, focuses it, edits it with a single live editor, and checks reload persistence. It passed. Existing overview/new-card editing and large-board fit checks passed too. The first fit-test attempt timed out during a cold Vite page load; its rerun passed. These are development correctness checks, separate from production timing.
- The build-C study exposed a second real defect: the generated-map `ResizeObserver` treated its first notification after re-observing revealed chapters as a genuine canvas resize. Its automatic fit could override deliberate focus and return the map to overview, leaving no active editor. The observer now establishes an initial size and reframes only after a subsequent size change. A nested-map regression repeatedly focuses a distant leaf and a generated chapter, waits beyond the reframe delay, and verifies that the camera/editor remain focused. All four focused headed regressions passed together; lint, TypeScript, and the production build passed.
- Build D subsequently passed leaf editing and parent synchronization, then exposed a return-navigation race: deferred home centering could override a newer focus command. Return jobs now cancel their animation-frame callbacks on cleanup, check their parent/target before moving the camera, and yield to explicit focus. Home jumps from deeper levels resolve the ancestor on the destination canvas through the cached node index, with a cycle guard. Initial fit and return centering have one owner; React Flow's independent on-load fit is removed. The regression exercises immediate home-to-focus navigation and ordinary home return from multiple levels.

Before/after edge-cleanup observations from builds A and B:

| Generated dossier map | A | B |
| --- | --- | --- |
| DOM elements after fit | 18,688 | 9,940 |
| Live editors during pan | 0 | 0 |
| Keyboard pan p95, three gestures (ms) | 566.5 / 558.3 / 575.0 | 341.7 / 349.9 / 391.6 |
| Middle-mouse pan p95, three gestures (ms) | 808.0 / 775.0 / 841.5 | 433.1 / 491.6 / 458.3 |

The DOM count fell about 47%; the remaining pan intervals are still far above the ≤33.3ms target. Build B passed expanded dossier scrolling, real table row growth, map generation, panning/zooming, and leaf-to-parent content synchronization, then failed at the culled-card focus defect. Its full-workspace reload phase was therefore **not executed**. Build A completed the earlier 919-card/882-edge semantic save/reload check. [Build A canvas evidence](../../output/audits/production-canvas/2026-10-17T19-24-43-971Z/results.json), [build B canvas evidence](../../output/audits/production-canvas/2026-10-17T19-41-07-912Z/results.json).

Build C passed scrolling, table growth, map generation and all pan/zoom gestures, then failed at the resize-observer focus defect before leaf editing. Its later navigation/reload phases were not executed. [Build C failure evidence](../../output/audits/production-canvas/2026-10-17T22-36-23-535Z/results.json). Build D passed those phases and leaf synchronization, then failed at the queued-return race; its complete saved failure graph is retained. [Build D failure evidence](../../output/audits/production-canvas/2026-10-17T22-43-23-543Z/results.json).

### Current candidate: complete scenario passed

[Current production canvas evidence](../../output/audits/production-canvas/2026-10-17T22-57-58-092Z/results.json). All five focused headed camera regressions passed together. The final acceptance run additionally verifies automatic fit after an empty canvas receives its graph and that genuine resizing still reframes a generated map: [headed acceptance log](../../output/audits/production-canvas/2026-10-17T22-57-58-092Z/camera-acceptance-headed.log), five passed in 1.2 minutes. Targeted lint, TypeScript, and the production build passed. The build still reports large existing bundle chunks; that warning is not resolved by these navigation changes.

- The scrolled expanded dossier retained scrollTop 2100 and exactly the same paragraph screen position while typing; its real cover decoded.
- Normal table-cell editing, Tab navigation, and a normal Add row click passed: 968 → 976 editable cells and 122 saved rows.
- The dossier generated 759 map cards, with zero live editors in overview. The whole generation/open/fit phase took 10.5 seconds; this includes layout, mounting, and persistence and is not pure graph-computation time.
- Editing a map leaf updated the parent dossier and retained all 1,211 blocks. Three-level navigation completed in 5.4 seconds.
- All **919 cards and 882 edges** restored with equal canonical content, ownership, and edge data after reload. The restored expanded dossier displayed the edited leaf text.

| Current candidate gesture | Per-run frame-interval p95 (ms) | Median of run p95 (ms) | Live editors |
| --- | --- | --- | --- |
| Keyboard pan | 250.1 / 308.3 / 283.1 | 283.1 | 0 |
| Middle-mouse pan | 357.9 / 375.1 / 400.0 | 375.1 | 0 |

The generated-map DOM count remains 9,940 after fit and 8,940 after mouse panning/culling. The ≤33.3ms pan target is still missed. These are unprofiled foreground runs; the later native pan trace is separate diagnostic evidence and is not included in this table.

### Native pan attribution

[Native trace summary](../../output/audits/production-canvas/2026-10-17T22-57-58-092Z/diagnostic-pan-summary.json), with the raw 27.8MB trace beside it. This diagnostic was recorded after the complete unprofiled scenario and save/reload checks. It changes timing and is excluded from the frame cohorts.

| Renderer-main complete-event category | Self time (ms) | Largest inclusive event (ms) |
| --- | --- | --- |
| PaintArtifactCompositor::Update | 7,715.7 | 259.9 |
| Document::recalcStyle | 1,266.3 | 147.6 |
| Paint | 985.3 | 46.5 |
| FunctionCall | 423.2 | 53.6 |

The summary subtracts nested complete events; asynchronous and B/E events are excluded. No crossing intervals were found in the summarized renderer thread. Inclusive parent/child durations must not be added together.

The browser reported GPU compositing and rasterization enabled. Its final layer snapshot contained 457 layers, 450 drawing content; 189 had recorded width × height above one million. This supports investigating paint-artifact/layer consolidation rather than assuming the residual delay is JavaScript or mounted editors. It does not identify the precise CSS trigger by itself. Controlled layer-promotion/painting probes are the next gate before introducing another renderer change.

Cold CPU setup also exposed a harness readiness error: the runner accepted the first transient editor DOM node during camera initialization. Setup now requires a visibly stable editor for 250ms within the existing bounded timeout, with bootstrap retries included in open time. Failed attempts remain recorded. The first completed current-candidate stress run passed all three save/reload checks but recorded one failed external telemetry DNS request; it is retained as diagnostic evidence, not the clean stress cohort. Subsequent runs isolate optional off-origin telemetry/auth requests, as the main canvas study already does.

## Resource retention

A focused expanded-table soak on build A used three warmups followed by 20 open/focus/deselect cycles. Post-GC retained DOM nodes were 2,022 → 2,055; listeners 326 → 328. At cycles 5/10/15/20, DOM counts were 2,056 / 2,055 / 2,055 / 2,055 and listener counts were always 328. Heap was 12.21 → 12.90MiB. This supports bounded DOM/listener retention in this scenario, not an unlimited editing/history leak guarantee. The soak did not make edits during its cycles. [Soak evidence](../../output/audits/production-editor/2026-10-17T19-19-55-349Z-expanded-table-soak/results.json).

## Remaining production gates

1. Isolate the expensive layer/paint-artifact construction with controlled CSS/compositor probes, then reduce overview layer count and repeated painting. Preserve overview geometry, edge selection/reconnection, and keyboard accessibility. The existing measurements do not isolate MiniMap removal; no defensible percentage benefit can be assigned to it alone.
2. Reduce active-editor/table cost under CPU stress. Browser containment retains all editables and rows; it does not bound DOM memory. Block/row windowing needs explicit caret, selection, copy, browser find, print, accessibility, and IME acceptance checks before shipping.
3. Cover 5,000 mixed blocks, 20,000 table cells, large paste/reorder/resize operations, and a long editing/undo/history soak. The current specimen and mount/unmount soak do not establish those limits.
4. Real OS IME and assistive-technology sessions remain unverified. Prior focused Firefox/WebKit correctness checks are documented in the [implementation report](PERFORMANCE-RESULTS-2026-10-16.md).

The MiniMap and floating canvas controls remain removed. Mind-map generation, nested canvases, keyboard fit, pan, and zoom remain enabled.
