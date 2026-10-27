# Production application

This directory is the production source of truth. The historical name `beta` is retained so existing application, test, audit and deployment paths stay stable.

```text
src/
  app/             Startup, routes, error boundary and application shell
  features/        Feature components, hooks and local helpers
  shared/          Reusable UI primitives and icon API
  services/        Storage, AI and external service adapters
  store/           State, slices, hydration and graph operations
  config/          Shared application configuration
  styles/          Global tokens and styles
  utils/           Small shared utilities
api/               Server-side AI routes and guards
supabase/          Production database setup and migrations
e2e/               Browser regression scenarios and support
qa/                Benchmark fixtures plus existing review artifacts
scripts/           Build plugins, checks and measurement runners
docs/              Production feature and performance documentation
```

From this directory, run `npm ci`, then `npm run dev`. Run `npm run check` before integrating a feature; browser checks use `npm run test:e2e`. Install browser binaries with `npx playwright install` when needed. Production output is `dist/`.

The aggregate check includes the existing folder-storage adapter tests. See [QA commands and evidence](e2e/README.md) for the regular scenarios, relocated opt-in diagnostics and canonical report locations. Existing benchmark fixture paths remain unchanged.

Use the [UI navigation guide](docs/UI-ORGANIZATION.md) to find panels, toolbars, editor block types, AI surfaces and shared controls. The [source architecture](src/ARCHITECTURE.md) describes the implemented boundaries.

For hosted deployment, use this directory as the project root so its `api/` routes and `vercel.json` are included. See [Supabase setup](supabase/SETUP.md) and `.env.example` for environment configuration names.

Future features are integrated from the [preserved full application](../future-features/README.md) one at a time. Production code must not import source from that application. Port a feature with its required types, service boundaries, migrations and tests, adapting it to the current production model.

The latest [performance results](docs/PERFORMANCE-RESULTS-2026-10-18.md) document remaining release gates. Repository organization does not establish that those performance targets have passed.
