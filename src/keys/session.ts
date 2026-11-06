// In-memory session: the seed and keys for the signed-in user, loaded once at startup.
import { db } from '../store/db';
import { loadSeed } from './seed';
import { deriveP2PK, type P2PKKeys } from './p2pk';

export type Session = { seed: Uint8Array; keys: P2PKKeys; name: string };

let current: Session | null = null;

export async function loadSession(): Promise<Session | null> {
  if (current) return current;
  const seed = await loadSeed();
  const name = await db.get('name');
  if (!seed || !name) return null;
  current = { seed, keys: deriveP2PK(seed), name };
  return current;
}

export function requireSession(): Session {
  if (!current) throw new Error('Not signed in');
  return current;
}

export const clearSession = () => {
  current = null;
};
