-- ═══════════════════════════════════════════════════════════════════════════
-- LocalRot · Zen Endless (Brain Arcade) — complete Supabase schema
--
-- Idempotent: safe to paste into the SQL Editor and run repeatedly, including
-- on a project where part of this already exists. It creates everything the
-- client code in client/src/arcade/ expects:
--
--   profiles          getDisplayName(), AuthWidget, on_auth_user_created trigger
--   game_results      outbox flushOutbox() upsert, daily-uniqueness (23505)
--   xp_ledger         awardXp() insert per first-synced result
--   wordle_answers    server-gated daily word (never readable directly)
--   RPCs              get_daily_leaderboard / get_alltime_leaderboard /
--                     get_daily_word
--
-- After running this, seed the daily words with seed_wordle_answers.sql.
-- Dashboard toggles still required — see supabase/README.md.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user, created by trigger the moment the (anonymous) user
-- signs in. display_name is denormalized onto every synced result so
-- leaderboards never need a cross-table RLS dance.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default ('Puzzler-' || lpad((floor(random() * 10000))::int::text, 4, '0')),
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create the profile on signup (the client also self-heals, but this is
-- the primary, zero-round-trip path).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, is_anonymous)
  values (new.id, coalesce(new.is_anonymous, true))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- When an anonymous account links a real identity (email/Google), keep the
-- profile flag in step and adopt the provider's name if the player still has
-- the generated default.
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set is_anonymous = coalesce(new.is_anonymous, p.is_anonymous),
      display_name = case
        when p.display_name like 'Puzzler-%'
             and coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name') is not null
        then left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 24)
        else p.display_name
      end
  where p.id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- ── game_results ────────────────────────────────────────────────────────────
-- One row per completed run, keyed by the CLIENT-generated UUID so the
-- offline outbox's retried upserts are idempotent. The partial unique index
-- is the "one official daily per player per game per day" rule — the outbox
-- treats its 23505 as already-synced (first device wins).

create table if not exists public.game_results (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default 'Puzzler',
  game_id text not null,
  mode text not null check (mode in ('daily', 'endless')),
  date_key date,
  score double precision not null,
  stats jsonb not null default '{}'::jsonb,
  move_log jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((mode = 'daily') = (date_key is not null))
);

create unique index if not exists game_results_one_daily
  on public.game_results (user_id, game_id, date_key)
  where mode = 'daily';

create index if not exists game_results_daily_lb
  on public.game_results (game_id, date_key, score)
  where mode = 'daily';

create index if not exists game_results_endless_lb
  on public.game_results (game_id, user_id, score)
  where mode = 'endless';

alter table public.game_results enable row level security;

drop policy if exists "results: read own" on public.game_results;
create policy "results: read own" on public.game_results
  for select using (auth.uid() = user_id);

drop policy if exists "results: insert own" on public.game_results;
create policy "results: insert own" on public.game_results
  for insert with check (auth.uid() = user_id);

-- Needed because the outbox uses upsert (a retry of an already-synced row
-- takes the UPDATE path of ON CONFLICT (id)).
drop policy if exists "results: update own" on public.game_results;
create policy "results: update own" on public.game_results
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Players may clear their own history (also lets supabase/probe.mjs tidy up).
drop policy if exists "results: delete own" on public.game_results;
create policy "results: delete own" on public.game_results
  for delete using (auth.uid() = user_id);

-- ── xp_ledger ───────────────────────────────────────────────────────────────
-- Append-only XP log; awarded client-side on a result's FIRST successful sync.

create table if not exists public.xp_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,
  reason text not null,
  game_id text,
  created_at timestamptz not null default now()
);

create index if not exists xp_ledger_user on public.xp_ledger (user_id, created_at);

alter table public.xp_ledger enable row level security;

drop policy if exists "xp: read own" on public.xp_ledger;
create policy "xp: read own" on public.xp_ledger
  for select using (auth.uid() = user_id);

drop policy if exists "xp: insert own" on public.xp_ledger;
create policy "xp: insert own" on public.xp_ledger
  for insert with check (auth.uid() = user_id);

-- ── wordle_answers ──────────────────────────────────────────────────────────
-- The daily Word Guess answers, one dated row each. RLS is enabled with NO
-- policies on purpose: nothing may read this table directly — the only door
-- is get_daily_word(), which returns exactly today's word and never accepts
-- a client-supplied date (no spoofed-date peeking at tomorrow).

create table if not exists public.wordle_answers (
  day date primary key,
  word text not null check (word ~ '^[a-z]{5}$')
);

alter table public.wordle_answers enable row level security;

-- ── RPCs ────────────────────────────────────────────────────────────────────

create or replace function public.get_daily_word()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select word from public.wordle_answers
  where day = (now() at time zone 'utc')::date;
$$;

