# QA Test Scenarios — Chnk it (Infonote) Beta

40 realistic end-to-end scenarios written from a real user's perspective. Each one chains
multiple features the way actual users will, and each ends with **Watch for** — the specific
failures most likely to occur based on the pre-beta code audit.

**How to use:** run in order within a category (later scenarios reuse earlier state).
Log every deviation, even cosmetic. Test on Chrome first (baseline), then repeat the
starred (★) scenarios on Firefox, Safari, and Edge.

**Legend:** 🔴 data-safety critical · 🟠 core flow · 🟡 polish

---

## A. First-run experience & persistence (the "can I trust this app?" tests)

### 1. 🔴 ★ Anonymous first visit — work, close, return
**Persona:** curious visitor from the marketing page, not signed up.
1. Open the site in a fresh browser profile (no cookies/storage). Land on the marketing page.
2. Check every hero visual: no garbled characters (⌘K chip), video placeholder shows "Product tour", no competitor branding.
3. Click through to the canvas without signing up.
4. Delete one demo card. Add 3 new note cards; type a distinct title and 2–3 paragraphs into each.
5. Wait ~5 seconds. Close the tab **without** using any save button. Reopen the site → `/canvas`.
- **Expected:** all 3 cards return with full content; the deleted demo card stays deleted.
- **Watch for:** content loss after refresh (IndexedDB snapshot restore), beforeunload dialog appearing even after autosave, demo cards resurrecting.

### 2. 🔴 Anonymous work → sign up → nothing lost
1. Continue from scenario 1 with unsaved anonymous work on the canvas.
2. Sign up with a fresh email. Complete OTP verification.
3. Return to the canvas after the welcome modal.
- **Expected:** anonymous cards are still on the canvas AND get pushed to the new (empty) cloud workspace automatically (auto-sync is on by default). Verify by opening the same account in a second browser — the cards should appear.
- **Watch for:** the canvas wiping to empty on first sign-in (empty-cloud load), cards present locally but never reaching the cloud, welcome modal navigation dead-ends.

### 3. 🔴 Crash simulation — kill the tab mid-edit
1. Signed in, type continuously into a card for 10 seconds.
2. Within 1 second of your last keystroke, kill the tab from the browser task manager (not a normal close — no beforeunload).
3. Reopen the app.
- **Expected:** at most the final ~1 second of typing is lost (800ms snapshot debounce + 1.2s cloud debounce).
- **Watch for:** losing the whole editing session, snapshot restoring stale content over newer cloud content.

### 4. 🔴 Offline session
1. Signed in, with cloud-synced content. Open DevTools → Network → set Offline.
2. Add 2 cards, edit 1 existing card, delete 1 card. Note the cloud status indicator.
3. Stay offline 2 minutes, keep editing. Go back online. Wait ~5 seconds.
- **Expected:** clear "offline / not synced" indication while offline; on reconnect, all changes (including the deletion) sync automatically; second browser confirms.
- **Watch for:** silent sync failures, the deleted card returning after reconnect, error banners that never clear.

### 5. 🟠 Two tabs, same account
1. Open the canvas in two tabs of the same browser, same account.
2. In tab A create a card "FROM-A"; in tab B create "FROM-B" within a few seconds.
3. Edit the SAME card's text in A, then in B, alternating.
4. Close both tabs, reopen once.
- **Expected:** both cards survive; last edit wins on the contested card without corrupting its blocks.
- **Watch for:** one tab's card vanishing (realtime reload replacing state), duplicated cards, IndexedDB snapshot ping-pong between tabs.

---

## B. Canvas & cards (core manipulation)

### 6. 🟠 Card lifecycle marathon
1. Create a note card via each entry point: the + button, Ctrl+N, double-click/slash menu on empty canvas, and Enter.
2. On one card: set an icon, an emoji, a cover image, a description, and a background color.
3. Expand it (Open Card), then Full Screen, then Side Panel Left, Side Panel Right, Center Peek — in that order, closing each with Esc.
4. Resize the card to minimum, then very large. Duplicate it with D. Delete the duplicate.
- **Expected:** every entry point creates a card at a sensible position; all 5 view modes open/close cleanly; styling persists through view changes and a reload.
- **Watch for:** Esc closing the wrong layer, color styling bleeding into the editor text colors, resize snapping wrong (56px vs 112px grid inconsistency), stale focus after closing fullscreen.

