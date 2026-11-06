import { MintQuoteState, Wallet, type GetInfoResponse, type KeyChainCache } from '@cashu/cashu-ts';
import { config } from '../config';
import { db } from '../store/db';
import { addProofs } from '../store/proofs';

let wallet: Wallet | null = null;

/** One wallet per session: seeded (NUT-13), mint keys cached for fast startup on slow networks. */
export async function getWallet(seed: Uint8Array): Promise<Wallet> {
  if (wallet) return wallet;

  const w = new Wallet(config.mintUrl, {
    bip39seed: seed,
    counterInit: (await db.get('counters')) ?? {},
  });

  const cache = await db.get('mintCache');
  if (cache) {
    try {
      w.loadMintFromCache(cache.mintInfo as GetInfoResponse, cache.keychain as KeyChainCache);
    } catch {
      await w.loadMint();
    }
  } else {
    await w.loadMint();
  }
  await db.set('mintCache', { mintInfo: w.getMintInfo().cache, keychain: w.keyChain.cache });

  // Persist deterministic counters, or a later NUT-09 restore will miss proofs.
  w.on.countersReserved(async ({ keysetId, next }) => {
    const counters = (await db.get('counters')) ?? {};
    counters[keysetId] = Math.max(counters[keysetId] ?? 0, next);
    await db.set('counters', counters);
  });

  wallet = w;
  return w;
}

/** A mint that doesn't support NUT-11 would treat locked proofs as bearer cash. Refuse it. */
export function assertMintCanHoldPots(w: Wallet) {
  const info = w.getMintInfo();
  if (!info.isSupported(10).supported || !info.isSupported(11).supported) {
    throw new Error(`${config.mintUrl} can't enforce locks (NUT-10/11). Pick another mint.`);
  }
  if (!info.isSupported(7).supported) {
    throw new Error(`${config.mintUrl} can't report token state (NUT-07). Pick another mint.`);
  }
}

/** Test mints auto-pay their quotes, so this tops up in a few seconds with no real Lightning. */
export async function topUp(w: Wallet, amount: number, timeoutMs = 20_000) {
  const quote = await w.createMintQuoteBolt11(amount);
  const started = Date.now();
  let state = quote.state;
  while (state !== MintQuoteState.PAID && state !== MintQuoteState.ISSUED) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('The mint did not mark the top-up as paid. On a real mint, pay this invoice: ' + quote.request);
    }
    await new Promise((r) => setTimeout(r, 1000));
    state = (await w.checkMintQuoteBolt11(quote)).state;
  }
  const proofs = await w.mintProofsBolt11(amount, quote);
  await addProofs(proofs);
  return proofs;
}
