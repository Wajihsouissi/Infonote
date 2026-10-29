# The beta's Supabase project — what to click

Sign-in and crash reports are the only things the beta uses a server for. This
takes about ten minutes, once.

Everything else in the app keeps working without it: the canvas, the editor,
the mind map and the backup file are all local. Only the AI assistant needs an
account, because the live AI routes will not answer an anonymous caller.

---

## 1. Create the project

1. In [supabase.com/dashboard](https://supabase.com/dashboard), **New project**.
2. Name it something you will recognise next year — `chnk-it-beta`.
3. Choose the region closest to you, and keep the database password somewhere
   safe. Nothing in the app uses it; you will want it if you ever open the
   database directly.

## 2. Copy the two values the app needs

**Project settings → API**, then copy:

| Dashboard label | Goes in `beta/.env.local` as |
|---|---|
| Project URL | `VITE_SUPABASE_URL` |
| Publishable key (or "anon public") | `VITE_SUPABASE_PUBLISHABLE_KEY` |

Create `beta/.env.local` (it is git-ignored) with those two lines:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<the publishable key>
```

The publishable key is meant to be in a browser; it is not a secret. Never put
the **service role** key in this file — that one bypasses every rule below.

> Until this file exists, the beta reads the repo root's `.env`, which belongs
> to the full app. Sign-in still works locally, but the account lands in the
> *old* project. Creating `beta/.env.local` is what separates them.

## 3. Tell it where to send people back

**Authentication → URL configuration**:

- **Site URL:** `http://localhost:5174` while developing; the Vercel domain
  once the beta is deployed.
- **Redirect URLs** — add both, one per line:
  - `http://localhost:5174/*`
  - `https://<your-beta-domain>/*`

A redirect that is not on this list fails *after* a correct sign-in, which
looks like a broken app rather than a missing setting.

## 4. Email, and Google if you want it

- **Authentication → Providers → Email** is on by default. Leave "Confirm
  email" on: the beta expects it, and tells people to check their inbox.
- **Google** is optional. Turn it on, paste the client ID and secret from the
  Google Cloud console, and add
  `https://<project>.supabase.co/auth/v1/callback` as an authorised redirect
  URI there. Without it, the "Continue with Google" button reports that the
  provider is not set up; email still works.

## 5. The one table: crash reports

**SQL editor → New query**, paste [`client_errors.sql`](./client_errors.sql),
run it.

It creates one insert-only table. Anyone may add a report, nobody can read one
back through the app; you read them in **Table editor → client_errors**, newest
first. What a report contains: the error message, the stack, which page
(`/canvas`, `/home`) and the browser string — never anything written in a card.

Sign-in itself needs no tables at all: a person's name lives on their account,
so nothing here has to be created for accounts to work.

## 6. Check it

With `beta/.env.local` in place, restart the dev server and:

1. Open `http://localhost:5174/signup` and create an account with a real
   address. You should get a confirmation email, and after confirming, land on
   the canvas signed in.
2. Press **Ctrl+J** and ask the assistant something — that is the part that
   needs a session.
3. The profile page should show your email, and **Sign out** should return you
   to the landing page.

## 7. For the deployed beta

In the Vercel project (root directory `beta`), set the same two `VITE_…`
values, plus:

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` — the same URL and publishable key
  again, under the names the AI routes read on the server.
- `GEMINI_API_KEY` — the paid key.
- `VITE_SITE_URL` — the beta's own domain, so a sign-in started from a preview
  deployment comes back to the real site.

Do **not** set `VITE_AI_ALLOW_ANONYMOUS` there. It is a local development
convenience, and the deployed guard ignores it by design.
