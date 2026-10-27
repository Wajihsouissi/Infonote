# Canvas startup and recovery — 19 October 2026

Follow-up: the owner's subsequent console revealed repeated saved block identities, a case absent from the clean fixtures below. See the [block identity repair](BLOCK-IDENTITY-REPAIR-2026-10-19.md) for that additional defect, implementation and regression evidence.

Implemented after the owner's approval of the [freeze investigation](LOCALHOST-FREEZE-INVESTIGATION-2026-10-19.md). The repair bounds startup rendering and separates verified browser hydration from folder reconnection. Saved workspace format and contents are preserved. No user workspace, site data or quarantined file was deleted or reset.

## Runtime boundaries

- `features/card/reading/` owns the commit queue, budgets and admission hooks. Complete canvas readers admit rich content near the viewport at legible zoom, then progressively mount the entire document. Long readers initially release 16 simple blocks; tables release roughly 96 cells per batch, galleries 12 items. Small documents remain immediate; an oversized item always makes progress. This is temporary scheduling, not saved-content truncation.
- Readers and editor mounts share one queue. Explicit editing takes priority; streaming pauses queued work. Tickets acknowledge or cancel only their own commit. Stale acknowledgements cannot release another job; a bounded timeout prevents an abandoned consumer from stalling other readers. Unmount removes pending work and idle frame requests.
- Admitted readers stay mounted until their card unmounts. After entering editing, demotion restores the complete reader immediately, preserving deep scroll positions. A saved canvas starts at its fitted viewport before mounting card bodies; subsequent camera ownership stays with the user.
- `localPersistence.ts` publishes a verified browser graph and starts its subscriptions before awaiting folder I/O. Reconnection saves the current live graph, including edits made during the wait. External revisions still require the explicit open/replace flow. With no browser copy, unavailable remembered-folder access blocks editing and welcome seeding. Failed storage reads cannot expose an empty editable canvas or autosave over saved work.
- Shared database opening reports blocked upgrades and a 10-second deadline, closes late connections, and closes old connections on version changes.
- `app/recovery/` is an independent `/recovery` entry. It imports neither App, canvas, application store nor auth bootstrap. It initially reads only the saved header. Export reads the saved graph through the canonical asset codec in `backupExport.ts`. Folder metadata is checked independently; its failure cannot block browser export. Permission requests occur in the user's button gesture. Recovery starts no autosave.
- Error reporting receives its optional token provider from App instead of importing the store. Save indicators prioritize browser failures and show reconnection. Vite ignores generated audit/report directories so their writes do not trigger development reloads.

## Evidence

Artifacts: repository-root `output/audits/canvas-startup-fix-2026-10-19/`. The preceding `canvas-freeze-2026-10-19/` baseline remains unchanged. Initial copies/hashes of 22 boundary files are retained in `before/` and `before-manifest.json`; this is a scoped snapshot, not a clean checkout of the previously dirty repository.

| Synthetic server-render fixture | Before | Initial render after |
| --- | --- | --- |
| 1,211 paragraphs | 3,636 elements; 551,441 bytes | 52 elements; 7,539 bytes; first 16 blocks |
| 968 table cells | 2,072 elements; all 968 cells | 223 elements; 19,868 bytes; first 96 cells |

These actual-component SSR markup counts exclude browser layout, paint, GPU and user data. Browser assertions separately verify all 301 blocks and 968 cells eventually render in the focused test note and all 1,801 saved blocks across six notes remain intact. A mutation observer verifies batches of at most 16 blocks when framing without requesting editing.

One isolated **production-build** Chromium sample restored six expanded notes with 7,266 paragraphs plus a 968-cell table. The observed ready scene had 1,563 body elements, six deferred readers, no live editor, no reader-text nodes, and no JavaScript errors. Scene readiness was observed at 1,418 ms from navigation, with one 59 ms long task. Paint entries were unavailable. Production recovery fetched neither App nor CanvasBoard. See `production-startup.json` and its bounded runner. This single sample is neither a browser before/after benchmark nor the affected user's scene.

## Verification

- Root `npm run check` passed: strict lint, 21 editor checks, 11 queue/budget checks, filesystem folder checks, TypeScript, production build and Knip. Reading checks are part of the aggregate gate.
- **40 distinct Chromium scenarios passed** across the targeted runs: 19 startup/recovery/threshold/backup/transfer/camera cases, nine reading/editing/IME cases, four folder-session cases, five browser persistence cases, two folder-storage cases, and one database timeout/late-connection case. Repeated scenarios are counted once.
- Folder tests cover edits during blocked reconnection, concurrent reconnect joining, external revision refusal, coalesced saves, restart subscription cleanup, and denied access when the folder is the only copy. Recovery verifies multilingual content, no application/store imports, no autosave writes, header-only initial reads, canonical export, and export despite blocked folder metadata.
- Reading tests cover complete content, empty placeholders, first-click input, native selection, horizontal table position, repeated long-document scroll handoffs, cross-card drafts and IME retention. Camera stability and canonical backup/restore including uploaded files passed.
- Recovery screenshots at 1280px and 390px were inspected; narrow layout has no horizontal overflow. One Impeccable detector pass found no findings in accessible recovery/reading targets. Its incorrectly specified FolderSettings target was not scanned; the actual profile FolderSettings and SaveState were manually reviewed.
- The threshold harness now uses a real Vite-served QA HTML document. The previous synthetic fulfilled document triggered Chromium local-network checks on Vite's websocket. Assertions and console-error gates remain intact; the corrected harness passed.

Logs: `check-verified.log`, `browser-regressions.log` (19 passed), `browser-reading.log` (nine reading passes plus earlier failures subsequently resolved), `browser-storage-final.log` (16 passed, overlapping four startup cases), `reader-probe.json`, `production-startup.json`, `ui-detector.json`, and `graphify-update.log`.

## Acceptance limits and recovery

The affected existing tab/profile could not be observed under the available browser policy. No alternate profile-inspection or CDP workaround was used. The actual saved user's scene, hardware/compositor behavior and original OS hang remain unverified. These repairs address confirmed expensive paths and pass scoped regressions; they do not establish a definitive diagnosis of the machine-wide freeze or blanket production acceptance.

The full browser matrix was not rerun. Previously documented folder-UI and gallery diagnostic failures were not relabelled as fixed; folder storage/session contracts were checked separately. Production still warns about CanvasBoard and the lazy solar icon chunk exceeding 500 kB. Browser memory, current GPU effects and an affected-scene before/after trace remain outside this evidence.

Use **the same origin and browser** as the saved work: `http://localhost:5174/recovery` exports before reopening `/canvas`. `localhost` and `127.0.0.1`, different ports and browser profiles hold separate work. Export does not replace or delete it. Keep the backup before further diagnosis of an affected scene.
