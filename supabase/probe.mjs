// Headless health check for the Zen Endless online layer. Reads the same
// credentials the app uses (client/.env.local), exercises every feature the
// client depends on, and prints PASS/FAIL per feature with a fix hint.
//
//   node supabase/probe.mjs
//
// Non-destructive: the one test row it inserts is deleted again (and uses
// game_id 'probe', which no leaderboard ever queries). Each run does create
// one throwaway anonymous auth user — same as any new player opening a game.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(join(root, 'client', '.env.local'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
} catch {
  console.error('✗ client/.env.local not found — copy client/.env.example and fill it in.');
  process.exit(1);
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const results = [];
const record = (name, ok, note = '') => {
  results.push([ok, name, note]);
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

if (!url || !key || url.includes('your-project-ref')) {
  record('credentials in client/.env.local', false, 'set VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}
record('credentials in client/.env.local', true, url);

const supabase = createClient(url, key);
const today = new Date().toISOString().slice(0, 10);

// Leaderboard RPCs are granted to the anon role too — probe before sign-in.
{
  const { error } = await supabase.rpc('get_daily_leaderboard', {
    p_game_id: 'wordguess', p_date: today, p_limit: 5, p_ascending: false,
  });
  record('RPC get_daily_leaderboard', !error, error ? `${error.message} → run supabase/schema.sql` : '');
}
{
  const { error } = await supabase.rpc('get_alltime_leaderboard', {
    p_game_id: 'twenty48', p_limit: 5, p_ascending: false,
  });
  record('RPC get_alltime_leaderboard', !error, error ? `${error.message} → run supabase/schema.sql` : '');
}
{
  const { data, error } = await supabase.rpc('get_daily_word');
  const ok = !error && typeof data === 'string' && data.length === 5;
  record(
    'RPC get_daily_word (seeded for today)',
    ok,
    error ? `${error.message} → run supabase/schema.sql` : ok ? 'today has a word' : 'no row for today → run supabase/seed_wordle_answers.sql',
  );
}

// Anonymous sign-in — the foundation of the whole pipeline.
const { data: signIn, error: signInErr } = await supabase.auth.signInAnonymously();
record(
  'anonymous sign-in',
  !signInErr,
  signInErr ? `${signInErr.message} → enable "Anonymous sign-ins" (Authentication → Sign In / Providers)` : '',
);

if (!signInErr && signIn.user) {
  const uid = signIn.user.id;

  // profiles row should exist via the on_auth_user_created trigger.
  await new Promise((r) => setTimeout(r, 400));
  const { data: prof, error: profErr } = await supabase
    .from('profiles').select('display_name').eq('id', uid).maybeSingle();
  record(
    'profiles row auto-created (trigger)',
    !profErr && !!prof,
    profErr ? `${profErr.message} → run supabase/schema.sql` : prof ? `display_name: ${prof.display_name}` : 'missing → run supabase/schema.sql (trigger)',
  );

  // game_results: the exact upsert the outbox performs, then clean up.
  const rowId = crypto.randomUUID();
  const { error: insErr } = await supabase.from('game_results').upsert({
    id: rowId, user_id: uid, display_name: 'Probe', game_id: 'probe',
    mode: 'endless', date_key: null, score: 1,
    stats: {}, move_log: [], completed_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  record('game_results upsert (outbox path)', !insErr, insErr ? `${insErr.message} → run supabase/schema.sql` : '');

  if (!insErr) {
    const { error: delErr } = await supabase.from('game_results').delete().eq('id', rowId);
    record('game_results cleanup (delete own)', !delErr, delErr ? `${delErr.message} → re-run supabase/schema.sql for the delete policy` : '');
  }

  // xp_ledger insert, as awardXp does.
  const { error: xpErr } = await supabase.from('xp_ledger').insert({
    user_id: uid, delta: 0, reason: 'probe', game_id: 'probe',
  });
  record('xp_ledger insert', !xpErr, xpErr ? `${xpErr.message} → run supabase/schema.sql` : '');

  // wordle_answers must NOT be directly readable (RLS lockout).
  const { data: leak } = await supabase.from('wordle_answers').select('word').limit(1);
  const locked = !leak || leak.length === 0;
  record('wordle_answers locked behind RLS', locked, locked ? '' : 'table is readable — answers leak! re-run supabase/schema.sql');
}

const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${failed === 0 ? '🎉 All checks passed — leaderboards and profile sync are live.' : `${failed} check(s) failed — fix hints above, then re-run.`}`);
console.log('Note: "Manual linking" and the Google provider are dashboard toggles the probe cannot see — verify those per supabase/README.md if account linking matters.');
process.exit(failed === 0 ? 0 : 1);
