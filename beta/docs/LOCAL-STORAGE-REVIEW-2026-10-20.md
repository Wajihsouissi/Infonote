# Local storage review — 20 October 2026

Status: three confirmed storage inefficiencies repaired. The normal-profile
7,328 ms freeze has not yet been reproduced with the owner's saved data.

The owner confirmed that incognito contains a new/example canvas, rather than
the same notes as the slow regular window. Its responsiveness therefore does
not isolate authentication, corruption or extensions: both the browser session
and the loaded data differ. Incognito's separate, temporary site data is
documented by [Chrome](https://support.google.com/chrome/answer/95464?hl=en).
No user browser profile was read, reset or cleared during this review.

## What is saved and what accumulates

| Data | Location | Current behavior |
| --- | --- | --- |
| Notes, standalone blocks, connections and document content | IndexedDB `infonote-local-workspaces`, version 3 | One header for workspace `anonymous`, one current row per node/edge. Saves replace changed rows and remove deleted graph rows; they do not append one persistent workspace version per edit. |
| Uploaded images, PDFs and other files | IndexedDB `chnk-it-assets`, version 1 | Records are reused for matching uploads. Removing a card does not garbage-collect its file record, so unreferenced files can accumulate. |
| AI conversations | IndexedDB `chnk-it-ai-chats`, version 1 | Saves replace a chat by ID. Existing retention prunes to 50 conversations; list/prune currently reads full transcripts before producing summaries. |
| Saved-folder grant/commit | IndexedDB `chnk-it-folder-binding` | One remembered binding; folder persistence is optional. |
| Authentication, preferences and link metadata cache | `localStorage` | Separate small preference/session values. Link metadata previously had no bound; repaired below. |
| Undo/redo | RAM, zundo | Up to 200 history entries; not a persistent localStorage history or 200 disk copies of every note. |
| Optional folder workspace | The explicitly selected folder | Immutable entity files and two retained manifest revisions; known obsolete revision files are removed by the existing folder protocol. |

Authentication does not select a different local workspace key in this beta.
The local graph uses `anonymous` even though an account may be signed in. Each
origin/browser profile has its own storage, so different ports, `localhost`
versus `127.0.0.1`, or incognito are not equivalent saved-data tests.

The different IndexedDB databases separate schemas and transactions; they do
**not** give assets and workspace data independent browser-origin quota budgets.
See [browser storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
The misleading asset-store comment claiming quota isolation was corrected.

## Repair 1: preserve unchanged records through hydration

`storageSlice.sanitizeNode` previously cloned every node and its `data`, even
when the record needed no repair. `LocalWorkspaceStore` intentionally compares
immutable references to its last committed graph. The clone made the first
one-note change after reload appear to modify **every** node, causing unnecessary
IndexedDB structured-clone/write work.

Valid nodes now retain their references. A node is copied only when converting
legacy string/missing/malformed content or repairing block IDs. Unknown fields,
original malformed content, block text and existing identity-repair behavior
are preserved. The storage writer and workspace format were not changed.

Regression evidence: a three-node hydration followed by one edit previously
marked all three nodes changed; it now marks one. Tests also cover legacy text,
preserved malformed content and copying only the node with duplicate block IDs.
A browser regression instruments actual IndexedDB node writes after reload and
checks a second reload preserves every node's body.

## Repair 2: bounded autosave admission

Ordinary saves remain debounced for 350 ms with a 1,500 ms maximum delay during
continuous editing. The storage primitive preserves its ordered operation API.
The autosave controller, however, previously submitted another graph snapshot
at every debounce even when an earlier write was still pending. A slow backend
could retain a growing FIFO of obsolete graph versions in memory.

The controller now admits one active write and one boolean request to capture
the **latest live graph** after it finishes. Intermediate requested snapshots
are not retained. Generation-based dirty/error handling remains: an older save
cannot mark a newer edit clean, and a failed active write does not prevent a
newer requested retry.

A timer scheduled before dragging also previously wrote during the drag,
despite the subscription's drag guard. Normal timers and queued writes now
respect that guard and resume through the existing drag-end subscription.
Page hide, visibility change and before-unload flushes explicitly force a dirty
graph to save; teardown still captures its final graph and cancels queued
autosave admission. Browser shutdown cannot guarantee completion of asynchronous
I/O; the existing before-unload safeguard remains.

Controlled storage/clock tests reproduce three failures before this change:
six graph requests behind a held save, a pre-drag timer writing mid-drag, and
redundant queued teardown work. An additional test caught a lifecycle flush in
the promise-settlement gap; the controller now joins another drain in that case.
Nine autosave contracts pass after repair.

## Repair 3: bounded, lazy link metadata caching

The old service parsed its entire `chnk_metadata_cache` during module import.
Every successful link response then reread, parsed, extended and synchronously
rewrote that whole localStorage value. Its memory map and persisted cache had
no entry/serialized-size bound, and simultaneous copies of a URL fetched it
independently.

`services/metadata/MetadataCache.ts` now provides:

- Lazy hydration on first metadata use, rather than application/module startup.
- At most 128 entries and 256 Ki UTF-16 JSON characters, approximately 512 KiB
  serialized. This is a cache budget, not a guarantee about total JS heap size.
- Least-recently-used eviction of regenerable metadata only. Graphs, file bytes,
  chat records, auth and settings are not cache entries.
- Coalesced writes after 250 ms rather than one full read/write per response.
- Cache misses for malformed or oversized legacy cache values. A read does not
  delete or overwrite the old value; a later successful response can replace it
  with the bounded cache. The original metadata key/record format stays compatible.
- Memory-only failed responses. A storage/quota failure disables repeated
  persistence attempts for that module instance while memory caching continues.
- One in-flight fetch shared by simultaneous consumers of the same URL.

This changes the retention of optional link previews, not user-authored content.
Evicted metadata may need to be fetched again. No expiry policy was added.

A stubbed before/after replay used 20 simultaneous consumers of one URL and an
identical initial cache of 100 entries. No real network or user data was used:

| Work | Before | After |
| --- | ---: | ---: |
| Storage reads during module import | 1 | 0 |
| Storage reads over the whole replay | 21 | 1 |
| Metadata fetches | 20 | 1 |
| Synchronous localStorage writes | 20 | 1 |
| Approximate UTF-16 bytes written | 2,686,160 | 134,308 |

Twelve cache/service contracts cover legacy compatibility, malformed/oversized
data, count and serialized bounds, LRU retention, batching, quota failure,
memory-only errors, shared requests and release of completed in-flight entries.

## Remaining findings

1. **Large saved graphs still load before rendering.** IndexedDB reads all rows
   for the workspace, then the app hydrates the graph and builds visible reading
   surfaces. Incognito's example canvas does not exercise this scale. A large
   graph or document can remain expensive even when autosave is efficient.
2. **Assets can remain after their last card is removed.** No automatic deletion
   was added. A safe cleanup must account for live references, undo/redo, saved
   browser content and retained folder revisions, and present candidates before
   deleting user files. Disk accumulation alone does not establish a pan freeze.
3. **AI chat summaries are not yet a separate store.** The version-1 `listChats`
   uses `getAll()` on full transcripts, and `pruneChats` calls it after saves.
   Large saved conversations can cause avoidable cloning/memory work while AI
   is used. The summary-type comment was corrected; conversation storage and
   retention were not changed. A transactional summary-store migration is the
   next architecture candidate and needs separate preservation/migration checks.
4. **Multiple normal tabs share one local workspace.** Transactions serialize,
   but the local store's stale-commit fallback rewrites the supplied snapshot;
   it does not surface an explicit cross-tab editing conflict. The folder
   backend has a stronger revision guard. A separate local-tab ownership/conflict
   design is needed before promising safe simultaneous editing.
5. **The original freeze remains unverified.** No actual saved node/block/file
   counts or per-origin usage from the protected regular profile were available.
   These repairs address reproduced code paths, not proof of the 7-second cause.

## Verification and artifacts

Repository-root evidence: `output/audits/local-storage-review-2026-10-20/`.
Saved pre-change copies preserve the local persistence controller, metadata
service and hydration slice. `autosave-before.log` records the three controlled
autosave failures; `hydration-before.log` records the reference/write-set
regressions; their after logs pass. `metadata-before-after.json` contains the
stubbed replay counters.

`npm run check` includes `check:autosave` and `check:metadata`, alongside lint,
editor/reading/folder checks, the TypeScript/Vite build and Knip. The final
aggregate run passed; an earlier run exposed TypeScript's erasable-syntax
restriction on constructor parameter properties, which was corrected before the
passing run. Existing chunk-size/mixed-import notices remain.

The initial browser run completed eight scenarios and exposed an assertion
mistake in the new incremental-write case: the test's `nodeText` helper includes
labels/type/timestamps, not just body text. The actual one-record write assertion
had passed. The final assertions now compare exact body arrays and labels, and
that case passed on rerun. After the late-flush repair, a final five-case run
passed: editor continuity through pan/drag, blur release, one-record first save
with content preserved after reload, and ordinary local restore. Nine distinct
targeted browser scenarios passed across these runs. The final aggregate check
also passed with all 26 new hydration/autosave/cache contracts included.

The development server on localhost:5174 remains the user's running server;
browser regression uses its own server and fresh contexts on 5188. No deletion
or reset of user notes, conversations or uploaded files was performed. Link
metadata has the explicitly bounded, regenerable cache retention described above.
