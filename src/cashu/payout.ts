/**
 * Co-signed payout using cashu-ts SigAll multi-party signing (experimental API in 4.13).
 *
 *   Officer A: prepareRelease()  -> signs, sends `request` to B over the realtime channel
 *   Officer B: reviewRelease()   -> checks inputs + outputs; approveRelease() signs, sends back
 *   Officer A: completeRelease() -> merges B's signatures, submits to the mint
 *
 * NUT-11 SIG_ALL requires every input of one swap to carry identical lock tags. Each member's
 * contribution has its own refund key, so the pot is released as ONE SWAP PER CONTRIBUTION,
 * all approved by the co-signer in one tap. (Found by the Day 1 spike.)
 *
 * The heist demo calls completeRelease() with only A's signatures: the mint rejects it.
 */
import {
  SigAll,
  blindMessage,
  deserializeSwapPreview,
  getEncodedToken,
  serializeSwapPreview,
  sumProofs,
  type Proof,
  type Wallet,
} from '@cashu/cashu-ts';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { GroupState } from '../feed/state';
import { inspectLock, recipientLock } from './locks';

type OutputReveal = { secret: string; r: string; B_: string };

/** One swap per contribution. Output secrets let the co-signer prove where the money goes. */
export type ReleasePart = { pkg: string; outputs: OutputReveal[] };

export type ReleaseRequest = {
  cycle: number;
  recipient: string;
  amount: number;
  parts: ReleasePart[];
};

/** Officer A: build one swap per contribution paying the recipient, and add A's signature to each. */
export async function prepareRelease(w: Wallet, group: GroupState, cycle: number, pot: Proof[][], officerPrivkey: string) {
  const recipient = group.recipientFor(cycle);
  const parts: ReleasePart[] = [];
  const savedPreviews: string[] = [];
  let amount = 0;

  for (const contribution of pot) {
    const preview = await w.ops.receive(contribution).asLocked(recipientLock(recipient)).prepare();
    const pkg = SigAll.signPackage(SigAll.extractSwapPackage(preview), officerPrivkey);
    const outputs = [...(preview.keepOutputs ?? []), ...(preview.sendOutputs ?? [])].map((o) => ({
      secret: new TextDecoder().decode(o.secret),
      r: o.blindingFactor.toString(16).padStart(64, '0'),
      B_: o.blindedMessage.B_,
    }));
    parts.push({ pkg: SigAll.serializePackage(pkg), outputs });
    // Keep previews on A's device until B answers: they hold the blinding data.
    savedPreviews.push(JSON.stringify(serializeSwapPreview(preview)));
    amount += preview.amount.toNumber();
  }

  const request: ReleaseRequest = { cycle, recipient, amount, parts };
  return { request, savedPreviews };
}

/** Officer B: everything that must be true before B signs. Returns a reason, or null if safe. */
export function reviewRelease(group: GroupState, req: ReleaseRequest, verifiedPot: Proof[][]): string | null {
  if (req.recipient !== group.recipientFor(req.cycle)) return "Not this cycle's recipient";
  if (group.isPaidOut(req.cycle)) return 'This cycle is already paid out';
  if (req.parts.length !== verifiedPot.length) return 'Wrong number of contributions';

  const potSecrets = new Set(verifiedPot.flat().map((p) => p.secret));
  const seen = new Set<string>();
  let outTotal = 0;

  for (const part of req.parts) {
    const pkg = SigAll.deserializePackage(part.pkg);

    // Inputs must be this cycle's verified contributions, each used once.
    for (const i of pkg.inputs) {
      if (!potSecrets.has(i.secret) || seen.has(i.secret)) return "Inputs are not this cycle's contributions";
      seen.add(i.secret);
    }

    // Outputs: recompute each blinded message from its secret, check it pays the recipient.
    if (part.outputs.length !== pkg.outputs.length) return 'Output count mismatch';
    for (const [i, o] of part.outputs.entries()) {
      const B_ = blindMessage(utf8ToBytes(o.secret), BigInt('0x' + o.r)).B_.toHex(true);
      if (B_ !== pkg.outputs[i].B_) return 'An output does not match its secret';
      let lock;
      try {
        lock = inspectLock(o.secret);
      } catch {
        return 'An output is not locked';
      }
      if (lock.mainKeys.length !== 1 || lock.mainKeys[0] !== req.recipient || lock.refundKeys.length) {
        return 'An output is not locked to the recipient';
      }
      outTotal += Number(String(pkg.outputs[i].amount));
    }
  }

  if (seen.size !== potSecrets.size) return 'Some contributions are missing';
  if (outTotal < sumProofs(verifiedPot.flat()).toNumber() - group.maxPayoutFee) return 'Outputs are short of the pot';
  return null;
}

/** Officer B: sign every part and hand the packages back. */
export function approveRelease(req: ReleaseRequest, officerPrivkey: string): string[] {
  return req.parts.map((p) => SigAll.serializePackage(SigAll.signPackage(SigAll.deserializePackage(p.pkg), officerPrivkey)));
}

/**
 * Officer A: merge signatures and submit each swap. Returns one token for the recipient.
 * If a later part fails, earlier parts are already paid: the token still carries them.
 */
export async function completeRelease(w: Wallet, group: GroupState, savedPreviews: string[], signedPkgs: string[]) {
  const proofs: Proof[] = [];
  for (const [i, saved] of savedPreviews.entries()) {
    const preview = SigAll.mergeSwapPackage(SigAll.deserializePackage(signedPkgs[i]), deserializeSwapPreview(JSON.parse(saved)));
    const { keep, send } = await w.completeSwap(preview);
    proofs.push(...keep, ...send);
  }
  return getEncodedToken({ mint: group.mintUrl, proofs });
}
