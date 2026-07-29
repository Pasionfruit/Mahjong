/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Brain Arcade's Supabase project URL. Unset until client/.env.local is configured. */
  readonly VITE_SUPABASE_URL?: string;
  /** Brain Arcade's Supabase publishable key (formerly "anon" key — same kind
   *  of value, safe to expose client-side). Unset until client/.env.local is configured. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
