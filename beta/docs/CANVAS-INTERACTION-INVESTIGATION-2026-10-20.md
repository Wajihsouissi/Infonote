# Canvas interaction investigation — 20 October 2026

**Status: verified repairs, but the reported freeze remains open.** The owner
reported local INP of 1,224 ms, then 7,328 ms, and confirmed that a fresh reload
still freezes after the agent's browser tests were stopped. Synthetic benchmark
improvements do not establish that the owner's canvas is fixed or production
performance acceptance has passed.

Follow-up: the owner later confirmed that incognito contains a new/example
canvas. The [local storage review and repairs](LOCAL-STORAGE-REVIEW-2026-10-20.md)
record the resulting persistence/cache investigation and its measured limits.

## Confirmed repairs

`useCanvasEditorEligibility` subscribed every card to camera/drag streaming. A
selected live editor was replaced with a complete reader at gesture start and
rebuilt after settling. Eight synthetic drags caused **16 editor host changes**
in each baseline run. CPU profiling attributed approximately 2 seconds of self
time to `ReadingLayoutBoundary.componentDidUpdate`, including the geometry
snapshots used to preserve the reading anchor across these replacements.

The selected editor now keeps its actual DOM during gestures. Sole editing
ownership and overview thresholds remain in force. The existing shared commit
queue still parks **new** editor and reading mounts during streaming. The unused
streaming React subscription was removed; overview notification remains.

Continuous primary-button shadow and conic-gradient animations also consumed
rendering time. The shared streaming flag now reflects one
`html[data-canvas-streaming]` attribute on state changes. CSS pauses these idle
animations during movement and resumes them afterwards without hiding the
controls. Window release/blur and viewport teardown clear the gate.

The application CSS that hid React Flow's attribution was removed. Its native
badge is visible again. This addresses that specific application warning.

## Console messages

- The React DevTools download message is informational.
- The supplied failed imports and manifest denials originate from
  `chrome-extension://` URLs. They identify extension resources, not application
  module imports. Their contribution to the reported freeze has **not** been
  established; no extension or user browser setting was changed.
- Restoring React Flow's attribution does not establish a performance fix.

## Measurements and limits

Evidence is under `output/audits/canvas-interactions-2026-10-20/` at the repository
root. `measure.mjs` launches an owned production preview on `127.0.0.1:5192` and
fresh, isolated Chromium contexts. It seeds a synthetic local workspace with 160
notes, six nearby expanded notes with 120 paragraphs each, and a 121 × 8 table
in the first note. Remote HTTP requests are stubbed. It does not read the owner's
browser profile or saved canvas. Each normal series has three runs, with eight
pans and eight header drags per run. Timed series ran without concurrent agent
builds or tests, but other machine workload was not controlled.

Values below are medians across the three per-run results. All durations are ms.
Event Timing p95 and the two-animation-frame input proxy are diagnostics; neither
is an official INP measurement or comparable directly to the owner's screenshot.

| Metric | Pan before | Pan repaired | Drag before | Drag repaired |
| --- | ---: | ---: | ---: | ---: |
| Editor host replacements per eight gestures | 12 | 0 | 16 | 0 |
| Main thread task time over the phase | 7,813 | 6,031 | 8,124 | 5,867 |
| Script time over the phase | 511 | 95 | 833 | 290 |
| Style recalculation time over the phase | 2,141 | 2,776 | 2,564 | 2,334 |
| Layout time over the phase | 216 | 0.8 | 298 | 6.7 |
| Input → second frame proxy, p95 | 134 | 126 | 285 | 190 |
| Event Timing duration, p95 | 200 | 208 | 320 | 280 |
| Frame interval, p95 | 83 | 100 | 167 | 117 |

The script/layout and drag improvements are real in this fixture. **Pan tail
latency did not improve reliably**, style work remains substantial, and the
owner's latest report is worse than this fixture. These results are not a claim
of smooth 60 fps movement or a complete fix.