-- Today's ranked daily results for one game (one row per player is already
-- guaranteed by the unique daily index). SECURITY DEFINER reads past RLS but
-- returns only leaderboard-safe columns.
create or replace function public.get_daily_leaderboard(
  p_game_id text,
  p_date date,
  p_limit integer default 10,
  p_ascending boolean default false
)
returns table (user_id uuid, display_name text, score double precision, rnk bigint)
language sql
stable
security definer
set search_path = public
as $$
  select r.user_id, r.display_name, r.score,
         rank() over (
           order by case when p_ascending then r.score end asc,
                    case when not p_ascending then r.score end desc
         ) as rnk
  from public.game_results r
  where r.game_id = p_game_id and r.mode = 'daily' and r.date_key = p_date
  order by rnk, r.completed_at
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- Each player's single best endless score for one game, ranked.
create or replace function public.get_alltime_leaderboard(
  p_game_id text,
  p_limit integer default 10,
  p_ascending boolean default false
)
returns table (user_id uuid, display_name text, score double precision, rnk bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.user_id, b.display_name, b.score,
         rank() over (
           order by case when p_ascending then b.score end asc,
                    case when not p_ascending then b.score end desc
         ) as rnk
  from (
    select distinct on (r.user_id) r.user_id, r.display_name, r.score
    from public.game_results r
    where r.game_id = p_game_id and r.mode = 'endless'
    order by r.user_id,
             case when p_ascending then r.score end asc,
             case when not p_ascending then r.score end desc
  ) b
  order by rnk
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ── streaks ────────────────────────────────────────────────────────────────
--
-- Streaks are DERIVED from game_results rather than stored on profiles: the
-- daily rows are already the source of truth (one per player per game per
-- day, enforced by game_results_one_daily), so a denormalized counter could
-- only ever drift out of sync with them. Computing on read also means a
-- streak follows the account across devices for free — the client's local
-- IndexedDB copy is just a cache for offline display.
--
-- "Current streak" = the run of consecutive UTC days ending today or
-- yesterday. Yesterday still counts so today's puzzle isn't retroactively
-- lost before it's played. Classic gaps-and-islands: subtracting a dense
-- row_number() from the date makes every consecutive run share a constant.
create or replace function public.current_streaks(p_game_id text default null)
returns table (user_id uuid, game_id text, streak integer, last_day date)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select distinct r.user_id, r.game_id, r.date_key
    from public.game_results r
    where r.mode = 'daily'
      and r.date_key is not null
      and (p_game_id is null or r.game_id = p_game_id)
  ),
  grouped as (
    select d.user_id, d.game_id, d.date_key,
           d.date_key - (row_number() over (
             partition by d.user_id, d.game_id order by d.date_key
           ))::integer as island
    from days d
  ),
  runs as (
    select g.user_id, g.game_id, g.island,
           count(*)::integer as len,
           max(g.date_key) as last_day
    from grouped g
    group by g.user_id, g.game_id, g.island
  )
  -- At most one run per (user, game) can end today/yesterday, so this is
  -- already one row per pair — no extra dedup needed.
  select runs.user_id, runs.game_id, runs.len, runs.last_day
  from runs
  where runs.last_day >= ((now() at time zone 'utc')::date - 1);
$$;

-- Top current daily streaks for one game. display_name comes from profiles
-- (not game_results' denormalized copy) so a rename shows up immediately
-- and can't split a player across rows.
create or replace function public.get_streak_leaderboard(
  p_game_id text,
  p_limit integer default 10
)
returns table (user_id uuid, display_name text, score double precision, rnk bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id,
         p.display_name,
         s.streak::double precision as score,
         rank() over (order by s.streak desc) as rnk
  from public.current_streaks(p_game_id) s
  join public.profiles p on p.id = s.user_id
  order by rnk, s.last_day desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- Every current streak for the CALLING user, one row per game — powers the
-- per-game streak counters on the profile screen in a single round trip.
-- SECURITY DEFINER only so it can reach the internal helper; auth.uid()
-- still resolves to the CALLER inside a definer function, so the filter is
-- what actually scopes this to your own rows.
create or replace function public.my_streaks()
returns table (game_id text, streak integer, last_day date)
language sql
stable
security definer
set search_path = public
as $$
  select s.game_id, s.streak, s.last_day
  from public.current_streaks(null) s
  where s.user_id = auth.uid()
  order by s.streak desc, s.game_id;
$$;

-- The RPCs are the public read surface: callable by both the anonymous role
-- (pre-sign-in leaderboard peeks, degraded-mode daily word) and signed-in
-- players. Everything else stays behind RLS.
grant execute on function public.get_daily_word() to anon, authenticated;
grant execute on function public.get_daily_leaderboard(text, date, integer, boolean) to anon, authenticated;
grant execute on function public.get_alltime_leaderboard(text, integer, boolean) to anon, authenticated;
grant execute on function public.get_streak_leaderboard(text, integer) to anon, authenticated;
grant execute on function public.my_streaks() to authenticated;
-- current_streaks is deliberately NOT granted: it returns raw user_ids for
-- every player, which neither client caller needs. The two wrappers above
-- are SECURITY DEFINER, so they can still reach it while exposing only
-- display names (leaderboard) or your own rows (my_streaks).
revoke execute on function public.current_streaks(text) from anon, authenticated;
