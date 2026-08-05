import type { User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

/**
 * Best-effort self-heal: make sure a profiles row exists for this user.
 * profiles is normally populated by the on_auth_user_created DB trigger
 * (zero round trips) — this is a safety net for when that trigger is
 * missing/misconfigured, not the primary path. Never throws.
 */
async function ensureProfile(user: User): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, is_anonymous: user.is_anonymous ?? true }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.error('[arcade] profile self-heal failed', error);
}

/**
 * Ensure there's a signed-in user (anonymous is fine) and return it. Call
 * lazily, the first time a Brain Arcade game is actually opened — never on
 * general app launch, so multiplayer-only players never create a Supabase
 * session at all. Returns null when Brain Arcade isn't configured yet.
 */
export async function ensureSignedIn(): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: session } = await supabase.auth.getSession();
  let user = session.session?.user ?? null;
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[arcade] anonymous sign-in failed', error);
      return null;
    }
    user = data.user;
  }
  if (user) void ensureProfile(user);
  return user;
}

export async function currentUser(): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

let cachedDisplayName: string | null = null;

/** The signed-in user's profiles.display_name, fetched once and cached for
 *  the session — every synced result denormalizes this onto its row (see
 *  the design doc: avoids a join-time RLS policy just to show a leaderboard
 *  name). Returns null if not signed in or Brain Arcade isn't configured. */
export async function getDisplayName(): Promise<string | null> {
  if (cachedDisplayName) return cachedDisplayName;
  const supabase = getSupabase();
  const user = await currentUser();
  if (!supabase || !user) return null;
  const { data, error } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
  if (error || !data) {
    console.error('[arcade] failed to load display name', error);
    return null;
  }
  cachedDisplayName = data.display_name as string;
  return cachedDisplayName;
}

/** Rename this profile (leaderboard rows written after this pick it up). */
export async function setDisplayName(name: string): Promise<LinkResult> {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return { ok: false, error: 'Pick a name first.' };
  const supabase = getSupabase();
  const user = await currentUser();
  if (!supabase || !user) return { ok: false, error: 'Not signed in yet.' };
  const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id);
  if (error) return { ok: false, error: error.message };
  cachedDisplayName = trimmed;
  return { ok: true };
}

export type LinkResult = { ok: true } | { ok: false; error: string };

/**
 * Link a Google identity to the current session (same auth.uid(), zero
 * data migration — see linkEmail above and the design doc's B7). Redirects
 * the whole page to Google's consent screen; on success the browser never
 * returns to this line — it comes back to `redirectTo` with the session
 * already linked (supabase-js parses the callback automatically on load).
 * Requires "Manual linking" enabled and a Google provider configured in
 * the Supabase dashboard — see the setup instructions.
 */
export async function linkGoogle(): Promise<LinkResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Brain Arcade is not configured yet.' };
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const MIN_PASSWORD_LENGTH = 6;

/**
 * The non-Google account path: sets an email + password on the current
 * session (same auth.uid() as linkEmail — an anonymous session upgrades in
 * place, nothing migrates). Unlike linkEmail's magic-link-only flow, a
 * password means the player can come back and sign in on any device
 * without needing a fresh email link each time. Supabase still emails a
 * confirmation link before the address (and the ability to sign in with
 * it elsewhere) is actually active.
 */
export async function signUpWithPassword(email: string, password: string): Promise<LinkResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password needs at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Brain Arcade is not configured yet.' };
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Sign into an existing email+password account — e.g. a returning player
 * on a new or cleared device. This replaces whatever session is currently
 * active (including an anonymous one), so it's a genuinely different
 * identity from here on, not an upgrade — the caller should refresh every
 * screen's cached auth state after this succeeds (simplest: reload).
 */
export async function signInWithPassword(email: string, password: string): Promise<LinkResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Brain Arcade is not configured yet.' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  cachedDisplayName = null;
  return { ok: true };
}

/** Ends the session entirely (not a downgrade to a fresh anonymous one —
 *  the caller decides whether/when to call ensureSignedIn() again). */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  cachedDisplayName = null;
  await supabase.auth.signOut();
}
