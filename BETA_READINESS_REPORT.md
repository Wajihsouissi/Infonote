# Beta Readiness Report — Chnk it (Infonote)

**Date:** 2026-07-03 · **Target:** public beta launch next week
**Method:** static review of full codebase, `tsc`/`eslint`/`vite build` runs, and a live smoke test of the running app (desktop + mobile viewports).

> **Update (same day):** items #1 (AI endpoint auth/rate-limit/model-lock), #2 (auto-sync
> default ON + IndexedDB snapshot fallback), #3 (verified already delta-safe; stale docs
> fixed), #4 (conditional hooks), #6 (history routing), #7 (code splitting: marketing page
> now ~230 kB gz vs 629 kB), #8 (mojibake + competitor video), #10 (multi-select delete
> keys), #11 (500-node cap now alerts and blocks saves) are **fixed and verified live**.
> Still open: #5 (commit the refactor — do this next), #9 (mobile responsiveness),
> #12 (error telemetry), and the P2 list.

---

## Verdict

The app boots cleanly, TypeScript compiles with zero errors, the store/undo/sync architecture is genuinely solid, and Supabase RLS policies are in place. **But there are 4 issues I would not launch with**: unauthenticated AI endpoints (anyone can drain your AI credits), a default posture that silently loses user work, a collaboration save model that can erase a teammate's changes, and a React hooks violation that can whitescreen the canvas. All are fixable within your one-week window.

---

## What's already good (keep it)

- `tsc -b` passes with **0 errors** (the 21 errors from the June AUDIT_REPORT are fixed).
- App boots with **zero console errors/warnings** on both `/` and `/canvas`.
- Store architecture is strong: zundo undo history with coalescing, selection-change filtering, delta tracking for cloud sync, pre-load backups (`backupNodes`), `beforeunload` flush + warning.
- 30 RLS policies across 12 migrations; workspace collaboration is policy-driven, admin identity hardened (0008/0009).
- `api/workspace/invite.js` is the model citizen: bearer-token auth + rate limiting + HTML escaping.
- `.env` is gitignored; `.env.example` documents server-only vs `VITE_` keys correctly.
- Root `ErrorBoundary` exists with a reload fallback.

---

## P0 — Must fix before beta

### 1. AI endpoints are open to the internet (cost/abuse risk)
[api/ai/text.js](api/ai/text.js), [api/ai/stream.js](api/ai/stream.js), [api/ai/image.js](api/ai/image.js) have **no authentication and no rate limiting**, and they honor a **client-supplied `model`** ([text.js:50-53](api/ai/text.js:50)). Once deployed, anyone can `POST /api/ai/text` and use your Vercel AI Gateway as a free LLM/image proxy — including expensive models. Image generation makes this costly fast.

