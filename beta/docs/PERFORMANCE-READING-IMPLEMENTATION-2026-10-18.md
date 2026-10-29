# Expanded-card reading/editing continuity: first implementation slice

18 October 2026. Local changes only; no deployment, commit, or GitHub push.

## Scope

Implements the first text/list/table slice of [the current UX performance plan](PERFORMANCE-UX-IMPLEMENTATION-PLAN.md). Ordinary expanded note cards now use complete reading content while their editing engine is absent. This is a correctness foundation, not completion of the performance plan or evidence of unlimited capacity.

## Changes

- `NoteBody` has one presentation owner; it no longer overlaps distinct document trees for a 180ms dissolve or dims reading content while editing is queued.
- Shared `BlockFrame`, `InlineTextSurface`, and `TableCellSurface` keep the same wrapper, typography, and cell geometry. An inert handle gutter preserves the active editor's text inset and wrapping without mounting block drag controls. List numbering and nested toggle layout use the editor's existing render tree.
- The expanded reading path has no fixed block prefix, table row/column cap, or nesting/column/gallery prefix cap. Existing compact previews for other node surfaces retain their old bounds. Expanded note cards retain their presentation at overview zoom instead of switching to a label.
- The note's vertical scroll host remains mounted. `ReadingLayoutBoundary` transfers native containment measurements, the visible anchor, and table horizontal scroll through an adapter handoff. This is transient view state; it does not create content changes or history entries.
- All reading content remains in the semantic DOM; this is not JavaScript table/document virtualization. Per-block content-visibility is withheld on the new reading path after a Firefox long-scroll stability failure. The editor retains its existing containment strategy; the handoff supplies measured block sizes. Snapshot work occurs on ownership transitions, not ordinary keystrokes, and its cost must still be profiled at larger capacities.
- A real text/cell mousedown prioritizes the requested editor, stops the original gesture becoming a canvas pan, and places a native caret without replaying input. A held selection gesture continues through native pointer movement. Explicit text-selection CSS avoids inheriting the canvas node's selection suppression in WebKit.
- Toggles support pointer/keyboard reading actions without mounting the full editor. Checkbox updates use an immutable document patch, including nested column ownership. The reading surface supports keyboard activation. Composition keeps its current editor mounted until composition ends.
- Expanded card bodies no longer use the transparent whole-card drag shield. Header/frame selection remains available; multi-selection retains its group-drag shield. The E2E selection helper now uses the header/frame for these cards rather than clicking through reading content.

## Test design and diagnostic corrections

The headed fixture includes 28 table rows, 10 columns, numbered-list restart, a nested toggle, rich text, and enough paragraphs to exercise top/middle/bottom card scrolling. A second fixture contains 500 multilingual blocks and repeated ownership handoffs. A real A → B → A scenario checks both drafts and the first card's anchor. Text/cell input requests an 8ms delay.

Assertions compare inner text geometry as well as block wrapper bounds. Visual review exposed a missing inactive handle gutter that wrapper-only checks had missed; both the presentation and assertions were corrected. Raw active/reading screenshots are retained.

Two rejected attempts must not be presented as product performance results:

- Firefox's traced long-document case exceeded the 60s test limit. Trace actions serialized the large DOM repeatedly; the isolated continuity case passed with DOM tracing disabled. This does not establish low-end-device performance.
- WebKit's `scrollIntoViewIfNeeded` could return before skipped text had actually reached the card viewport. The supposed before/after jump compared an offscreen initial paragraph against its later visible position. The corrected fixture positions the real card scroller and confirms the target is visible before measuring the anchor. Real wheel routing is checked independently. Focused WebKit and small-screen long-document checks passed afterward.

A later 24-case cohort passed 23 checks but exposed an unstable long-reader target on Firefox with per-block content-visibility. That reading optimization was withheld rather than weakening the click/anchor assertion. Its replacement passed the final cohort below.

The reader suite uses failure screenshots, raw card captures, selection diagnostics, and geometry/content assertions. Production latency measurements use a separate runner with no full DOM action tracing.

## Validation status

The final headed reading cohort passed **32/32 checks in 5.8 minutes**: eight scenarios each on Chromium, Firefox, WebKit, and the small-screen Chromium project. The A → B → A case deliberately uses a 1600 × 1000 viewport to keep both cards reachable; the other small-screen cases use 1024 × 640. [Raw captures and run status](../../output/audits/reading-continuity-2026-10-18/release-acceptance/).

The composition cases are synthetic event-order regressions, not a real OS IME session. They exposed and fixed both direct-mount retention and blur rewriting the composition DOM before confirmation, for ordinary text and table cells. They check the visible confirmation and canonical stored content after demotion.

