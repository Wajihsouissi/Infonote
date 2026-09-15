# Release verification plan

Scope: React 19 / TypeScript / Vite SPA, Zustand canvas and undo state,
IndexedDB local persistence, Supabase auth/Postgres/RLS/realtime, Vercel APIs.
Existing working-tree changes are part of the tested candidate, not reverted.

| Priority | Risk / journey | Evidence required |
| --- | --- | --- |
| P0 | Local first launch, create/edit/delete/undo, reload without data loss | Browser lifecycle and persistence scenarios |
| P0 | Cloud save races, refresh, failed writes | Existing deterministic mockCloud integration scenarios; separate staging database verification |
| P0 | Unauthorized AI usage and workspace access | API guard checks, anonymous admin route, staging RLS matrix |
| P1 | Editor markdown, tasks, dates, graph, kanban, attachments | Existing unit checks and core/advanced scenarios |
| P1 | Login validation, password visibility, session failure | Isolated auth browser tests with synthetic responses |
| P1 | Script injection and unsafe links | Existing security scenarios |
| P1 | Responsive layouts and three browser engines | Mobile suite; desktop Chromium, Firefox, WebKit |
| P1 | Accessibility | Axe WCAG 2 A/AA and 2.1 A/AA scans, keyboard checks; manual assistive-technology review remains separate |
| P1 | Reliability/performance | Existing canvas selection/scale/scroll tests, build chunk sizes; staging performance remains separate |
| P1 | Release reproducibility | Lint, typecheck, unit checks, production build, CI artifacts |

## Isolation

QA uses port 5187 and Vite `qa` mode, which does not read `.env` files.
The launcher clears inherited application credentials and sets a loopback-only
dummy Supabase URL. Browser contexts are fresh per test; external HTTP requests
are intercepted. Existing cloud fixtures use synthetic user/workspace IDs and
mock sessions, never real user accounts. No payment or email is sent.

## External gates

No disposable Supabase instance or staging credentials have been supplied.
Browser mocks cannot verify deployed migrations, RLS, actual token renewal,
OAuth callbacks, realtime delivery, invitation email or live AI providers.
Before release, run owner/member/viewer/outsider access tests against a disposable
database migrated through 0019, including revoked sessions and cross-workspace
read/write attempts. Verify invitation expiry and provider failure recovery.

## Failure policy

Keep failures visible. Classify application defects, obsolete test assumptions,
environment failures, and flakes separately. Retain screenshots, video and traces
on failure; retries do not count as proof of stability. No release GO while
critical journeys, high defects, lint, build or required tests remain failing.
