# Leaderboards & profile sync — Supabase setup

The Zen Endless games work fully offline with zero setup. This directory
holds everything needed to turn on the online layer: shared leaderboards,
cross-device profiles (anonymous → linked accounts), XP, and the
server-gated daily word.

## 1. Database — SQL Editor

In the [Supabase dashboard](https://supabase.com/dashboard) open your
project → **SQL Editor**, then run, in order:

1. **`schema.sql`** — tables (`profiles`, `game_results`, `xp_ledger`,
   `wordle_answers`), RLS policies, signup triggers, and the three RPCs the
   client calls. Idempotent — safe to re-run any time, including on a
   project that already has part of it.
2. **`seed_wordle_answers.sql`** — 730 dated daily words. Also idempotent
   (existing days are never overwritten).

## 2. Auth toggles — Dashboard

| Where | Setting | Why |
|---|---|---|
| Authentication → Sign In / Providers | **Enable "Anonymous sign-ins"** | Every player gets a silent session on first opening a zen game — no signup wall. Without this, sync silently stays local-only. |
| Authentication → Sign In / Providers | **Enable "Manual linking"** | Lets `linkIdentity()` upgrade an anonymous session to Google/email while keeping the same user id (all results/XP carry over). |
| Authentication → URL Configuration | **Site URL** = your production origin; **Redirect URLs** += `http://localhost:5173` (and the production origin) | Where Google/email links are allowed to land back. |

### Optional: Google sign-in (recommended)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   Create OAuth client ID (type **Web application**).
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Sign In / Providers → **Google** → paste the
   Client ID + Secret, enable.

Email linking needs nothing extra — Supabase's built-in email provider sends
the confirmation link (fine for personal scale; add custom SMTP later if
deliverability matters).

## 3. Client credentials

`client/.env.local` (copy from `client/.env.example`):

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

Dashboard → Project Settings → API Keys. The variable names must be exactly
these (`VITE_` prefix) — wrong names fail silently. Restart `npm run dev`
after changing the file; rebuild for production.

## 4. Verify it works

1. Open any Zen Endless game → header shows **“✓ signed in”**.
2. Finish a run → the result panel's sync badge turns **synced**
   (or **queued** offline, flushing automatically when back online).
3. The leaderboard panel lists your row (anonymous players show as
   `Puzzler-XXXX`).
4. Top-right **Log In** widget → link Google/email → your name replaces the
   generated one and the same profile follows you to other devices.
5. `node supabase/probe.mjs` runs these checks headlessly against your
   `.env.local` and prints a per-feature PASS/FAIL table.

## How it fits together (for future changes)

- **Local-first**: every finished run lands in IndexedDB instantly;
  `flushOutbox()` pushes unsynced rows whenever online/visible. The
  client-generated UUID makes retries idempotent.
- **One daily per player**: a partial unique index on
  `(user_id, game_id, date_key) where mode = 'daily'` — a second device's
  sync gets Postgres error 23505, which the outbox treats as "already
  synced" (first write wins).
- **Leaderboards** never read tables directly — the two `SECURITY DEFINER`
  RPCs return only safe columns (`user_id, display_name, score, rank`).
- **Daily word** is server-gated: `get_daily_word()` only ever returns
  *today's* row (UTC), so no client can query ahead.
- **Profiles** are created by DB trigger on signup and carry a generated
  `Puzzler-XXXX` name until an identity is linked, at which point the
  Google name is adopted automatically (see `handle_user_updated`).
