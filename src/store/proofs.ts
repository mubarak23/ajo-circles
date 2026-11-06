import { deserializeProofs, serializeProofs, sumProofs, type Proof } from '@cashu/cashu-ts';
import { db } from './db';

// Serialize every write through one queue so two operations can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

export async function loadProofs(): Promise<Proof[]> {
  return deserializeProofs((await db.get('proofs')) ?? []);
}

/** Remove spent inputs and add new outputs in one write. Call right after every swap. */
export function replaceProofs(spent: Proof[], added: Proof[]) {
  return serial(async () => {
    const spentSecrets = new Set(spent.map((p) => p.secret));
    const next = [...(await loadProofs()).filter((p) => !spentSecrets.has(p.secret)), ...added];
    await db.set('proofs', serializeProofs(next));
    return next;
  });
}

export const addProofs = (added: Proof[]) => replaceProofs([], added);

export async function balance(): Promise<number> {
  return sumProofs(await loadProofs()).toNumber();
}
