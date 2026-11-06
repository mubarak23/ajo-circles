// import.meta.env is undefined under Node (the Day 1 spike script), hence the fallback.
const env: Partial<ImportMetaEnv> = import.meta.env ?? {};

function required(name: keyof ImportMetaEnv): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

export const config = {
  get mintUrl() { return required('VITE_MINT_URL'); },
  get supabaseUrl() { return required('VITE_SUPABASE_URL'); },
  get supabaseAnonKey() { return required('VITE_SUPABASE_ANON_KEY'); },
  ngnPerSat: Number(env.VITE_NGN_PER_SAT ?? 1.6),
  cycleMinutes: Number(env.VITE_CYCLE_MINUTES ?? 3),
  graceMinutes: Number(env.VITE_GRACE_MINUTES ?? 2),
  groupSize: 3,
  requiredOfficerSigs: 2,
};
