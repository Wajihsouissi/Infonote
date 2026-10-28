# Beta Review / QA validation

This candidate publishes the current local-first Beta application and its regression checks. Jira acceptance decisions must refer to the tested revision and actual results, rather than treating this document as a certificate.

## Reproduce

Use Node.js 24 from the `beta` directory:

```sh
npm ci
npm run check
node --experimental-strip-types --test scripts/routes.spec.ts scripts/card-lifecycle.spec.ts
node scripts/check-graph-clipboard.mjs
node scripts/check-structural-blocks.mjs
node qa/scrum-56/verify-lint-coverage.mjs
npx playwright install chromium firefox webkit
npx playwright test --config qa/beta-01-closeout/playwright.config.ts --project core --headed --workers 1
```

Repeat the last command with `firefox`, `webkit`, and `small-screen`. Set `CLOSEOUT_RUN` to a distinct filesystem-safe name before each run to preserve previous JSON results, screenshots, traces and retained failure videos. The reporter writes to `qa/beta-01-closeout/`; evidence stays local. Run headed native-input tests serially because the operating-system clipboard and focus are shared.

The isolated development server uses port 5188. Scenarios seed disposable browser contexts and do not require a personal workspace or live cloud service. The closeout scope covers routing, cards, canvas selection and clipboard, block types, inline formatting, keyboard editing, editor reorder, cross-surface block transfer, local autosave, startup and regression scenarios. CI additionally runs the ordinary smoke and core suites, with browser engines isolated in separate jobs.

## Scope and limitations

- Supabase sign-in and remote database backup are deferred. Injected account fixtures validate local UI behavior only. Local IndexedDB saving, recovery and concurrent-tab conflict handling remain in scope.
- Browser/CDP composition checks do not establish real operating-system IME or screen-reader compatibility. These require separate documented native testing. Japanese keyboard installation is excluded at the user's request.
- Automated Windows/Linux WebKit coverage does not establish Safari on macOS/iOS. A small viewport does not establish touch or pen hardware support.
- Preserve failed attempts and skips explicitly. A successful retry does not erase the original failure or turn an unsupported scenario into a pass.
- Source and private evidence archives remain local; Jira receives concise results and the validation PR link.

The clean-checkout build isolates Beta's plain CSS from the historical parent PostCSS configuration. Account nesting tests start on an actual draggable card edge and verify drag activation. Profile assertions describe the implemented browser recovery policy, including unsaved changes and the absence of account isolation or cloud backup.
