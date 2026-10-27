# Localhost canvas freeze investigation — 19 October 2026

Status: original investigation retained below. The owner subsequently approved repairs; see the [implemented startup/recovery repair and verification](CANVAS-STARTUP-REPAIR-2026-10-19.md). The exact cause of the reported real-session hang has not been established. The investigation itself changed no application source, saved workspace, browser profile or operating-system setting.

The owner reports that opening `/canvas` immediately makes the application unusable, before any editing. They report the problem also occurs in Chrome and may predate the file organization.

## Evidence and limits

- Windows has an `Application Hang` event for `ChatGPT.exe` at 15:06:50 Europe/Berlin. This confirms a host application hang, not which page or code path caused it. The sampled application-error events did not establish a Chrome crash attributable to this app.
- The initial lightweight sample showed approximately 3.7 GB free of 15.8 GB physical RAM and low sampled CPU in the listed browser/Node processes. A later snapshot showed approximately 3.0 GB free and 65% committed-memory utilization. Neither sample was captured during a reproduced freeze, so neither rules out a temporary memory/CPU/GPU spike.
- Two Vite processes were listening on 5174 and 5175. Their mere presence is not evidence of the freeze, and neither was terminated. Other Node processes were not assumed to belong to this task.
- Browser policy denied observation of the existing localhost tab. The investigation did not work around that denial through another browser, CDP, profile storage or an HTTP copy of the page. There is no current-page console, renderer trace, workspace-size measurement or GPU measurement from the affected session.
- Existing performance reports already describe slow large-scene opening and expensive compositor/style work. Those are historical measurements from different scenarios, not a new attribution of this hang.

## Finding 1: complete expanded readers build the whole document

Evidence: [NoteBody](../src/features/card/ui/content/NoteBody.tsx:18) always requests a complete reader while its live editor is absent. [StaticBlocks](../src/features/card/ui/content/NoteBodyPreview.tsx:317) builds the complete tree in that mode, including full tables. [The overview subscription](../src/features/card/ui/content/NoteBodyPreview.tsx:337) is deliberately disabled for complete readers. The editor mount scheduler does not pace these reading trees.

A bounded synthetic server-render probe used the actual current components and generated content, without opening a browser or accessing user data:

| Synthetic content | Actual expanded reader | Existing bounded preview |
| --- | --- | --- |
| 1,211 short paragraphs | 3,636 HTML elements; 551,441 bytes | 18 HTML elements; 4,093 bytes |
| 968 table cells | All 968 cells; 2,072 HTML elements | 96 cells; 216 HTML elements |

These are markup counts, not measured browser startup time, painted DOM, GPU usage or a claim that the bounded preview can replace a complete reader. Complete reading/scrolling is a product requirement; simply truncating expanded notes would be a regression.

**Proposed first fix:** bound the initial reading/render work. Introduce incremental/visible-region rendering for large complete readers and table rows, with retained document data, stable estimated/measured geometry, scroll anchors, keyboard reading and promotion into editing. Keep small documents and the active editor on their current path. Preserve access to the entire document; do not replace it with a permanent prefix or delete saved blocks.

Acceptance: opening remains responsive; long-document scrolling, table row geometry, first-click caret placement, selection, IME, promotion/demotion, undo and save/reload equality pass. Measure first usable frame, longest tasks, mounted elements and memory on the same fixture before and after. Actual browser confirmation on the affected workspace remains required.

## Finding 2: folder reconnection gates application readiness

Evidence: [startup persistence](../src/services/storage/workspace/localPersistence.ts:108) loads IndexedDB, then awaits folder reconnection. [FolderSession](../src/services/storage/workspace/FolderSession.ts:88) fully loads the linked folder even when a browser graph is available. [FolderWorkspace](../src/services/storage/workspace/FolderWorkspace.ts:79) reads node/edge records and checks/imports assets before returning. `App` waits for persistence's ready callback before displaying the selected view.

This is a confirmed blocking startup sequence, not proof that the affected user has a linked folder or that I/O caused their host to hang.

**Proposed separate fix:** let a validated browser graph become usable while folder reconnection proceeds through an explicit state. Keep conflict/commit checks, origin-wide write locking, asset verification and save ordering; do not blindly skip verification or write against an unverified folder. Add a bounded waiting/recovery view with retry and backup access if startup cannot complete.

Acceptance: existing folder contract tests, permission denial/retry, external revision conflicts, simultaneous-tab protection, incremental save, recovery and browser/folder canonical-content equality pass. No silent workspace replacement or early write is acceptable.

## Secondary findings

- [Viewport initialization](../src/features/canvas/hooks/viewport/useCanvasViewport.ts:86) evaluates an all-root-node fit estimate as the argument to `useRef` on every render, although React uses only the initial value. Lazy initialization can remove redundant work; this is not established as the primary hang source.
- Colored cards have [60px ambient blur](../src/features/card/ui/node/styles/surface.css:92). A historical native pan trace attributed substantial time to compositor updates, but did not isolate this CSS effect. Profile the current scene before reducing effects or changing GPU settings. No visual effects or browser hardware acceleration were changed.
- Default Vite watching includes application-local generated reports unless explicitly ignored. Previous test-server logs show HTML-report writes causing reload notifications. Ignoring generated report/output directories is reasonable development hygiene, but no reload storm was observed in the affected session, so it is not a diagnosed root cause.

## Recommended decision

Start with finding 1, with a reversible first-paint/recovery path so a large saved scene cannot prevent access to backup controls. Handle finding 2 as a separate storage-lifecycle change with its own regression checks. Keep the minor fit-estimate/watch cleanup separate, and require a current paint profile before changing visual effects.

This recommendation preserves the existing workspace format and contents. It does not propose clearing site data, resetting the workspace, disabling browser security, upgrading drivers or changing OS settings.

## Investigation artifacts

Repository-root `output/audits/canvas-freeze-2026-10-19/` contains `machine-snapshot.json`, `reader-probe.json`, the synthetic fixture/runner, generated compiled module and failed probe logs. Early SSR attempts needed a synthetic localStorage stub and React deduplication because the probe entry lived outside beta; those were harness issues and are not asserted to be browser application defects. The final probe used beta as its root and passed the expected paragraph/cell-count assertions.

No stress suite or browser reload was run against the affected tab. Subsequent isolated repair verification is recorded separately; affected-session before/after browser performance remains unverified.
