# Automated QA suite — Playwright

Automation of `QA_TEST_SCENARIOS.md`. Scenario IDs are carried into test titles
(`A1`, `B6c`, `I40`…) so a failing test points straight at the manual scenario
it came from.

## Running

```bash
npm run test:e2e
```

| Command | What it runs |
|---|---|
| `npm run test:e2e` | Everything (~3.5 min, 2 workers) |
| `npm run test:e2e:smoke` | Tier 0 — does the app stand up (~30s) |
| `npm run test:e2e:core` | Tier 1 — persistence, cards, blocks, graph |
| `npm run test:e2e:advanced` | Tier 2 — security, AI gating, search, scale |
| `npm run test:e2e:mobile` | Tier 3 — 375px reality check |
| `npm run test:e2e:ui` | Playwright's watch/debug UI |
| `npm run test:e2e:headed` | Watch a run in a real browser window |
| `npm run test:e2e:report` | Open the HTML report from the last run |
| `npm run test:e2e:legacy` | The older flat specs in `e2e/` |

Filter to one scenario with `-g`:

```bash
npx playwright test -g "B6c"
```

The config starts `npm run dev` itself and reuses a dev server already
listening on 5173. Point it elsewhere with `PW_BASE_URL`:

```bash
PW_BASE_URL=https://staging.example.com npx playwright test --project=smoke
```

## Layout

```
playwright.config.ts          tiers as projects; webServer; reporters
playwright.legacy.config.ts   opt-in runner for the old flat specs
e2e/support/
  fixtures.ts                 console/pageerror capture, auto-applied
  snapshot.ts                 IndexedDB state oracle + canvas seeding
  canvas.ts                   interaction helpers (create, select, delete…)
e2e/scenarios/
  smoke/       S01-S07        app shell, routing, theme, persistence net
  core/        A*, B*, C*     persistence, cards, blocks, graph
  advanced/    D19, E26, F30, I40
  mobile/      I39
```

## Two decisions worth knowing

**The state oracle is IndexedDB, not the DOM.** The canvas runs React Flow with
`onlyRenderVisibleElements`, so a card that exists is not necessarily mounted,
and creating a card re-centres the viewport. Counting `.react-flow__node` is
therefore meaningless. `support/snapshot.ts` reads the `chnk-it-local` snapshot
— the same document every persistence backend writes — so assertions describe
what the app *holds*, not what happens to be on screen. `waitForSnapshot()`
polls it and prints the actual document when it times out.

**Every test fails on a browser error.** The `consoleErrors` fixture is `auto`,
so an uncaught exception or `console.error` fails an otherwise-green test. Opt
out for a test that deliberately provokes one:

```ts
test.use({ allowConsoleErrors: true });
```

Known noise lives in the `IGNORED` list in `support/fixtures.ts`. Anything
added there needs a comment saying why, and a real defect parked there needs a
dedicated test that owns it (see S07) so one bug produces one failure.

## Gotchas the helpers already handle

- **Selecting a card focuses its editor.** Canvas shortcuts bail out when focus
  is in an editable field, so `Delete` edits text instead of deleting the card
  and `f` is typed into the note. Use `deleteNode()` / `focusNode()`, which
  blur first.
- **Escape clears the canvas selection.** Don't press it between two clicks of
  a multi-select.
- **Every mounted card renders its own toolbar.** A page-wide
  `getByTitle('Center Peek')` happily resolves to an off-screen card's copy —
  always scope to the node.
- **Cards created near the top sit under the fixed top bar**, which intercepts
  their toolbar clicks. `focusNode()` centres the card first.
- **Real shortcuts** (from `CanvasBoard.tsx`): `Ctrl+N` new card, `Ctrl+D`
  duplicate, `5` fit view, `f` focus, `k` shortcuts panel, `l` linking mode.

## Seeding a big canvas

Building 60 cards through the UI costs minutes and re-tests card creation.
`seedSnapshot()` writes a document straight into the store and reloads, which
is the same path a returning user takes:

```ts
await page.goto('/canvas');
await seedSnapshot(page, makeCards(60));
```

## Not automated here

Deliberately out of scope, still manual:

- **Auth (H36–H38)** — needs real inboxes for OTP and password reset, and a
  Google OAuth round trip.
- **Collaboration (G32–G35)** — two authenticated users, realtime, RLS.
- **AI happy paths (D20–D23)** — needs a signed-in account and burns quota;
  only the signed-out gate (D19) is automated.
- **Local folder (F27)** — File System Access API needs a real directory grant.
- **Cloud sync and backups (F28–F29)** — needs a Supabase session.
- **Notion import (F31)** — needs a Notion token.
- **Paste fidelity (C15)** — pasting from Word/Notion needs real system
  clipboard payloads.
- **Cross-browser (★ scenarios)** — only Chromium is installed. Add Firefox and
  WebKit projects after `npx playwright install firefox webkit`.
