import { LockBuilder } from '@cashu/cashu-ts';
import { config } from '../config';
import type { GroupState } from '../feed/state';

/**
 * Contribution lock: 2-of-3 officers can pay out; after the refund deadline the member
 * can also reclaim alone. SIG_ALL makes every signature commit to the swap's outputs,
 * so an officer can't reuse a co-signature to pay himself.
 */
export function contributionLock(group: GroupState, cycle: number, memberPubkey: string) {
  return new LockBuilder()
    .addMainPubkey(group.officerPubkeys)
    .requireMainSignatures(config.requiredOfficerSigs)
    .lockUntil(group.refundDeadline(cycle)) // unix seconds
    .addRefundPubkey(memberPubkey)
    .requireRefundSignatures(1)
    .sigAll();
}

/** Payout lock: only this cycle's recipient can spend what the officers release. */
export function recipientLock(recipientPubkey: string) {
  return new LockBuilder().addMainPubkey(recipientPubkey);
}

export type LockInfo = {
  mainKeys: string[];
  nSigs: number;
  locktime: number | null;
  refundKeys: string[];
  nSigsRefund: number;
  sigFlag: string;
};

/**
 * Read a NUT-11 P2PK secret without verifying a witness. (cashu-ts's
 * verifyP2PKSpendingConditions needs the full transaction for SIG_ALL proofs.)
 */
export function inspectLock(secret: string): LockInfo {
  const parsed = JSON.parse(secret) as [string, { data: string; tags?: string[][] }];
  if (!Array.isArray(parsed) || parsed[0] !== 'P2PK') throw new Error('Not a P2PK lock');
  const { data, tags = [] } = parsed[1];
  const tag = (k: string) => tags.find((t) => t[0] === k)?.slice(1) ?? [];
  const int = (k: string, fallback: number) => (tag(k)[0] !== undefined ? Number(tag(k)[0]) : fallback);
  return {
    mainKeys: [data, ...tag('pubkeys')],
    nSigs: int('n_sigs', 1),
    locktime: tag('locktime')[0] !== undefined ? Number(tag('locktime')[0]) : null,
    refundKeys: tag('refund'),
    nSigsRefund: int('n_sigs_refund', 1),
    sigFlag: tag('sigflag')[0] ?? 'SIG_INPUTS',
  };
}
