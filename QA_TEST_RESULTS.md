# QA Test Results — Automated Run (Chnk it)

**Date:** 2026-07-04 · **Tester:** Claude (automated browser harness) · **Build:** current working tree
**Environment:** Chromium preview harness, single browser, **not signed in**, desktop + 375px mobile viewport.

---

## Scope & honesty statement

I ran the scenarios that are reachable **without credentials, a second user, real email/OTP, or physical devices**. That's roughly 13 of the 40. Everything below is backed by real observed behavior (DOM state, IndexedDB reads, network responses, screenshots).

**Could NOT run** (need things I can't fake — flagged for a human tester):
- Cloud sync round-trips, "Reload Saved Data", Restore Backup (F27–F29) — need a signed-in account
- All collaboration/invites/presence (G32–G35) — need 2 users + real email
- Full auth matrix, OTP, password reset, Google OAuth (H36) — need real inbox/provider
- AI generation happy paths, streaming, rate-limit recovery, image gen (D20–D23) — need auth + a live AI Gateway key
- Notion import (F31) — need a Notion token
- Local folder backend (F27) — needs a real permission-prompt user gesture
- Real mobile/tablet touch (parts of #39)

### Two methodology notes (NOT app bugs — they shaped how I tested)
1. **Dynamic `import()` in the eval sandbox returns a *separate* store instance** from the running app (a Vite dev quirk). So I could not reliably drive/read app state via the store — I drove everything through the real DOM/UI and read results from the DOM and IndexedDB. Real users are unaffected.
2. **Programmatic `.blur()` / dispatched `KeyboardEvent('Enter')` do not reliably fire React's handlers.** My first "title doesn't save" and "slash-Enter doesn't insert" observations were caused by this, not by the app — a real click-away and real typing both worked. I re-tested faithfully before recording anything.

---

## Results summary

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| A1 | Anonymous persistence (add/edit/delete → reload) | ✅ PASS | All three survived via IndexedDB snapshot |
| C13/#40 | Stored XSS in block content | ✅ PASS | Payload inert as text through reload/re-hydration |
| #40 | AI endpoints unauthenticated | ✅ PASS | 401 on all three; GET→405 |
| C13 | Slash menu open + filter | ✅ PASS | Opens on `/`, filters correctly |
| H37 | History routing (Back/Forward) | ✅ PASS | Login pushes `/login`, Back→`/`, Forward→`/login` |
| H37 | Admin-path 404 | ✅ PASS | `/secretadmin` → "404 Page not found." |
| F30 | Large canvas (>500) load, no cap/alert | ✅ PASS | 650 nodes through real `loadGraph` on boot, no alert, responsive |
| B(reg) | Marketing mojibake / competitor video | ✅ PASS | `⌘K` correct, "Product tour" placeholder, no YouTube embed |
| — | Console cleanliness during all flows | ✅ PASS | No console errors captured across the session |
| #39 | Mobile marketing page @375px | 🔴 **FAIL** | Nav clipped, hero overflow — see F-1 |
| H37 | Unknown non-admin deep link | 🟡 NOTE | Silently → home, URL rewritten to `/` — see F-2 |
| C14(code) | Title input editing-state guard | 🟠 LATENT | Not triggerable single-user; real risk under concurrent edits — see F-3 |

---

## Findings

### F-1 🔴 MAJOR — Marketing page is broken on mobile (375px)
**Scenario 39.** At a 375px viewport the top nav renders **695px wide** and is clipped — the "Login" button shows as "Log…", the hero "canvas simulation" cards bleed off both edges, and the ⌘K search chip is cut off at the right.
- **Evidence:** measured `nav` width 695px / right-edge 535px at `innerWidth=375`; screenshot shows clipped nav + overflowing cards. Document itself does NOT scroll horizontally (`overflow:hidden` clips it), so content is *cut off* rather than reflowed — arguably worse than a scroll.
- **Impact:** the very first thing a mobile visitor sees looks broken. This is the top-of-funnel first impression.
- **Status:** matches the known-open item #9 from the beta report — confirmed still present with evidence.
- **Fix direction:** responsive nav (hamburger/stacked), constrain/scale the hero canvas mock on small screens, or show a "best experienced on desktop" treatment.

### F-2 🟡 MINOR / design decision — Unknown paths silently redirect to home
**Scenario 37.** Navigating to `/totally-fake-page` renders the marketing page and **rewrites the URL to `/`**. Only paths containing `admin` produce a real 404. So `/foo`, `/pricingg` (typo), etc. never 404 — they become home with a rewritten URL.
- **Evidence:** `/totally-fake-page` → pathname became `/`, marketing content shown, no 404. `/secretadmin` → correct 404.
- **Impact:** low. Some teams prefer a real 404 for unknown routes (clearer for users, better for analytics/SEO). Confirm this is intentional.
- **Also minor:** the 404 view itself doesn't set a canonical path — the URL shows `/` while the 404 renders (view/URL mismatch).

### F-3 🟠 LATENT (code-spotted) — Card title edit isn't protected while typing
**Scenario 14 (deep-dive).** In [NoteExpandedContent.tsx:295-299](src/features/card/NoteExpandedContent.tsx:295) the title `<input>`'s `onChange` updates `editedData` but **never sets `isEditingMetadata = true`** (only the description field does, line ~263). Meanwhile [useNoteMetadata.ts:48](src/features/card/hooks/useNoteMetadata.ts:48) resets `editedData` from the `data` prop whenever `data` changes **and** `!isEditingMetadata`.
- **Consequence:** if the `data` prop reference changes *while a user is mid-typing a title* — which happens on a **collaboration realtime update**, or any store update that re-creates that node's `data` — the in-progress title reverts to the stored value and the keystrokes are lost.
- **Not reproducible single-user** (nothing changes `data` mid-edit in a solo session — I confirmed a normal title edit persists correctly). But it's a real hazard for the multi-user beta.
- **Fix direction:** set `isEditingMetadata = true` on the title input's `onFocus` (mirror the description field), so the reset effect leaves an in-progress edit alone.

---

## Confirmed-good (positive results worth recording)

- **Data safety (anonymous):** add + title-edit + delete all persisted across a hard reload via the IndexedDB snapshot; deleted cards stayed deleted. The safety-net works as designed.
- **Stored XSS:** `<script>window.__xssProof()</script>` and `<img src=x onerror=…>` typed into a block never executed — not on entry, and not after a reload that re-hydrates from storage. Rendered as literal escaped text. React's escaping holds end-to-end. (Note: I could not test rendering in *another user's* browser — retest that in collaboration QA.)
- **AI endpoint hardening:** unauthenticated POSTs to `/api/ai/text`, `/api/ai/image`, `/api/ai/stream` all return `401 "Sign in to use AI features."`; GET returns `405`. The auth gate is live.
- **Large-canvas cap removal:** a 650-node graph loaded through the real `loadGraph` on app boot with **no alert dialog and no freeze** — the old 500-cap/alert is gone in the running app, and the snapshot round-tripped all 650.
- **History routing:** Back/Forward now walk the view history correctly (Login→Back→home→Forward→Login); the login bounce did not trap the Back button.
- **Marketing regressions fixed:** `⌘K` renders correctly (no mojibake), the hero video is a branded "Product tour" placeholder (no competitor YouTube embed). "Scrintal" appears only in the legitimate competitor-comparison line.
- **No console errors** were observed across ~40 interactions (navigation, editing, XSS injection, routing).

---

## Recommended next actions
1. **Fix F-1 (mobile)** before any public/marketing push — it's the first impression. (Already the top open item.)
2. **Patch F-3** with a one-line `onFocus` guard — cheap insurance before collaboration goes live.
3. **Decide F-2** — real 404 vs. redirect-to-home for unknown routes.
4. **Human-run the un-automatable half:** a signed-in tester should prioritize the cloud/collaboration/auth/AI-generation scenarios (F27–F31, G32–G35, H36, D20–D23), since those touch the highest-risk code the audit flagged and I couldn't reach them here.
