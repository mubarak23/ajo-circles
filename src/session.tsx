import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Wallet } from '@cashu/cashu-ts';
import { loadSession, type Session } from './keys/session';
import { getWallet } from './cashu/wallet';
import { balance as readBalance } from './store/proofs';

type Ctx = {
  session: Session | null;
  wallet: Wallet | null;
  balance: number;
  refreshBalance: () => Promise<void>;
  reload: () => Promise<void>;
  error: string | null;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = async () => setBalance(await readBalance());

  const reload = async () => {
    try {
      const s = await loadSession();
      // Publish the authenticated state only after its wallet is ready. Otherwise
      // routed screens can render with a session but no wallet during this await.
      const w = s ? await getWallet(s.seed) : null;
      setSession(s);
      setWallet(w);
      await refreshBalance();
    } catch (e) {
      setError(`Could not reach the mint. Check your connection and the mint URL. (${String(e)})`);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  if (!ready) return <p className="p-8 text-center">Opening your wallet…</p>;
  return (
    <SessionContext.Provider value={{ session, wallet, balance, refreshBalance, reload, error }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

/** For screens that only render once signed in. */
export function useSignedIn() {
  const ctx = useSession();
  if (!ctx.session || !ctx.wallet) throw new Error('Not signed in');
  return { ...ctx, session: ctx.session, wallet: ctx.wallet };
}
