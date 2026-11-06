import { sumProofs, type Proof, type Wallet } from '@cashu/cashu-ts';
import { config } from '../config';
import type { GroupState } from '../feed/state';
import { inspectLock } from './locks';

export type Verdict = { ok: true; proofs: Proof[] } | { ok: false; reason: string };

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Every phone runs this on every contribution before counting it toward the pot.
 * Checks: amount, lock keys, threshold, SIG_ALL, deadline, refund key, and unspent at the mint.
 */
export async function verifyContribution(
  w: Wallet,
  group: GroupState,
  cycle: number,
  memberPubkey: string,
  token: string,
): Promise<Verdict> {
  let proofs: Proof[];
  try {
    proofs = w.decodeToken(token).proofs;
  } catch {
    return { ok: false, reason: 'Token does not decode' };
  }
  if (proofs.length === 0) return { ok: false, reason: 'Token is empty' };
  if (sumProofs(proofs).toNumber() < group.amountSats) return { ok: false, reason: 'Amount is below the contribution' };

  for (const proof of proofs) {
    let lock;
    try {
      lock = inspectLock(proof.secret);
    } catch {
      return { ok: false, reason: 'Proof is not locked' };
    }
    if (!sameSet(lock.mainKeys, group.officerPubkeys)) return { ok: false, reason: 'Locked to the wrong officers' };
    if (lock.nSigs !== config.requiredOfficerSigs) return { ok: false, reason: 'Wrong signature threshold' };
    if (lock.sigFlag !== 'SIG_ALL') return { ok: false, reason: 'Lock is not SIG_ALL' };
    if (lock.locktime !== group.refundDeadline(cycle)) return { ok: false, reason: 'Wrong refund deadline' };
    if (!sameSet(lock.refundKeys, [memberPubkey])) return { ok: false, reason: 'Refund key is not the contributor' };
  }

  const states = await w.checkProofsStates(proofs);
  if (states.some((s) => s.state !== 'UNSPENT')) return { ok: false, reason: 'Already spent' };

  return { ok: true, proofs };
}