### 7. 🟠 Multi-select operations
1. Create 6 cards. Box-select 4 of them by dragging on empty canvas.
2. Use the multi-selection toolbar: apply a color to all, then duplicate all, then arrange as grid, then circle, then mindmap-horizontal.
3. Shift-click to deselect 2, press Delete to remove the rest.
4. Undo everything step by step back to the 6 original cards.
- **Expected:** each bulk operation affects exactly the selected set; each undo reverses exactly one operation.
- **Watch for:** arrange modes overlapping cards, undo skipping steps or merging bulk ops into wrong granularity, selection surviving into cards where it shouldn't.

### 8. 🟠 Connections & edges
1. Create 3 cards A, B, C. Drag a connection A→B and B→C.
2. Click edge A→B, use the edge toolbar: change its style/color, bring to front, duplicate it, then delete the duplicate.
3. Try to connect A→A (self-loop).
4. Enable linking mode (L), link C to A. Delete card B.
- **Expected:** self-loop is rejected; deleting B removes its edges; edge styling persists after reload.
- **Watch for:** orphan edges after node deletion, edge selection stuck after delete, linking mode not exiting.

### 9. 🟠 Nested pages & breadcrumbs
1. Create card "Project X". Open it and add a `page` block (or drag a card into it to nest).
2. Navigate into the nested page. Create 2 more cards inside. Nest one level deeper.
3. Use breadcrumbs to jump to the root, then browser Back to return to the deepest level.
4. Reload the browser at the deepest level.
- **Expected:** breadcrumbs always reflect the real path; Back button walks the navigation history; reload restores the same nesting level (parent ID persisted).
- **Watch for:** breadcrumb reconstruction failing after reload, Back exiting the site instead of going up a level, nested content loading empty.

### 10. 🔴 Fuse & split round-trip
1. Create 3 cards with distinct multi-block content. Select all 3 and fuse them.
2. Verify the fused note contains every block in visual order.
3. Split the fused note at the middle block.
4. Release the remaining fused content back to standalone blocks on the canvas.
- **Expected:** zero content lost across fuse → split → release; block order matches on-canvas visual order (top-to-bottom, left-to-right).
- **Watch for:** blocks dropped or duplicated during fusion, `_lostContent` warnings in console, undo after fuse restoring ghosts.

### 11. 🟠 Drag chips & cross-card block moves
1. Open card A (expanded) with 5 blocks. Drag block 3 out onto the canvas → it should become a standalone block node.
2. Drag that standalone block into card B's expanded editor.
3. Drag 2 blocks at once (multi-select in editor first) from B to A.
- **Expected:** source card loses the block, target gains it, empty fused-notes clean themselves up; the drag chip visual follows the cursor.
- **Watch for:** blocks duplicating instead of moving, drop targets not highlighting, the multi-drag cleanup leaving selection state stuck (window event `chnk-it-clear-selection`).

### 12. 🟡 Zoom, minimap, viewport
1. Create 20 cards spread widely. Use zoom out to minimum, zoom in to maximum, Fit View (5), and Focus (F) on a selected card.
2. Drag the minimap viewport. Toggle interactivity lock, try to drag a card, unlock.
3. Reload — does the viewport position restore?
- **Watch for:** fit view ignoring far-flung cards, focus animating to wrong coordinates, locked mode still allowing edits via keyboard.

---

## C. Block editor (the Notion-parity tests)

### 13. 🟠 Every block type, one document
1. In one expanded card, use the slash menu to insert every block type: text, H1–H3, bullet, numbered, todo, toggle, callout, code, quote, divider, table, smart link, image (upload), video (embed), file, columns, color block.
2. Type real content into each. Collapse and expand the toggle. Check a todo. Fill 2×3 table cells.
3. Reload and re-verify every block renders with its content.
- **Expected:** all block types survive reload; slash menu filters correctly as you type (e.g. `/tod`).
- **Watch for:** table cell contents lost, code block escaping/HTML injection issues (type `<script>alert(1)</script>` — must render as text), toggle state persistence, column layout collapsing.

