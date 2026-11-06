import { getEncodedToken, type Proof, type Wallet } from '@cashu/cashu-ts';
import type { GroupState } from '../feed/state';
import { contributionLock } from './locks';

/**
 * Swap the member's own ecash into proofs locked to the officers.
 * Pure: the caller persists `keep` (and should remember `send`) before posting `token`.
 */
export async function contribute(w: Wallet, group: GroupState, cycle: number, memberPubkey: string, myProofs: Proof[]) {
  const { keep, send } = await w.ops
    .send(group.amountSats, myProofs)
    .asLocked(contributionLock(group, cycle, memberPubkey))
    .includeFees(true) // member also covers the fee for the later payout swap
    .run();
  return { keep, send, token: getEncodedToken({ mint: group.mintUrl, proofs: send }) };
}
