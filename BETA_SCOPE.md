# Beta Scope & Save Model — Spec of Record

**Decided:** 2026-07-10 · **Target:** public beta ~mid-August 2026
**Rule:** nothing outside this document ships in the beta. Everything else stays on `dev`.

---

## Core features (beta v1)

| Area | QA scenarios |
|---|---|
| Canvas + cards (create, move, connect, fuse/split, nest) | B6–B12 |
| Block editor (all block types, slash menu, keyboard, paste, undo) | C13–C18 |
| Persistence (IndexedDB safety net + cloud sync + local folder) | A1–A5, F27–F30 |
| Auth (email, OTP, Google) | H36–H38 |
| AI text generation (auth-gated, rate-limited) | D19–D21, D23 |
| Marketing page (desktop + mobile) | #39 |

**Explicitly OUT of beta v1** (feature-flagged OFF in `src/config/featureFlags.ts` — code stays in the tree, re-enable by flipping the flag after QA):
real-time multi-user collaboration (G32–35), Notion import (F31), AI image generation (D22), and marketplace. All default OFF; re-enable a feature by flipping its flag (or `VITE_FEATURE_<NAME>=true` for local dev only) once its QA pass is clean.

Two former entries have since come back IN: kanban/views (E24–26), rebuilt and flipped on 2026-08-10, and the PDF viewer block, which was deferred because it cost a 462 kB `react-pdf` vendor chunk. That dependency is gone — files now render through the browser's own viewers from a blob URL, at no bundle cost — so the `pdfBlock` flag has been replaced by `files` (default ON), covering upload, storage and viewing for every filetype rather than PDFs alone. See `src/services/assets/` and `src/features/file/`.

---

## Save model (freemium, local-first)

### Limits (confirmed 2026-07-10)

- **Everyone (signed in or not): max 50 nodes per canvas** — a product/performance guard for beta. Blocking-with-message on create, NEVER trim on load (audit item #11 lesson: a canvas loaded with >50 existing nodes renders fully; only new creation is blocked there).
- **Blocks inside the editor: unlimited for everyone.** No block quota anywhere.
- **Anonymous only: max 3 cards total · canvas nesting max 3 levels deep.** Signing in lifts these two.

### Anonymous — no login required

- Full core experience within the limits above.
- Work already persists in this browser via the IndexedDB snapshot (survives refresh/crash). It does NOT follow the user across devices or survive clearing browser data — the reminder copy must say this honestly: *"Your work only lives in this browser. Sign in to keep it safe."* (not "your work isn't saved", which is false and undermines trust).
- **Periodic sign-in reminder:** non-blocking toast/banner. Shows after the first meaningful edit, then roughly every 10 minutes, and immediately when a quota limit is hit. Dismissible, never interrupts typing, never a blocking modal mid-work.
- **Hitting a limit:** the create action is blocked with an inline modal — e.g. "You've reached the free limit of 3 cards. Sign in to create unlimited cards." Existing content is never deleted or locked.

### On first app launch — storage choice modal

One modal, shown once per device (choice changeable later in storage settings). **No option is pre-selected** before continuing:

1. **This device** — saves to IndexedDB on this device. A local folder mirror remains optional (File System Access API, Chromium-only).
2. **This device + cloud** — the same local-first save, plus a debounced Supabase mirror. Signed-out users are taken through sign-in after choosing it.

On first cloud connection, anonymous/local work and an existing cloud graph merge non-destructively; neither side is silently replaced.

### Future (post-beta, do NOT build now)

Cloud sync becomes part of a paid Pro tier. Keep the storage-mode preference as a clean enum (`local | sync`) so gating the mirror behind a plan check later stays isolated.

---

## Resolved decisions (2026-07-10)

- Blocks are **unlimited** everywhere; the "50" is a **50-nodes-per-canvas cap for all beta users**.
- The first-launch storage modal has **no pre-selected default** — the user actively picks This device or This device + cloud.
- A signed-in user who logs out keeps everything visible/editable but cannot create beyond the anonymous quota.

---

## Gap analysis — exists vs. to build

**Already in the codebase (verified in BETA_READINESS_REPORT / QA_TEST_RESULTS):**
- IndexedDB workspace autosave, debounced and universal, with a durable cloud outbox — anonymous persistence works (QA A1 ✅)
- One app-level background sync coordinator: full cloud hydration once per device/workspace, then revision-only startup checks and delta saves
- First-launch, device-scoped choice between This device and This device + cloud; settings can change it later
- Non-destructive first cloud connection, paginated graph loads, restore backups, daily/manual versions, and workspace-scoped file mirroring
- Local folder backend (Chromium File System Access API)
- `beforeunload` flush + unsaved-work warning
- AI endpoints auth-gated + rate-limited (QA ✅)

**To build (the last feature work before freeze):**
1. Limit enforcement in `addNode` (single creation entry point, nodeSlice.ts): 50 nodes/canvas for everyone; 3 cards + 3 nesting levels when not signed in. Small usage indicator (e.g. "2/3 cards" anon, "48/50 nodes" near the cap)
2. Limit-reached modals — sign-in CTA for anonymous limits; friendly "this canvas is full — nest a canvas or start another" for the 50-node cap
3. Periodic sign-in reminder toast (cadence + dismissal state in localStorage)
4. Copy pass over all new limit/reminder surfaces

**Known bugs still open (fix before the feature work):**
- Mobile marketing page broken at 375px (QA F-1, MAJOR)
- Title-edit `onFocus` guard one-liner (QA F-3)
- Error telemetry — Sentry or a `client_errors` table (#12); non-negotiable for beta

---

## Calendar to beta

- **Week 1 (Jul 10–16):** commit + tag baseline, create `dev`, Vercel prod/preview mapping, CI (`tsc && eslint && vite build`). Fix F-1, F-3, telemetry. Start quota + reminder work.
- **Week 2 (Jul 17–23):** finish save-model work (items 1–6 above). This is the LAST feature. Human QA of signed-in flows (F27–F30, H36, D19–23).
- **Week 3 (Jul 24–30):** full QA pass on the fixed build, dogfood with 2–3 people on the preview URL. Anything flaky gets cut, not patched.
- **Week 4 (Jul 31–Aug 8):** freeze, bug fixes only. Tag `v0.1.0-beta`, deploy, soft launch, watch telemetry 2–3 days, then open up.