### 14. 🟠 Keyboard-only writing session
Without touching the mouse:
1. Create a card (Ctrl+N), open it, and write a structured doc: heading, 3 bullets, Tab to indent bullet 2 under 1, Shift+Tab back, a todo list, Enter on expanded toggle (should indent inside).
2. Move a block up/down with Ctrl+Shift+↑/↓. Duplicate one with Ctrl+D.
3. Backspace at the start of a block to merge up; Backspace on an empty bullet (should convert to text, then delete).
4. Ctrl+A once (select all text in block), Ctrl+A again (select all blocks), then press Delete. Undo.
- **Expected:** every shortcut works as the shortcuts panel (K) documents; the double-Ctrl+A escalation selects all blocks; Delete on the block selection removes them; undo restores.
- **Watch for:** the multi-select Delete doing nothing or deleting the wrong block, caret landing in wrong position after merges, focus jamming after block deletion (known focus-restoration edge).

### 15. 🟠 Paste torture test
1. Paste from a real Notion page (rich content: headings, lists, checkboxes).
2. Paste from MS Word (heavy inline styles), from a webpage with images, plain text with 50 lines, and a markdown snippet (`# Title`, `- [ ] task`, code fences).
3. Paste an image directly from clipboard (screenshot).
- **Expected:** structure maps to native blocks (not one giant text blob), no style bleed (fonts/colors from Word), images embed.
- **Watch for:** HTML leaking as literal tags, paste creating hundreds of empty blocks, clipboard images failing silently.

### 16. 🟡 Selection popover & floating toolbar
1. Select text inside a block → floating toolbar appears. Apply bold, italic, inline code; then a link.
2. Select across two blocks — what happens?
3. Use the selection capsule/popover actions on a full block selection (color, convert type).
- **Watch for:** toolbar positioning at screen edges, formatting applied to wrong range, link editing UX dead-ends.

### 17. 🟠 Long document performance
1. In one card, paste a document with 300+ blocks (generate by pasting a long article 5×).
2. Scroll through it (virtualized list should kick in). Type in the middle. Use the outline panel (T) to jump between headings.
3. Search within the card (Ctrl+F) for a word near the bottom.
- **Expected:** no input lag > ~100ms while typing; outline jumps land accurately; search finds and scrolls.
- **Watch for:** virtual list blank gaps while scrolling, caret jumps during background re-renders, the 300ms debounced save dropping keystrokes.

### 18. 🟡 Undo/redo granularity
1. Type a sentence, pause 2s, type another. Undo → only the second sentence should vanish (coalescing).
2. Drag a card, undo → returns in one step. Do a 4-card bulk color, undo → one step.
3. Redo everything with Ctrl+Y and the toolbar redo button. Do 210 operations, then hold undo — history is capped at 200.
- **Watch for:** clicking a card creating phantom undo steps (selection filtering), undo across a cloud reload corrupting state, redo diverging after a new edit.

---

## D. AI features (auth-gated, rate-limited)

### 19. 🟠 AI while signed out
1. Sign out. Open the AI panel (Ctrl+J) and submit a prompt.
- **Expected:** a clear "Sign in to use AI features." message — not a spinner, not a raw 401, not a crash.
- **Watch for:** infinite loading states, the error message appearing behind the panel.

### 20. 🟠 AI generation happy paths
Signed in:
1. "create 5 cards about the Roman Empire" → 5 positioned cards with distinct content in preset palette colors.
2. "kanban board for a product launch" → board with sensible columns.
3. "mindmap of machine learning" → connected mindmap structure.
4. "create a fusednote with a to do list for onboarding" → fused note with checkable todos.
5. Streaming: use inline AI writing in a card — text should stream in progressively.
- **Watch for:** cards stacking at identical coordinates, JSON parse fallback producing one giant text card, `<think>` tags leaking into card content, mindmap edges not rendering, undo after AI insert removing only half the cards.