Seven headed Chromium camera/table regressions passed: authoritative fit bounds, culled-card focus/save/reload, generated-map resize, superseding focus, complete expanded-card overview geometry/edges, delimiter-like table content, and automatic column widths. [Machine-readable run status](../../output/audits/reading-continuity-2026-10-18/camera-results.json).

Four additional headed empty-state checks passed across the same browser projects. They exposed and fixed a 4px empty-line height difference, reserved the same handle gutter for an empty document, and verified first-click typing in an empty card and table body cell. Empty table body cells no longer gain a spurious “Cell” label. [Focused run artifacts](../../output/audits/reading-continuity-2026-10-18/empty-states-final/).

Production measurements are recorded separately below.

TypeScript, whole-project ESLint plus focused final checks, editor core checks (21), Knip, and a production build passed during implementation. Existing large-chunk and Intelligent UI static/dynamic import warnings remain. The source is a locally validated first slice; it has not passed all performance-plan release gates.

## Frozen production measurement

The final artifact is `beta/node_modules/.cache/performance-reading-20261018-complete`, served locally on port 5186. Its 1,308-file aggregate SHA-256 is `fbc2d226bfda963a95ceb6deb07318f838ac213a8bd86f98311eed3081184548`. [Per-file manifest](../../output/audits/reading-continuity-2026-10-18/production-artifact-complete.json). This supersedes earlier unmeasured preflight artifacts.

Headed Chromium 151.0.7922.34, 1600 × 1000, requested 8ms key delay, isolated IndexedDB contexts, 160 research cards and three heavy workloads. Each normal workload has three runs × 99 inputs = **297 input samples**. The metric is input to the second animation-frame callback, a rendering proxy rather than INP. Optional off-origin telemetry is stubbed; real application assets and storage use the production origin. No concurrent headed QA ran during measurement.

| Expanded-card workload | Run p95, ms | Run max, ms | Median run p95, ms |
| --- | --- | --- | --- |
| 1,211-block dossier | 38.7 / 32.2 / 26.1 | 51.8 / 53.6 / 37.5 | 32.2 |
| 968-cell table | 38.6 / 35.7 / 41.1 | 55.4 / 43.3 / 65.0 | 38.6 |
| Nested columns | 29.4 / 28.7 / 32.4 | 58.0 / 95.0 / 68.8 | 29.4 |

All nine normal run p95s met the local ≤50ms desktop typing target. Every run remained visible without visibility changes, saved its edit, and verified the same semantic content and visible marker after UI reload. No application errors or failed network requests were recorded. [Raw results](../../output/audits/production-editor/2026-10-18T21-05-42-146Z-expanded-reading-complete-normal/results.json); adjacent files retain individual input/frame/long-task samples.

This does **not** establish a causal percentage improvement over older builds: no paired before/after run was performed in this cohort. First-load/navigation/focus/click setup (`openMs`, not a pure click-activation metric) still took **15.7–22.9 seconds**. Retained DOM during typing was approximately **15,370–22,808 elements**; columns mounted three nested editor roots inside the one active card. Long-task peaks reached 62ms. Full reading content remains mounted, so this slice does not solve loading, table virtualization, retained memory, or all-visible canvas compositing. The earlier 919-card pan results are historical and were not remeasured here.

The separate CPU ×4 diagnostic used **one run / 99 inputs per workload**, below the plan's repeated-run/sample acceptance gate. It is stress evidence, not a CPU ×4 release pass:

| Expanded-card workload | p95, ms | Max, ms | Setup, seconds |
| --- | --- | --- | --- |
| Dossier | 232.6 | 424.4 | 112.4 |
| Table | 205.2 | 241.7 | 102.1 |
| Columns | 123.5 | 254.9 | 116.4 |

All three missed the ≤100ms target. All remained foreground-visible, saved, and verified the edit after reload; no application errors or failed network requests were recorded. [Raw CPU ×4 results](../../output/audits/production-editor/2026-10-18T21-11-39-548Z-expanded-reading-complete-cpu4/results.json). Keep these costs visible when deciding rollout. Next work should profile startup and compositor/update costs against the complete-content fixture, then bound document updates and table rendering in stages C–E. Do not re-enable the rejected reading containment strategy without cross-browser continuity evidence, or claim complete media parity from the text/list/table tests.

## Remaining work

- Shared presentation and full interaction parity for every special block family, including complex media, gallery/file viewers, embeds, Intelligent UI, containers, and columns. Removing their prefix caps alone does not establish complete behavior parity.
- The separate fused/standalone map-node reading path, retained view sessions across culling/navigation, and real OS IME/accessibility/touch checks.
- Table row/column virtualization, document-scoped subscriptions, bounded loading/history/cache policy, and measured compositor/spatial-index/worker improvements.
- Current long documents still retain their semantic DOM and tables still mount all rows. No new library was installed; no data schema or global store migration was performed.

Do not describe this slice as a completed production performance fix. Preserve the complete-content UX while using the next measurements to choose the next optimization.
