/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MINT_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_NGN_PER_SAT?: string;
  readonly VITE_CYCLE_MINUTES?: string;
  readonly VITE_GRACE_MINUTES?: string;
}
