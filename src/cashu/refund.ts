import type { Proof, Wallet } from '@cashu/cashu-ts';
import { inspectLock } from './locks';

export type RefundResult =
  | { status: 'refunded'; proofs: Proof[]; amount: number }
  | { status: 'too-early'; opensAt: number }
  | { status: 'already-spent' };

/**
 * After the refund deadline, the member reclaims their own contribution with their key alone.
 * Officers can ALSO still pay out after the deadline (NUT-11), so "already spent" usually
 * means a late payout won the race: check the feed before showing an error.
 * Pure: the caller persists `proofs`.
 */
export async function reclaim(w: Wallet, mine: Proof[], memberPrivkey: string): Promise<RefundResult> {
  const locktime = inspectLock(mine[0].secret).locktime ?? 0;
  if (Date.now() / 1000 < locktime) return { status: 'too-early', opensAt: locktime };

  const states = await w.checkProofsStates(mine);
  if (states.some((s) => s.state !== 'UNSPENT')) return { status: 'already-spent' };

  try {
    const proofs = await w.ops.receive(mine).privkey(memberPrivkey).run();
    return { status: 'refunded', proofs, amount: proofs.reduce((s, p) => s + p.amount.toNumber(), 0) };
  } catch (e) {
    // The mint's clock decides. A few seconds after the deadline it may still say "locked".
    const msg = String(e).toLowerCase();
    if (msg.includes('locktime') || msg.includes('signature')) return { status: 'too-early', opensAt: locktime };
    throw e;
  }
}
