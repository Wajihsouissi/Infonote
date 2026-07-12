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
real-time multi-user collaboration (G32–35), Notion import (F31), AI image generation (D22), marketplace, kanban/views (E24–26), and the PDF viewer block. All default OFF; re-enable a feature by flipping its flag (or `VITE_FEATURE_<NAME>=true` for local dev only) once its QA pass is clean.

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

### On first login — storage choice modal

One modal, shown once (choice changeable later in storage settings). **No option is pre-selected — the user must actively choose one of three** before continuing:

1. **Local** — saves on this device. Browser storage always; local folder optional (folder = File System Access API, Chromium-only — hide or explain the folder part on Firefox/Safari).
2. **Cloud** — auto-sync to Supabase (auto-sync ON is already the app default for signed-in users).
3. **Local + sync with cloud** — local-first: every save writes locally first, then syncs to cloud in the background (debounced). The flagship posture: the app is a local-first app; cloud is the mirror.

Also on login: anonymous work migrates into the user's workspace with nothing lost (QA A2), and all quotas lift.

### Future (post-beta, do NOT build now)

Cloud sync becomes part of a paid Pro tier. Keep the storage-mode preference as a clean enum (`cloud | local | both`) so gating it behind a plan check later is a one-line change.

---

## Resolved decisions (2026-07-10)

- Blocks are **unlimited** everywhere; the "50" is a **50-nodes-per-canvas cap for all beta users**.
- The storage modal has **no pre-selected default** — the user actively picks Local, Cloud, or Local+cloud-sync.
- A signed-in user who logs out keeps everything visible/editable but cannot create beyond the anonymous quota.

---

## Gap analysis — exists vs. to build

**Already in the codebase (verified in BETA_READINESS_REPORT / QA_TEST_RESULTS):**
- IndexedDB snapshot autosave, debounced, universal — anonymous persistence works (QA A1 ✅)
- Cloud sync with delta saves, auto-sync default ON for signed-in users
- Local folder backend (Chromium File System Access API)
- `beforeunload` flush + unsaved-work warning
- AI endpoints auth-gated + rate-limited (QA ✅)

**To build (the last feature work before freeze):**
1. Limit enforcement in `addNode` (single creation entry point, nodeSlice.ts): 50 nodes/canvas for everyone; 3 cards + 3 nesting levels when not signed in. Small usage indicator (e.g. "2/3 cards" anon, "48/50 nodes" near the cap)
2. Limit-reached modals — sign-in CTA for anonymous limits; friendly "this canvas is full — nest a canvas or start another" for the 50-node cap
3. Periodic sign-in reminder toast (cadence + dismissal state in localStorage)
4. First-login storage choice modal (3 options, none pre-selected), persisted per user; storage settings entry to change it later
5. "Both" mode: verify StorageManager can run local folder + cloud simultaneously with local written first; wire if not
6. Copy pass over all new modals/toasts

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
