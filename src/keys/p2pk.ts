// One P2PK keypair per user, derived from the seed so a restored seed restores refund rights.
// It is the member's refund key on contributions AND their officer key (all 3 members are officers).
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { schnorrSignMessage, schnorrVerifyMessage } from '@cashu/cashu-ts';

export type P2PKKeys = { privkey: string; pubkey: string };

export function deriveP2PK(seed: Uint8Array): P2PKKeys {
  // TODO(after hackathon): switch to cashu-ts's seed-derived P2PK keys (docs: usage/derive_keys)
  // so other Cashu wallets can recover the same key.
  for (let i = 0; i < 16; i++) {
    const sk = hkdf(sha256, seed, utf8ToBytes('ajo-circles'), utf8ToBytes(`p2pk/v1/${i}`), 32);
    if (secp256k1.utils.isValidSecretKey(sk)) {
      return { privkey: bytesToHex(sk), pubkey: bytesToHex(secp256k1.getPublicKey(sk, true)) };
    }
  }
  throw new Error('Could not derive a valid key from this seed');
}

/** Sign an arbitrary string (used for feed events). */
export const signMessage = (message: string, privkey: string) => schnorrSignMessage(message, privkey);

/** Verify against a 33-byte compressed pubkey. */
export const verifyMessage = (sig: string, message: string, pubkey: string) =>
  schnorrVerifyMessage(sig, message, pubkey, false);