`before/` is the initial source snapshot's benchmark; `after/` contains the
editor lifecycle repair alone; `repaired/` contains the retained repairs above.
`final/` is an intermediate, rejected selector candidate, despite its historical
directory name; it is **not the delivered implementation**.

Native invalidation profiling found large style updates and broad class/attribute
selectors. A semantic-selector candidate, CSSOM selector removal, pointer-event
overrides, a temporary pointer shield, round-corner substitution and grain
removal did not yield a reliable overall improvement. Those changes were not
retained. The four source files touched by the selector experiment were restored
to their saved pre-experiment contents; copies remain in `rejected-candidate/`.
Card appearance, content completeness and native reading behavior were preserved.

Profiling runs are separate from timing runs. The detailed native trace is
approximately 313 MB and is an optional audit artifact, not a production asset.
An initial whole-file parser exceeded its explicit Node heap cap; the subsequent
bounded streaming parser completed. This was a diagnostic process failure, not
an application crash.

## Verification

- Production TypeScript/Vite build passed (`build-repaired.log`). Existing chunk
  size and mixed static/dynamic import notices remain.
- ESLint and Knip completed without reported findings (`lint-repaired.log`,
  `knip-repaired.log`).
- 25 editor core checks and 11 reading queue/budget checks passed.
- The earlier lifecycle implementation passed all 22 targeted browser cases:
  block transfer, camera stability, gesture continuity and complete reading/IME.
- Final source added pause/resume and blur-release assertions to three gesture
  regression cases. These cases completed without reported failures in the
  subsequent browser run, as did the preceding block-transfer/camera cases.
- The planned 34-case final browser run was **intentionally terminated**, not
  passed: memory pressure was observed before its heavier cases finished. Do not
  quote 34 passing tests. That suite was not resumed. The owner subsequently
  requested the single bounded CLI capture described below.
- Static UI detector: four pre-existing bounce-easing warnings in the touched
  global styles; no visual redesign was attempted. A desktop production fixture
  screenshot was inspected. Responsive visual acceptance was not established.

The new gesture cases fail against the original editor host replacement
behavior (`continuity-before.log`). They check real element identity during and
after pan/drag, saved content, movement/undo, animation pause/resume, blur cleanup
and visible native attribution.

## Machine pressure and remaining evidence

During the final test run, Windows reported **0.88 GB available out of 15.41 GB**.
The agent stopped only its verified Playwright process tree and owned test server
on 5188; available memory then rose to approximately **2.17 GB**. The owner's
browser and the development server on localhost:5174 were left running. Earlier
timing runs were already complete. This observation makes machine pressure a
relevant factor, but the owner's continued freeze after reload shows that it is
not a sufficient explanation or fix.

Next required evidence is a short Chrome Performance recording of the **actual
slow pan/drag after a fresh reload**, with agent browser tests stopped. Inspect
the slow interaction's input delay, handler time, presentation delay, main-thread
call stack, DOM size and memory. The live INP number and console messages alone
do not identify the 7-second blocking task. The owner's note count and presence
of large tables, PDFs or Intelligent UI remain requested context.

The existing user tab/profile was not inspected: browser access was denied in
the earlier investigation. No alternative CDP or profile-storage access was
used. A recording supplied by the owner can be analyzed as explicit diagnostic
input.