### 21. 🟠 AI rate limit & recovery
1. Fire ~35 quick AI text requests in under a minute (spam the panel).
- **Expected:** around request 31, a friendly "Too many AI requests. Try again in N seconds." — the app stays usable, and after the window expires requests work again.
- **Watch for:** the panel wedging in loading state, retry storms, the alert firing repeatedly.

### 22. 🟡 AI image generation
1. Generate an image ("watercolor fox") into a card. Resize it. Reload.
2. Generate 11 images rapidly → the 11th should rate-limit (10/min).
- **Watch for:** base64 images bloating the canvas save (check save latency after), broken image placeholders after reload.

### 23. 🟠 Chunk It & auto-summarize
1. On a card with a long document, run "Chunk It" — content should split into multiple atomic cards.
2. Use the "Auto-summarize content" button on a card description.
3. Undo the chunk operation.
- **Watch for:** chunking losing blocks or metadata, summary overwriting a manually written description without confirmation, undo leaving both the original AND the chunks.

---

## E. Kanban, views & structured data

### 24. 🟠 Kanban full workflow
1. Add a Board view. Create 3 columns with custom names/colors and 6 cards across them.
2. Drag cards between columns; drag a NOTE card from the canvas into a kanban column.
3. Open a kanban card's modal: set status, priority, due date, assignee, progress, 3 subtasks (check 2), and a URL property.
4. Switch the same board to Table view, then Calendar (cards with due dates should appear on their days), then Timeline.
5. Reload and re-verify all four views.
- **Watch for:** property edits not persisting across view switches, calendar misplacing dates (timezone!), dragging canvas card into column losing its content, column reorder not saving.

### 25. 🟡 Properties panel on note cards
1. On a regular note card, open the properties panel and add every property type.
2. Set a date with the custom date-time picker — try typing a date manually, picking from calendar, and clearing it.
3. Set progress to 0%, 50%, 100%.
- **Watch for:** date picker keyboard input validation, properties panel overflow on small cards, property removal leaving orphan metadata.

### 26. 🟡 Search & outline across everything
1. With 30+ cards including kanban and nested pages, search (Ctrl+F) for: an exact card title, a word inside a deep block, a word inside a kanban card, a word in a NESTED page.
2. Click each result — should navigate/zoom to the hit, including drilling into nested pages.
- **Watch for:** search worker missing kanban/nested content, results pointing at deleted nodes, no keyboard navigation in results.

---

## F. Storage backends & sync controls

