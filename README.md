# Chnk it (Infonote)

An infinite-canvas note-taking app: atomic note cards, a block-based editor,
kanban boards, mindmaps, real-time workspace collaboration, and AI-assisted
content generation — in the browser.

## Stack

- **Frontend:** React 19 + TypeScript + Vite, Zustand (+ zundo undo history), @xyflow/react canvas, Tailwind CSS 4
- **Backend:** Supabase (auth, Postgres + RLS, realtime), Vercel serverless functions under `api/`
- **AI:** Vercel AI Gateway proxied through `api/ai/*` (auth-gated, server-chosen models)
- **Email:** Resend (workspace invitations), with Supabase Auth fallback

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase project values
npm run dev
```

The dev server mirrors the production `api/` routes as Vite middleware (see
`vite.config.ts`), so AI, Notion import, and invitations work locally.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with local API middleware |
| `npm run build` | Typecheck (`tsc -b`) + production build |
| `npm run lint` | ESLint over the repo |
| `npm run preview` | Serve the production build locally |
| `npm run check:invite-env` | Validate invitation email env wiring |
| `npm run stress:canvas` | Canvas stress-test script |

## Environment

See [.env.example](.env.example) for the full annotated list. Highlights:

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — client Supabase config
- `AI_GATEWAY_API_KEY` — **server-side only**; required for AI features
- `RESEND_API_KEY`, `INVITE_FROM_EMAIL` — server-side invitation emails
- `SUPABASE_SERVICE_ROLE_KEY` — optional, server-side only, never `VITE_`-prefixed

## Data storage

Canvas state is persisted through three layers:

1. **Cloud sync** (Supabase, per-workspace, RLS-enforced) — auto-saves for signed-in users
2. **Local folder** (File System Access API, Chromium only) — explicit opt-in
3. **IndexedDB safety-net snapshot** — automatic, keeps work across refreshes even when neither backend is connected

Database schema lives in `supabase/migrations/`.
