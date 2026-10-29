# Repeated console warnings: block identity repair

## Evidence supplied after the startup repair

The owner's console attachment is 112,083,056 bytes. A streaming analysis counted **122,801 duplicate-key warnings**, all for the same block UUID, and 6,686 `CompleteBlocks` stack frames. It also contains four denied `chrome-extension://` resources, eight React Flow warnings about an uninitialized dragged node, and one ResizeObserver notification. The extension messages are a separate source; no extension URLs or that extension ID occur in application source.

This identifies a real application defect beyond the earlier clean-fixture performance tests. Complete readers use durable block identities as React keys. Saved content could reach that reader with repeated ids; simply pacing rendering did not validate those identities. Such keys also make editing, selection and id-based document reconciliation ambiguous. The warning volume can itself add substantial work, but this evidence does not isolate every cause of the original machine-wide freeze.

## Reproduction and repair

A bounded isolated Chromium fixture saved 48 different paragraphs sharing one id. Before the repair, it failed the unique-id assertion and emitted the same duplicate-key warning. The user workspace/profile was not opened or modified by the test.

`features/editor/document/blockIdentity.ts` now supplies one immutable document boundary. It preserves every occurrence, order, text, asset reference and unknown metadata; the first existing id remains and only missing/colliding identities are replaced. Nested galleries, container/legacy child lists, columns and column ids are covered. Existing valid ids are reserved before replacement. Valid snapshots retain references, and repeated normalization of the same immutable snapshot returns the same repaired identities for publishing and rendering.

The boundary is used for graph loading, node creation/content replacement, editor initialization/state/publication, card fusion and parent reconstruction. Repairs made while restoring browser work receive a one-time normal autosave, so a reload does not assign different identities again. Folder-only startup already saves its verified hydrated graph. Storage failure still reports a failed save.

Two concrete producers were also addressed:

- Block-menu and keyboard duplication previously copied nested metadata shallowly. They now reuse the existing deep clipboard clone helper, giving copied descendants new identities.
- Parent reconstruction could concatenate overlapping copied-card identities before ordering by id, overwriting one occurrence. It now normalizes that sequence first and publishes the matching repaired identities back to the owning cards. A second sync converges without further identity changes.

This changes identity data where it was invalid, rather than masking React warnings with array-index keys, suppressing console errors, dropping duplicate content or disabling browser security. No logging suppression or extension changes were introduced. It does not prove the exact operation that originally created the owner's invalid saved ids.

## Verification

- The original 48-paragraph saved-data reproducer now passes with every paragraph retained, all ids unique, the first id preserved, corrected ids saved, and identical restored ids after another reload.
- Creation, replacement and fusion preserve distinct occurrences. Parent/child ids agree after reconstruction and remain stable after a second sync. A real `Ctrl+D` interaction deep-clones nested identities, preserves text and publishes exactly the ids rendered by the editor.
- Editor core checks now include four normalization cases, increasing that gate from 21 to **25**. They cover structural sharing, repeated identities, nested content/metadata preservation, missing ids, idempotence and consistent identities when one snapshot is both published and rendered.
- Root `npm run check` **passed**: lint, those editor checks, the 11 reading queue checks, filesystem folder checks, TypeScript/build and Knip. The scoped final browser run **passed all 37 scenarios** across identity, complete reading/editing/IME, transfers, startup/recovery, folder sessions and browser persistence, with the existing console-error gate enabled. See the final logs for results.

Artifacts: repository-root `output/audits/duplicate-block-ids-2026-10-19/`, including `console-summary.json`, the streaming analyzer, `before/` source snapshots, `before-browser.log`, `editor-unit.log`, `browser-after.log`, `browser-final.log`, `check-final.log` and `graphify-update.log`.

The earlier startup checks used valid unique-id fixtures; they did not cover this saved-data defect. The new regression preserves that case. Browser checks use isolated synthetic contexts; the actual affected user scene still needs confirmation after reloading the updated app. The full browser matrix, extension implementation and the other reported warning types are not claimed fixed by this change. Existing large-chunk build warnings remain separate.