### 27. 🔴 ★ Local folder round-trip (Chromium only)
1. Click the local folder control, grant a directory. Verify the status icon changes and files appear in the folder.
2. Edit cards → files update (check the folder's modified time). Disconnect. Reconnect after adding a card — new state saves.
3. Revoke folder permission via browser settings, then edit a card.
4. On Firefox/Safari: the local folder button should be hidden or clearly explained — not silently broken.
- **Watch for:** the revoked-permission edit failing SILENTLY (audit finding C2: errors are swallowed), auto-reconnect on startup failing without any message, dev/prod behavior differences.

### 28. 🔴 Cloud save / reload / restore backup
1. Signed in, make 5 distinct edits. Open the cloud modal: force a full save.
2. Make 3 MORE local edits, then use "Reload Saved Data" → confirm it warns and that after reload the 3 newer edits are gone (expected!) but…
3. …use "Restore Backup" → the 3 newer edits should come back.
4. Reload the page. Is the backup still offered? (It's localStorage — should be.)
- **Watch for:** backup restore silently failing, the reload picker loading a partial page-set incorrectly, cloud timestamps displaying wrong.

### 29. 🔴 Auto-sync toggle semantics
1. Turn auto-sync OFF in the cloud modal. Edit cards → status should show "not synced" and STAY unsynced.
2. Reload the app — auto-sync must STILL be off for this workspace (per-workspace opt-out).
3. Manually save. Turn auto-sync back on → edits should now sync within ~1.2s of each change.
- **Watch for:** the toggle resetting to ON after reload (regression area), manual save force-enabling auto-sync unexpectedly (it does — is that intended UX? flag it), dirty indicator lying.

### 30. 🔴 Large canvas stress (cap was just removed)
1. Import or generate 800+ cards (use the AI multi-card repeatedly, or `npm run stress:canvas` data).
2. Measure: initial load time, pan/zoom FPS feel, typing latency in a card, save duration (watch the saving indicator), reload time.
3. Delete 200 cards at once. Undo.
- **Expected:** usable (even if slower); no alert, no truncation — count must stay exact through save → reload → cloud reload on second device.
- **Watch for:** THE CRITICAL ONE — exact node count preserved end-to-end now that the 500 cap is gone; upsert batching (500/chunk) erroring on big saves; browser tab memory ballooning past ~1.5GB.

### 31. 🟠 Notion import
1. Connect a Notion token, search for a page, import a page with: nested sub-pages, toggles, images, a database.
2. Verify structure maps to cards/blocks sensibly. Import the SAME page again — duplicate handling?
- **Watch for:** deep nesting (>8 levels) silently truncated, images hotlinked to expiring Notion URLs (check after an hour), import freezing on large pages with no progress indication.

---

## G. Collaboration & workspaces

### 32. 🔴 ★ Invite flow end-to-end
1. User A: open Share Workspace, invite User B's email as **editor**. Check the email arrives (Resend) and the link format.
2. User B (fresh browser, no account): click the invite link → should route through signup/login and land in the shared workspace with a confirmation banner.
3. User B edits a card. User A should see the change (after B's auto-sync + A's realtime reload).
4. Repeat with a **viewer** role invite for User C — C must NOT be able to edit.
5. Try an already-used invite link, an expired/invalid UUID, and inviting the same email twice.
- **Watch for:** invite accept looping back to login, viewer role still allowing edits (RLS check!), invalid-invite banner never dismissing, rate limit after 10 invites/min behaving badly.

### 33. 🔴 Concurrent editing conflict
1. A and B both in the shared workspace, both editing simultaneously.
2. A creates card "ALPHA" while B creates "BRAVO" within the same 5 seconds. Both auto-sync.
3. Wait 10s. Check BOTH canvases show BOTH cards.
4. A edits card X's title while B edits X's body at the same time.
5. B deletes card Y while A is actively typing in Y.
- **Expected:** no card loss (deletes are scoped to explicit deletions); step 4 may last-write-win per field or whole-card — document which; step 5 should not crash A's editor.
- **Watch for:** A's save erasing B's new card (the delete-scoping regression), A's typing resurrecting deleted card Y as a ghost, realtime reload interrupting A's typing (there's an isTyping guard — verify it works).

### 34. 🟠 Presence & live cursors
1. A and B on the same canvas: verify each sees the other's named, colored cursor moving.
2. B navigates into a nested page — A's view of B's cursor should disappear (different canvas scope).
3. B closes the tab — cursor should vanish within seconds, not linger.
- **Watch for:** cursor color collisions, stale presence after disconnect, cursors rendered at wrong coordinates after zoom.

### 35. 🟠 Workspace switching
1. User with 2 workspaces (own + shared): switch between them via the profile/workspace UI.
2. Verify canvases are fully isolated — no cards bleeding across. Check the auto-sync toggle state is remembered PER workspace.
3. Leave the shared workspace (or get removed by the owner) while having it open.
- **Watch for:** removal while active causing infinite error loops, workspace switch not clearing undo history (undoing into the other workspace's state!), snapshot restore mixing workspaces after switch.

---

## H. Auth, routing & app shell

### 36. 🟠 ★ Full auth matrix
1. Signup with a weak password, an invalid email, an already-registered email — each should give a specific, human error.
2. Signup correctly → OTP page: enter wrong code 3×, request resend, enter correct code.
3. Logout. Login with wrong password, then right one. Use "forgot password" → email → `/update-password` link → set new password → verify old one is dead.
4. Google OAuth: full round trip, plus cancel mid-flow (should return gracefully, not white-page).
- **Watch for:** OTP resend having no cooldown feedback, the update-password page consuming its token after my routing changes (the URL hash must survive), OAuth error alert loop.

### 37. 🟠 Browser navigation & deep links
1. Walk: marketing → login → (sign in) → landing → canvas → profile. Now press Back 4 times, Forward 4 times.
2. Deep-link directly to `/canvas`, `/profile`, `/marketplace`, `/nonexistent-path`, `/wajihadmin` (as non-admin), and `/somethingadmin`.
3. While signed in, open `/login` directly — should bounce to landing WITHOUT trapping the Back button (press Back after the bounce).
- **Expected:** Back/Forward walk the exact view history; unknown paths behave sensibly; admin paths 404 for non-admins.
- **Watch for:** Back-button loops on the login bounce, deep links flashing the wrong view first, pushState stripping OAuth/invite query params.

### 38. 🟡 Theme, shortcuts panel, error boundary
1. Toggle light/dark repeatedly, including with an expanded colored card open — check text contrast in both themes on colored cards.
2. Open the shortcuts panel (K) and spot-check 5 documented shortcuts actually work.
3. Force an error: (dev-only) throw in a component or corrupt a card's data via console — the error boundary should show "Something went wrong" with a working Reload, not a blank page. After reload the canvas must restore from snapshot.
- **Watch for:** colored cards unreadable in light mode, the error boundary swallowing the whole app for a single bad card (consider per-card boundaries — improvement item).

---

## I. Cross-cutting: devices, browsers, abuse

### 39. 🟠 ★ Mobile & tablet reality check
1. On a real phone (or 375px viewport): marketing page — no horizontal scroll, readable nav, tappable CTAs.
2. Attempt the canvas on mobile: pan with one finger, pinch zoom, tap to open a card, type in a block.
3. Tablet (768px) with touch: drag a card, drag a block, use the bottom menu.
- **Expected (current known state):** marketing was broken at 375px pre-fix — verify current behavior; canvas is desktop-first, so at minimum there should be a graceful "best on desktop" experience, not a broken one.
- **Watch for:** navbar clipping, bottom menu overlapping browser chrome, touch-drag conflicting with pan, keyboard covering the editor with no scroll-into-view.

### 40. 🔴 ★ Security-minded user (abuse paths)
1. Signed out, POST directly to `/api/ai/text`, `/api/ai/image`, `/api/ai/stream` (curl/fetch) → all must return 401. Signed in, pass `"model": "openai/o3-pro"` in the body → server must use its own model regardless (verify response doesn't reflect the requested model).
2. Paste `<img src=x onerror=alert(1)>` and `javascript:alert(1)` as a link URL into blocks — nothing may execute, ever (check after reload too, and on ANOTHER user's browser via the shared workspace — stored XSS).
3. As workspace **viewer** (from #32), attempt writes via the UI and via direct Supabase REST calls with your own token — RLS must reject.
4. Try to read another user's canvas by guessing IDs in API/Supabase calls.
5. Invite-spam: fire 12 invites in a minute → 429 with Retry-After; verify the invite email's HTML escapes a workspace named `<b>"Pwn & Co"</b>`.
- **Watch for:** ANY script execution from card content (highest severity — it syncs to collaborators), RLS gaps on canvas_nodes/edges, AI endpoints honoring client model names.

---

## Reporting template

For each finding:
```
Scenario #: 
Step: 
Expected: 
Actual: 
Severity: blocker / major / minor / polish
Browser & OS: 
Repro rate: always / sometimes (x/y) 
Console errors: (paste)
Screenshot/video: 
```

## Suggested priority order for one QA pass
1. **Day 1:** A1–A5, F30, G32–G33 (data safety + collaboration — the trust killers)
2. **Day 2:** B6–B11, C13–C15, H36–H37 (core creation flows + auth)
3. **Day 3:** D19–D23, E24–E26, F27–F29, F31 (AI, views, storage controls)
4. **Day 4:** remaining 🟡 polish + I39–I40 + cross-browser ★ repeats
