/**
 * Day 1 go/no-go spike. Runs the four paths the demo depends on against a real mint:
 *   1. contributions lock 2-of-3 + refund (SIG_ALL) and verify
 *   2. one officer alone CANNOT release the pot
 *   3. two officers CAN release it, and only the recipient can spend the result
 *   4. after the deadline, a member reclaims alone (and not before)
 *
 *   MINT_URL=http://127.0.0.1:3338 npm run spike
 */
import { Wallet } from '@cashu/cashu-ts';
import { mnemonicToSeedSync } from '@scure/bip39';
import { newMnemonic } from '../src/keys/seed';
import { deriveP2PK } from '../src/keys/p2pk';
import { assertMintCanHoldPots } from '../src/cashu/wallet';
import { contribute } from '../src/cashu/contribute';
import { verifyContribution } from '../src/cashu/verify';
import { approveRelease, completeRelease, prepareRelease, reviewRelease } from '../src/cashu/payout';
import { reclaim } from '../src/cashu/refund';
import { buildState } from '../src/feed/state';
import type { GroupEvent } from '../src/feed/events';

const MINT_URL = 'https://testnut.cashu.space/';
// process.env.MINT_URL ?? 'http://127.0.0.1:3338';
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

async function member(name: string) {
  const seed = mnemonicToSeedSync(newMnemonic());
  const keys = deriveP2PK(seed);
  const wallet = new Wallet(MINT_URL, { bip39seed: seed });
  await wallet.loadMint();
  const quote = await wallet.createMintQuoteBolt11(5000);
  for (let i = 0; i < 20 && (await wallet.checkMintQuoteBolt11(quote)).state === 'UNPAID'; i++) await sleep(0.5);
  const proofs = await wallet.mintProofsBolt11(5000, quote);
  return { name, keys, wallet, proofs };
}

const [amaka, tunde, zainab] = await Promise.all(['Amaka', 'Tunde', 'Zainab'].map(member));
check(true, 'Minted 5,000 test sats for 3 members');
assertMintCanHoldPots(amaka.wallet);
check(true, `${MINT_URL} supports NUT-07/10/11`);

// Build group state exactly as the app does, from (unsigned) events. 3-second cycles, 3-second grace.
const groupId = crypto.randomUUID();
const startAt = Math.floor(Date.now() / 1000);
const ev = (type: string, author: string, payload: unknown, i: number) =>
  ({ id: String(i), group_id: groupId, type, author, payload, sig: '', created_at: new Date(Date.now() + i).toISOString() }) as GroupEvent;
const events: GroupEvent[] = [
  ev('group_created', amaka.keys.pubkey, { name: 'Spike', mintUrl: MINT_URL, amountSats: 1000, cycleMinutes: 0.25, graceMinutes: 0.25 }, 0),
  ev('member_joined', amaka.keys.pubkey, { name: 'Amaka' }, 1),
  ev('member_joined', tunde.keys.pubkey, { name: 'Tunde' }, 2),
  ev('member_joined', zainab.keys.pubkey, { name: 'Zainab' }, 3),
  ev('rotation_set', amaka.keys.pubkey, { order: [zainab.keys.pubkey, amaka.keys.pubkey, tunde.keys.pubkey], startAt }, 4),
];
const group = buildState(groupId, events)!;

// 1. Contribute + verify (cycle 1)
const tokens: string[] = [];
for (const m of [amaka, tunde, zainab]) {
  const { keep, token } = await contribute(m.wallet, group, 1, m.keys.pubkey, m.proofs);
  m.proofs = keep;
  tokens.push(token);
}
const verdicts = await Promise.all(
  [amaka, tunde, zainab].map((m, i) => verifyContribution(tunde.wallet, group, 1, m.keys.pubkey, tokens[i])),
);
check(verdicts.every((v) => v.ok), 'All 3 contributions verify', verdicts.map((v) => (v.ok ? 'ok' : v.reason)).join(', '));
const pot = verdicts.flatMap((v) => (v.ok ? [v.proofs] : [])); // one entry per contribution
const wrong = await verifyContribution(tunde.wallet, group, 1, tunde.keys.pubkey, tokens[0]);
check(!wrong.ok, 'Contribution with someone else as refund key is rejected', wrong.ok ? '' : wrong.reason);

// 2. Heist: Tunde alone
{
  const { request, savedPreviews } = await prepareRelease(tunde.wallet, group, 1, pot, tunde.keys.privkey);
  try {
    await completeRelease(tunde.wallet, group, savedPreviews, request.parts.map((p) => p.pkg));
    check(false, 'Single-officer release is refused by the mint', 'MINT ACCEPTED IT');
  } catch (e) {
    check(true, 'Single-officer release is refused by the mint', String(e instanceof Error ? e.message : e).slice(0, 80));
  }
}

// 3. Real payout: Amaka prepares, Tunde reviews + approves, Amaka completes, Zainab collects
{
  const { request, savedPreviews } = await prepareRelease(amaka.wallet, group, 1, pot, amaka.keys.privkey);
  const problem = reviewRelease(group, request, pot);
  check(problem === null, 'Co-signer review passes on an honest request', problem ?? '');

  const tampered = { ...request, recipient: amaka.keys.pubkey };
  check(reviewRelease(group, tampered, pot) !== null, 'Co-signer review catches a redirected recipient');

  const signedPkgs = approveRelease(request, tunde.keys.privkey);
  const token = await completeRelease(amaka.wallet, group, savedPreviews, signedPkgs);
  check(true, 'Two-officer release accepted by the mint');

  try {
    await amaka.wallet.ops.receive(token).privkey(amaka.keys.privkey).run();
    check(false, 'Payout token is unspendable by a non-recipient', 'Amaka spent it');
  } catch {
    check(true, 'Payout token is unspendable by a non-recipient');
  }
  const received = await zainab.wallet.ops.receive(token).privkey(zainab.keys.privkey).run();
  const sum = received.reduce((s, p) => s + p.amount.toNumber(), 0);
  check(sum >= 3000 - group.maxPayoutFee, 'Recipient collects the pot', `${sum} sats`);
}

// 4. Refund (cycle 2): too early, then after the deadline
{
  const { keep, token } = await contribute(tunde.wallet, group, 2, tunde.keys.pubkey, tunde.proofs);
  tunde.proofs = keep;
  const mine = tunde.wallet.decodeToken(token).proofs;
  const early = await reclaim(tunde.wallet, mine, tunde.keys.privkey);
  check(early.status === 'too-early', 'Reclaim before the deadline is refused', early.status);

  const wait = group.refundDeadline(2) - Date.now() / 1000 + 2;
  console.log(`      waiting ${Math.ceil(wait)} s for the cycle 2 refund deadline…`);
  await sleep(Math.max(0, wait));
  const late = await reclaim(tunde.wallet, mine, tunde.keys.privkey);
  check(late.status === 'refunded', 'Reclaim after the deadline succeeds', late.status === 'refunded' ? `${late.amount} sats` : late.status);
}

console.log(failures ? `\n${failures} check(s) failed: fix or switch to the fallback before Day 2.` : '\nGO: all paths work on this mint.');
process.exit(failures ? 1 : 0);
