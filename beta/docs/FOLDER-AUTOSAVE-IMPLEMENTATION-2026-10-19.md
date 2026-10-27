# Folder autosave: implementation and validation

19 October 2026. Local changes only; no deployment or GitHub push.

## What the audit found

The active beta previously autosaved only to IndexedDB. Its PC save action exported a single JSON backup, including base64 attachments. Direct folder synchronization existed only in the archived legacy app. The earlier browser-seeded editor measurements therefore did not exercise a connected user folder.

The user explicitly chose to restore folder autosave. This implementation adds that workflow without changing expanded-card presentation, the custom editor, or the mind map.

## User workflow

Open the workspace/account page (the canvas's **Backup and sign-in** button), then **Choose or open folder** under **Autosave to a folder**. A new folder receives a `chnk-it-workspace` subfolder. Select the same parent folder to reopen it. Opening an existing saved workspace asks before replacing the current canvas; cancel leaves the canvas unchanged.

The canvas distinguishes **Saving to folder…**, **Saved to folder**, and **Folder save paused**. Permission renewal requires a user gesture through **Retry folder save**. There are no permission prompts at startup. An IndexedDB recovery copy continues independently; a folder on the same computer is not protection against losing that computer. Existing JSON backup/restore remains available.

## Storage and performance design

- Card and edge records have immutable, separately versioned JSON files. Unchanged records retain their existing paths; editing one card does not serialize/rewrite every card.
- Uploaded assets are binary files with metadata in the manifest, not base64 inside the graph. Existing assets are reused; asset references are cached by node identity. Legacy nested-column references are included.
- The complete next graph is published by closing `workspace.json` only after its referenced records/assets finish writing. `workspace.previous.json` retains the preceding revision. Normal commits remove only known obsolete app-owned records outside the current/previous manifests; unrelated user files are untouched.
- Saves are sequential with one coalesced newest follow-up, not an unbounded backlog. They share the existing bounded autosave debounce and drag guard. The browser recovery write does not wait for filesystem I/O.
- Same-origin folder operations use Web Locks; a commit comparison refuses stale writers. This is single-writer conflict detection, not collaborative merge. Cross-origin or other applications writing the folder are not coordinated by that lock.
- A remembered folder never silently replaces a newer browser draft. A changed disk commit pauses autosave and requires an explicit reopen decision. React StrictMode reconnects are deduplicated.

The stream-close and permission model follows [Chrome's File System Access documentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access). Atomic publication is per manifest file; this is not a guarantee against every OS/power-loss failure.

## Evidence

The headed Chromium cohort passed **7/7**: two new folder scenarios plus five existing browser-persistence scenarios. Raw artifacts: `output/audits/folder-autosave-2026-10-18/acceptance/`.

The heavy folder scenario uses 160 cards / 12,800 blocks and an uploaded binary. It verifies one changed entity path, stable asset paths, exact binary bytes after clearing the asset DB, graph round-trip, stale-client rejection, and an injected manifest-write failure leaving the current commit intact. The UI scenario uses a real title edit, reload, deletion of the browser graph DB, permission denial, and retry. Directory selection and permission states are substituted; actual filesystem streams use Chromium OPFS. This does not test the Windows folder picker, removable disks, Safe Browsing checks, or OS permission prompts.

A separate Node filesystem adapter writes the same engine to an actual isolated PC directory: `output/audits/folder-autosave-2026-10-18/pc-folder-vHyeXw/diagnostic-results.json`. It verified 160 cards / 12,800 blocks, no writes for an unchanged graph, three writes for one card edit (record plus two manifest pointers), exact graph reload, and 163 retained files after 20 edit cycles. That run recorded 3,672ms for initial save and 14.4ms for one edit; an earlier run recorded 584ms and 10.6ms. These are isolated adapter diagnostics, not real-browser/UI latency or repeatable performance acceptance results.

Final headed screenshots/reopen checks and production measurements are recorded below when complete.

## Limits and next work

- This is a new folder format. Legacy `nodes.json` folders are detected and refused without overwriting their records; compressed legacy import/migration is not implemented.
- A failed/crashed write can leave unreferenced immutable files. Normal successful revisions are bounded; automatic crash-orphan repair and a UI for restoring the previous manifest are not implemented.
- File names/IDs, format, graph structure and asset sizes are checked, but this is not full cryptographic corruption detection. Large imported graphs and media need broader capacity tests.
- The folder engine still compares the graph/manifest in O(cards + edges), and a changed card still serializes that card's entire document. It does not implement per-block disk transactions or document virtualization.
- Expanded-card startup, layout/compositing and CPU-throttled typing remain separate performance problems. Do not claim that restoring folder autosave makes the whole application lightweight or meets the performance plan's release gates.

## Final correctness and visual checks

The final folder UI scenario passed in the `confirmed/` run, including cancel versus confirm when opening an existing folder and unchanged canvas data after cancellation. Desktop (1440 × 1000) and small-screen (390 × 844) profile captures were inspected together; controls wrap without horizontal page overflow. The storage engine's latest `pointer-recovery/` run passed both the heavy graph/binary/conflict/fault case and the new empty-first-pointer retry case. The earlier `final/` attempt failed before the storage engine ran because canvas cold boot exceeded the helper's 20-second wait; its UI case passed. The engine fixture now uses an isolated origin page, while the separate UI case retains actual app boot and interaction. That earlier failure is not a folder-engine performance result.

Three existing JSON-backup scenarios also passed: every card/link/file restored into a fresh browser, malformed backup refusal, and canceled restore preserving the canvas. Artifacts are under `output/audits/folder-autosave-2026-10-19/backup/`.

TypeScript, whole-beta ESLint, Knip, 21 editor core checks, and the production build passed during this implementation. The production artifact was rehashed after measurement and remained unchanged. No dependency was added. The local development canvas on port 5174 was restored and verified with HTTP 200.

## Production artifact and diagnostic scope

Final artifact: `beta/node_modules/.cache/performance-folder-20261019`; 1,307 files, aggregate SHA-256 `9493a489b049689de42c759796345a0c7046dc111926fa6bd16c9061524dd261`. Per-file manifest: `output/audits/folder-autosave-2026-10-19/artifact-final.json`. The bundle contains the final first-pointer recovery check.

The earlier preflight `folder-autosave-normal` recording completed only the dossier workload before interruption. Its 70.8ms typing p95 is one diagnostic from the earlier artifact, not a completed three-workload cohort or a paired performance comparison. Do not combine it with later workloads as one run. The final artifact's measurements below supersede that preflight.

## Final production diagnostic

Headed Chromium, 1600 × 1000, requested 8ms typing delay, one isolated foreground run per workload with the 160-card research fixture and folder autosave active. Native OPFS filesystem streams are used behind a substituted directory picker; the Windows picker and user-visible disk security path are not measured here. Each workload has **99 input samples**, below the plan's ≥200-sample / three-run acceptance gate. The metric is input to the second animation-frame callback, not INP.

| Expanded workload | Typing p95, ms | Max, ms | Initial folder save UI wait, ms |
| --- | --- | --- | --- |
| 1,211-block dossier | 40.7 | 191.9 | 1,623 |
| 968-cell table | 44.1 | 65.2 | 1,528 |
| Nested columns | 44.7 | 84.5 | 962 |

All three verified the new text in the folder's actual entity file, in browser recovery storage, and visibly after reload. All remained foreground-visible without visibility changes. No application errors or failed network requests were recorded. [Raw results and adjacent samples](../../output/audits/production-editor/2026-10-18T22-42-26-534Z-folder-autosave-final/results.json).

All three diagnostic p95s were below 50ms, but this is **not** repeated-run performance acceptance. A 191.9ms individual input and a 188ms long task remain material. Setup took 43.2–51.0 seconds; it includes app navigation, opening the profile, connecting/saving the folder, returning to canvas, focus and click readiness. It must not be compared directly to the earlier no-folder `openMs`, or described as pure save latency. No paired before/after or CPU ×4 run of this final artifact was performed. Rendering/startup, larger documents/tables, native OS folder testing and repeated foreground measurements remain required before claiming production performance targets.