For that owner-supplied recording: open Performance, turn off Screenshots to
reduce capture overhead, click Record, reproduce one slow pan or drag, stop,
then choose Download → Save trace. Either JSON or its gzip export is usable.
See Chrome's [recording reference](https://developer.chrome.com/docs/devtools/performance/reference)
and [trace export instructions](https://developer.chrome.com/docs/devtools/performance/save-trace).

Further optimizations must be justified by that recording and preserve complete
reading, selection, IME, content persistence, transfer and undo contracts. Avoid
replacing this evidence gap with further broad styling changes or increasingly
large synthetic scenes on the owner's memory-constrained machine.

## Owner-requested Playwright CLI capture

The owner then explicitly requested that the agent obtain a trace using the
Playwright CLI. The existing project CLI was used directly; no extra CLI package
or browser extension was installed:

```powershell
# From beta/
node node_modules/playwright/cli.js test --config=../output/audits/canvas-interactions-2026-10-20/capture.config.mjs
```

The CLI starts an owned development server on `127.0.0.1:5193`, one headless
Chromium context, and one bounded test. Its synthetic fixture contains three
expanded notes with 80 paragraphs each and one 48 × 6 table, with 2,887 elements
at the ready marker. It records startup, two passive pans, two selected pans and
two note drags, plus the intervening header selection. Browser DOM tracing and
screenshots during recording are disabled; one final screenshot is saved. Trace
export streams to disk with a 48 MB cap. The renderer has a 384 MB JavaScript
heap cap. Test and suite timeouts remain bounded; retries are disabled.

The first capture completed its application interactions and saved a CPU profile,
but its broad native trace categories exceeded the export cap. Its partial JSON
under `cli-capture/` is **not a usable complete trace**. A subsequent capture
restricted to `devtools.timeline` passed in **15.4 seconds** and saved a complete,
parsed trace under `cli-capture-bounded/`:

- `pan-drag.trace.json.gz`: approximately 687 KB compressed; approximately 9.6 MB
  uncompressed. Importable into Chrome Performance.
- `cpu.cpuprofile`: the corresponding JavaScript CPU profile.
- `report.json`: raw Event Timing entries, long tasks, phase metrics and console.
- `analysis.json`: renderer-native event totals, sampled JavaScript self times
  and the explicitly classified interaction summaries.
- `canvas.png`: inspected screenshot of the isolated scene.

The raw successful capture initially left the setup header click labeled with
the preceding passive-pan phase. The analyzer explicitly reclassifies the third
interaction after the two passive pans as selection setup, preserving the raw
record. The harness now labels future selection setup separately. Its ready
marker includes a fixed wait and camera setup and is not a first usable frame
metric.

| Captured interaction | Maximum Event Timing duration |
| --- | ---: |
| Two passive pans | 80 ms |
| Two selected pans | 48 ms |
| Two selected note drags | 120 ms |
| Setup header selection | 176 ms |

These are diagnostic Event Timing durations, **not official INP**. The maximum
observed long task was 187 ms during header-selection setup. The recorded console
had no errors or warnings. Native main-renderer tracing still showed substantial
style recalculation and layer work: approximately 1,148 ms cumulative
`UpdateLayoutTree` and 559 ms `Layerize` over the whole recording. Those inclusive
native totals include startup/setup and must not be added to nested event totals
or interpreted as one input delay.

**The owner's 7,328 ms freeze was not reproduced.** This is a recording of the
current development application with synthetic data, not the denied user tab or
its saved workspace. The successful CLI capture establishes that a trace can be
obtained autonomously in an isolated session; it does not establish the cause of
the owner's freeze. A path to an existing owner-provided backup/export was
requested so the same data can be reproduced without accessing the protected
browser profile or requiring the owner to record DevTools manually.

The CLI closed its browser and test server after finishing. Port 5193 was no
longer listening; the original development server on 5174 remained running.
Windows reported approximately 4.57 GB free after cleanup. No production source
was changed as a result of this capture.

## Reproduce the isolated series when machine capacity permits

From the repository root, build the production app first, then run:

```powershell
node output/audits/canvas-interactions-2026-10-20/measure.mjs another-label
```

From `beta/`, the focused browser checks are:

```powershell
npx playwright test --project=core canvas-gesture-continuity camera-stability block-transfer editor-reading --workers=1
```

The reference on React Flow rendering costs is its
[official performance guide](https://reactflow.dev/learn/advanced-use/performance).
