# QA commands and evidence

`scenarios/core/canvas-node-interaction.spec.ts` covers the shared drag/select/edit rule and hover toolbar across canvas node renderers, including native iframe and connection gestures. `editor-reading.spec.ts` selects a passive node before editing its content; the first body click deliberately does not edit.

Run the commands below from the repository root. `beta/` owns production testing; diagnostic suites remain opt-in.

## Production quality gate

SCRUM-23 covers single/Shift/box selection, bulk movement and Undo/Redo,
branch-safe copy/cut/paste across canvases, menu/keyboard parity, permission
failure recovery, editor key ownership, bulk color/duplicate and mixed batches.
From `beta/`, run:

```sh
node scripts/check-graph-clipboard.mjs
node ./node_modules/@playwright/test/cli.js test e2e/scenarios/core/scrum-23.spec.ts --project=core --headed --workers=1
node ./node_modules/@playwright/test/cli.js test e2e/scenarios/core/scrum-23.spec.ts --project=firefox --project=webkit --project=small-screen --headed --workers=1
```

See the [technical report](../qa/scrum-23/REPORT-EN.md) and
[Tunisian Arabic report](../qa/scrum-23/REPORT-TN.md). Native copy/cut/paste uses
the real browser clipboard. External HTML/text inputs and denied permissions
are controlled fixtures; Chromium also tests a real granted menu read.
The Windows WebKit port returns empty flavors for custom clipboard writes;
its native shortcut scenarios validate the visible session recovery path. A
separate engine probe documents that transport limit. Each
scenario has a fresh context and the suite must run with one worker because
native clipboard state is shared by the desktop.

SCRUM-19 covers card creation, title/description persistence, independent copies,
protected branch deletion and recovery, hover resizing, and readable standalone
text layout. From `beta/`, run:

```sh
node --experimental-strip-types --test scripts/card-lifecycle.spec.ts
node ./node_modules/@playwright/test/cli.js test e2e/scenarios/core/scrum-19.spec.ts --project=core --headed --workers=1
node ./node_modules/@playwright/test/cli.js test e2e/scenarios/core/scrum-19.spec.ts --project=firefox --project=webkit --project=small-screen --headed --workers=1
```

See its [English report](../qa/scrum-19/REPORT-EN.md) and
[Tunisian Arabic report](../qa/scrum-19/REPORT-TN.md) for scenario coverage,
results, screenshots and the candidate manifest.

SCRUM-18 has a dedicated acceptance suite for guest entry, routing, the local
dashboard and keyboard-operated preferences. From `beta/`, run:

```sh
node --experimental-strip-types --test scripts/routes.spec.ts
node ./node_modules/@playwright/test/cli.js test e2e/scenarios/core/scrum-18.spec.ts e2e/scenarios/core/accounts.spec.ts --project=core --headed --grep "SCRUM-|R[1-4] |W1 " --workers=1
node ./node_modules/@playwright/test/cli.js test e2e/scenarios/core/scrum-18.spec.ts --project=firefox --project=webkit --project=small-screen --headed --workers=1
```

The [technical report](../qa/scrum-18/REPORT-EN.md) and
[Tunisian Arabic report](../qa/scrum-18/REPORT-TN.md) retain the acceptance
matrix, results and screenshots. The [QA addendum](../qa/scrum-18/QA-ADDENDUM-2026-10-20.md)
records the cross-browser rerun and the deferred Supabase/cloud scope. The
account-only dashboard case injects a test session.

```sh
npm run check
```

This runs strict lint, editor/reorder/transfer/lifecycle contracts, inline safety,
reading scheduling, local hydration/autosave/transaction/startup checks, metadata
cache checks, the PC folder-storage adapter checks, TypeScript/production build
and Knip. CI also runs the folder checks. Browser scenarios remain a separate gate:

```sh
npm run test:e2e
npm run test:e2e:browsers
```

The ordinary browser configuration still discovers only `e2e/scenarios/`. Diagnostic cases are not silently added to production acceptance.

Strict ESLint includes diagnostic TypeScript and current QA support/configuration;
`@typescript-eslint/no-explicit-any` remains an error. The AI diagnostic source
is `e2e/diagnostics/ai-audit/case-studies.spec.ts`, moved from the historical
`qa/ai-audit/` location and typed against `AppState`.

Knip declares `src/trials/main.tsx` as an additional entry because the standalone
`trials.html` page loads it directly. Its only directory ignore is
`qa/scrum-28/baseline-source/**`: immutable, partial source copies retained as
historical review evidence, whose old imports do not describe the current app.
This Knip exception does not exclude those files from ESLint or exclude live QA
scenarios from either tool. SCRUM-56's reproducible coverage probe is
`node qa/scrum-56/verify-lint-coverage.mjs` from `beta/`; it checks scope, rule
severity, rejection of a virtual `any`, acceptance of `unknown`, and the real
diagnostic/support/config files.

## Opt-in diagnostics

| Command | Purpose |
| --- | --- |
| `npm --prefix beta run test:diagnostics:cases` | Four project/research/editor/concurrency case studies; local server on 5190 |
| `npm --prefix beta run test:diagnostics:coverage` | Four search/outline/theme coverage cases; local server on 5191 |
| `npm --prefix beta run test:diagnostics:full` | Existing browser matrix, with zero retries and progress/JSON/HTML reporters; local server on 5188 |
| `npm --prefix beta run test:diagnostics:ai` | Thirteen AI diagnostics against an already running beta on 5174; the three `L* live` cases use the configured provider, while `D*` cases install their own stubs |
| `npm --prefix beta run check:diagnostics` | Supplemental pure-function contracts; produces a report and returns failure when an assertion fails |
| `npm --prefix beta run check:folder` | Existing PC filesystem-adapter correctness check |

