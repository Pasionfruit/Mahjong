import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// undefined = not yet resolved; null = resolved, not configured.
let client: SupabaseClient | null | undefined;

/**
 * Brain Arcade's Supabase client, or null if VITE_SUPABASE_URL /
 * VITE_SUPABASE_PUBLISHABLE_KEY aren't set (see client/.env.example). Every
 * arcade call goes through this getter rather than a module-level client
 * that throws at import time — so the rest of the app, which never touches
 * Brain Arcade, keeps working with zero Supabase setup.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    client = null;
    return client;
  }
  client = createClient(url, publishableKey);
  return client;
}

export function isArcadeConfigured(): boolean {
  return getSupabase() !== null;
}

/** Test-only: force the next getSupabase() call to re-resolve from env. */
export function resetSupabaseClientForTests(): void {
  client = undefined;
}
