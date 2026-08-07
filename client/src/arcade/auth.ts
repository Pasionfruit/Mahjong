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
 *
 * Single-flight and cached: every game screen calls this on mount, and on
 * a phone each call was re-awaiting the session (and racing a duplicate
 * anonymous sign-up on first launch). One promise serves them all; only a
 * failed attempt is forgotten so a later game open can retry.
 */
let signInFlight: Promise<User | null> | null = null;

export function ensureSignedIn(): Promise<User | null> {
  signInFlight ??= (async () => {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data: session } = await supabase.auth.getSession();
    let user = session.session?.user ?? null;
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('[arcade] anonymous sign-in failed', error);
        signInFlight = null;
        return null;
      }
      user = data.user;
    }
    if (user) void ensureProfile(user);
    return user;
  })().catch((e) => {
    signInFlight = null;
    throw e;
  });
  return signInFlight;
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

/**
 * Sign IN with Google, as opposed to linkGoogle's "attach Google to this
 * anonymous session". These are genuinely different operations and the
 * distinction bites on a second device: once a Google account is linked to
 * one user, linkIdentity for that same account fails ("identity already
 * linked"), because it would have to belong to two users at once. A
 * returning player on a new phone needs THIS — it replaces the local
 * anonymous session with their existing account, exactly like
 * signInWithPassword does for the email path.
 */
export async function signInWithGoogle(): Promise<LinkResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Brain Arcade is not configured yet.' };
  cachedDisplayName = null;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * An OAuth failure comes back as query/hash params on the redirect, not as
 * a rejected promise — the promise resolved fine when we *left* for Google.
 * Nothing read these before, so a failed Google round trip looked
 * identical to never having pressed the button. Returns the message (and
 * clears the params so a reload doesn't resurrect a stale error).
 */
export function consumeOAuthError(): string | null {
  if (typeof window === 'undefined') return null;
  const read = (s: string) => new URLSearchParams(s.startsWith('#') || s.startsWith('?') ? s.slice(1) : s);
  const fromHash = read(window.location.hash);
  const fromQuery = read(window.location.search);
  const desc =
    fromHash.get('error_description') ??
    fromQuery.get('error_description') ??
    fromHash.get('error') ??
    fromQuery.get('error');
  if (!desc) return null;
  const clean = decodeURIComponent(desc.replace(/\+/g, ' '));
  window.history.replaceState(null, '', window.location.pathname);
  // Supabase's raw wording here is opaque; name the actual situation and
  // the way out, since this is the exact second-device case above.
  if (/already/i.test(clean) && /linked|registered|exists/i.test(clean)) {
    return 'That Google account already belongs to a profile. Use "Log In" below to sign into it on this device.';
  }
  return clean;
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
  signInFlight = null; // different identity now — drop the cached one
  return { ok: true };
}

/** Ends the session entirely (not a downgrade to a fresh anonymous one —
 *  the caller decides whether/when to call ensureSignedIn() again). */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  cachedDisplayName = null;
  signInFlight = null;
  await supabase.auth.signOut();
}