Pass Playwright options after `--`, for example:

```sh
npm --prefix beta run test:diagnostics:full -- --project=core --grep "L3 cards fetch" --workers=1
npm --prefix beta run test:diagnostics:coverage -- --list
```

Direct CLI invocation from the repository root also works:

```sh
node beta/node_modules/@playwright/test/cli.js test --config=beta/e2e/config/jira-coverage.config.ts --list
node beta/scripts/diagnostics/run-jira-unit.mjs
```

## Responsibilities and output paths

```text
e2e/scenarios/             Regular browser regression scenarios
e2e/diagnostics/           Opt-in diagnostic scenario inputs
e2e/config/                Their run configurations and canonical path policy
e2e/reporters/             Progress reporter; receives its output path
scripts/diagnostics/       Supplemental contracts and their result-writing runner
qa/                       Benchmark fixtures and retained historical review artifacts
```

`e2e/config/diagnosticPaths.ts` resolves from its own file URL. Both beta-directory npm commands and root-directory direct invocation write new diagnostic results to the same repository locations:

```text
output/audits/diagnostics/ai-audit/  AI results and per-test evidence
output/audits/diagnostics/jira/      Supplemental JSON, browser JSON/HTML and traces
```

AI screenshots/JSON use `TestInfo.outputPath()` inside that run's test directory, including retries/project identity if enabled later. The progress reporter consumes the same configuration-owned output path rather than deriving another root.

These are working result directories: rerunning a configuration replaces its current reports and Playwright output. Archive accepted runs separately before reusing them as long-term evidence. Older `qa/` artifacts, `beta/output/` and dated audit directories were retained during Phase 1. They are not input files and were not deleted or moved into the new working paths.

The folder-storage adapter retains its existing unique `pc-folder-*` evidence under `output/audits/folder-autosave-2026-10-18/`; that historical folder name is not the execution date. Benchmark commands and fixture paths remain unchanged.

## SCRUM-27 structural blocks

The dedicated `scenarios/core/scrum-27.spec.ts` suite covers card, fused-note and standalone canvas blocks. Fixtures seed the real graph; scenarios then use visible controls and keyboard input, read the resulting store and reload from browser-local storage. Controlled external HTML paste and clipboard-denial cases are identified in the report. Code copy additionally reads the native Chromium clipboard.

Run from `beta/`, one CLI at a time because the browser projects share a Vite port and the operating-system clipboard:

```sh
node node_modules/@playwright/test/cli.js test e2e/scenarios/core/scrum-27.spec.ts --project=core --headed --workers=1
node node_modules/@playwright/test/cli.js test e2e/scenarios/core/scrum-27.spec.ts --project=firefox --project=webkit --project=small-screen --headed --workers=1
node scripts/check-structural-blocks.mjs
node scripts/check-local-autosave.mjs
```

Retained execution evidence and candidate identity: `qa/scrum-27/`. User-facing controls: `docs/TEXT-STRUCTURAL-BLOCKS.md`.

## SCRUM-28 inline formatting and links

`scenarios/core/scrum-28.spec.ts` covers native keyboard and toolbar interactions on cards, fused notes and standalone canvas text; nested editors and table cells; safe external links; internal page/source chips; and completed synthetic AI answer citations. Local reload is included. Cloud authentication/database saving and live AI calls are outside this suite.

Run from `beta/`, one CLI at a time (the projects share port 5188). Use a new output directory for each accepted evidence run:

```sh
npm run check:inline
npm run check:transactions
node scripts/check-structural-blocks.mjs
npx playwright test e2e/scenarios/core/scrum-28.spec.ts --project=core --project=firefox --project=webkit --project=small-screen --headed --workers=1
```

The three related regressions are `K5 formatting` in `editor-keyboard.spec.ts`, and `DOM splits preserve` / `formatted Enter preserves` in `editor-regressions.spec.ts`. They can be included in the same invocation with a title filter. External HTTP requests are intercepted by the shared fixture. The paste case uses a DOM ClipboardEvent; it does not exercise the operating-system clipboard. Windows WebKit results do not establish macOS/iOS Safari compatibility.

Evidence, historical failures, candidate hashes and the English/Tunisian reports: `qa/scrum-28/`. Product/support guide: `docs/inline-formatting-and-links.md`.

On Windows, keep headed Firefox input isolated in its own one-worker invocation. A parallel headed run timed out during a native click after the palette assertions; the raw failure is retained. The Firefox project now caps its workers at one. The command above uses one global worker; for parallel Chromium/WebKit/small-screen runs, select those projects together and run Firefox separately. This constraint concerns the validation schedule, not an application exception.

## Known diagnostic failures (Phase 1)

At the Phase 1 verification, supplemental contracts remain **21 passed / 1 failed**: the disconnected-cycle mind-map assertion fails exactly as before. The theme-keyboard coverage assertion also fails identically to its retained pre-move report. They are not part of the aggregate pure editor/folder gate and were not weakened to obtain a green result.

The AI meeting seed still uses the void return of `addNode` as a selection ID. Its type annotation explicitly records that historical probe limitation; fixing the seed would change diagnostic behavior and belongs in a separate reviewed correction. No production behavior was changed by typing or relocating it.

See the [Phase 1 implementation record](../../docs/QA-ORGANIZATION-PHASE1-2026-10-19.md) for discovery, assertion-preservation and fresh check evidence.