**Fix:** copy the pattern already used in [invite.js](api/workspace/invite.js): require a Supabase bearer token, verify it server-side, add a per-user rate limit, and **whitelist allowed models server-side** (ignore the client's `model` field or validate against an allowlist).

### 2. Default data-loss posture
Verified live: an anonymous visitor can open `/canvas` and start working, and **nothing is persisted anywhere** (no localStorage/IndexedDB keys exist; confirmed empirically). A refresh, crash, or tab kill loses everything — the only protection is the `beforeunload` confirm.

Even signed-in users aren't safe by default: **cloud auto-sync defaults to OFF** ([StorageControls.tsx:56-58](src/features/ui/StorageControls.tsx:56) — reads localStorage, defaults `false`), and local-folder save requires an explicit connect and is Chromium-only (File System Access API — no Firefox/Safari support in [FileSystemBackend](src/services/storage/FileSystemBackend.ts)).

**Fix (pick at least one, ideally the first two):**
- Default `isAutoSyncEnabled` to `true` for signed-in users with a workspace.
- Add a lightweight IndexedDB/localStorage snapshot autosave (debounced, compressed with the `lz-string` dep you already have) as a universal fallback — the same 500ms debounce path in [StorageManager.ts:85](src/services/StorageManager.ts:85) could write it.
- Or gate `/canvas` behind sign-in for the beta.

### 3. Collaboration can silently erase a teammate's work
Cloud save is "mirror local state exactly, delete-by-not-in" ([cloudSync.ts](src/services/cloudSync.ts) header). But the realtime protocol only broadcasts `UPDATE_NODE` / `UPDATE_EDGE` ([useRealtimeSync.ts:14-20](src/features/canvas/hooks/useRealtimeSync.ts:14)) — **node adds and deletes are never broadcast**. Two collaborators diverge immediately; whoever saves second deletes the other's new nodes from the cloud.

**Fix options for beta scale:** broadcast ADD/DELETE messages too; or reload-merge before every save; or scope beta collaboration to "one editor at a time" and say so in the UI.

### 4. Rules-of-hooks violation can whitescreen the canvas
[NoteExpandedContent.tsx:155](src/features/card/NoteExpandedContent.tsx:155) returns early **before** three `useMemo` calls (lines 160, 169, 196 — the comment "Early return after hooks" is no longer true after the current uncommitted refactor). If `data` ever flips truthy/falsy between renders, React throws "Rendered more hooks than during the previous render", which the root ErrorBoundary catches by replacing the **entire app** with "Something went wrong". ESLint confirms 3 `react-hooks/rules-of-hooks` errors.

**Fix:** move the `if (!data)` return below all hooks. 15-minute fix.

### 5. Land the uncommitted refactor
There are **1,424 insertions across 15 modified files + 4 new store files** sitting uncommitted (the undo/history rework), and [README.md:1](README.md) contains an unresolved merge-conflict marker (`<<<<<<< HEAD`). Launching from an uncommitted tree means no rollback point.

**Fix:** resolve the README conflict, commit the refactor, tag the release candidate.

---

## P1 — Should fix before beta

### 6. Browser back/forward buttons don't work
Routing is store-state-based; [App.tsx:34-69](src/App.tsx:34) reads the URL once on mount and never pushes history afterward. Users pressing Back leave the site; URLs don't reflect where they are; deep links only work for the hardcoded initial paths. Beta users hit this within minutes.
**Fix:** minimally, `history.pushState` on `setCurrentView` + a `popstate` listener; or adopt a small router later.

### 7. One 2.3 MB JS chunk for everything
`vite build` outputs `index-BgEMNDRw.js` at **2,308 kB (629 kB gzip)** — marketing visitors download the entire canvas, editor, kanban, admin, and auth code before first paint. Also `mindmap_visual.png` is **885 kB**.
**Fix:** `React.lazy` the top-level views in [App.tsx](src/App.tsx) (CanvasBoard, MarketingPage, AdminGate, MarketplacePage) — Vite will split them automatically; convert the PNG to WebP (~100 kB). Optionally trim the 5 Outfit font weights.

### 8. Placeholder/corrupted content on the public marketing page
- The hero "demo video" is **a competitor's (Scrintal) YouTube video** — [MarketingPage.tsx:161](src/The-website/MarketingPage.tsx:161), videoId `-I8QtPA7lt4`. Must be replaced (or removed) before launch.
- The file has **UTF-8 mojibake in user-visible strings**: `âŒ˜K` instead of `⌘K` ([line 1439](src/The-website/MarketingPage.tsx:1439)), `â€"` instead of `—` in demo card copy (lines 303, 324). The file bytes are double-encoded; re-type those strings.

### 9. Mobile is broken on the entry page
At 375px the marketing page clips the navbar (logo and Login truncated) and the hero overflows horizontally (verified via live resize). The canvas is untested for touch.
**Fix for the week:** make the marketing page responsive; show a "Chnk it works best on desktop" banner on small screens instead of a broken canvas.

### 10. Deleting multi-selected blocks via keyboard is dead code
In [BlockEditor.tsx](src/features/editor/BlockEditor.tsx), the branches at lines 1338/1344/1348 (Ctrl+Delete / Backspace / Delete with `selectedBlockIds.size > 0`) are unreachable — earlier branches at lines 1083 and 1176 match `Backspace`/`Delete` first (ESLint `no-dupe-else-if` confirms). Users who select multiple blocks and press Delete get the wrong behavior.
**Fix:** hoist the selection-aware checks above the single-block branches.

### 11. Silent 500-node cap = permanent data loss for power users
[storageSlice.ts:127-130](src/store/slices/storageSlice.ts:127) trims loads to 500 nodes with only a `console.warn`; the next save persists the truncated graph. A heavy beta user's notes silently vanish.
**Fix:** if trimming would occur, show a blocking UI warning and refuse to auto-save until the user acknowledges/exports. (Longer term: pagination/virtualization instead of a cap.)

### 12. No error telemetry
[ErrorBoundary.tsx:24-26](src/components/ErrorBoundary.tsx:24) only `console.error`s. In beta you'll never hear about crashes users don't report.
**Fix:** add Sentry (free tier) or even a `client_errors` Supabase table + `window.onerror`/`onunhandledrejection` handlers. You already have admin telemetry infrastructure to display it.

---

## P2 — Worth scheduling (not launch-blocking)

13. **Lint debt:** 581 problems (443 `no-explicit-any`, 47 unused vars, 29 `exhaustive-deps`, 16 `set-state-in-effect`). Fix the hooks-family warnings first — several are stale-closure bugs waiting to happen. Add `tsc && eslint && vite build` as a CI gate (GitHub Action).
14. **No tests:** no test runner is configured (`package.json` has no `test` script). Even one Playwright smoke test of the critical path (open canvas → create note → type → refresh → content persists) would catch the worst regressions.
15. **Repo hygiene:** delete stray root files (`recover.cjs`, `recovered_css.txt`, `replacement.txt`, `step537.json`); archive the older planning docs into `/docs`.
16. **vite.config.ts is 934 lines** because it re-implements every `api/*` handler as dev middleware. Extract shared handler modules imported by both, so dev and prod can't drift (they already differ: dev has invite rate limiting constants, prod invite.js has its own copy).
17. **Browser-support messaging:** local-folder saving (File System Access API) is Chromium-only — detect and hide/explain the button in Firefox/Safari instead of letting it fail.
18. **Admin route** `/wajihadmin` is security-through-obscurity on the client; RLS migrations appear to gate the data properly, but verify the telemetry tables reject non-admin reads with an anon key before launch.
19. **Tooling note:** your Claude Code Glob/Grep hook (`.claude` settings) uses PowerShell syntax but runs under bash, so it errors on every search-tool call. Rewrite the hook in POSIX sh (e.g. `[ -f graphify-out/graph.json ] && graphify auto-update || true`).

---

## Suggested one-week order of attack

| Day | Work |
|---|---|
| 1 | Commit the pending refactor + fix README conflict. Fix conditional hooks (#4). Auth + rate-limit + model allowlist on AI endpoints (#1). |
| 2 | Auto-sync ON by default + IndexedDB fallback snapshot (#2). Surface the 500-node cap (#11). |
| 3 | Collaboration mitigation (#3). Fix dead delete-key branches (#10). |
| 4 | History/pushState routing (#6). Replace Scrintal video, fix mojibake (#8). |
| 5 | Code-split views + compress hero PNG (#7). Error telemetry (#12). |
| 6 | Mobile marketing fixes + desktop-recommended banner (#9). Cross-browser pass. |
| 7 | Freeze. Tag RC. Run a 2–3 person dogfood session; watch the telemetry you added on day 5. |
