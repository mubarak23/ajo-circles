# Ajo Circles (hackathon MVP)

Rotating savings (ajo, esusu, susu, chama) on Cashu ecash. Contributions are locked so any
**2 of 3 officers** must agree to pay out, and each member can **reclaim their own money**
after a deadline if nobody does. Test sats only.

React + Vite + TypeScript PWA · `@cashu/cashu-ts` 4.13 · Supabase (event log + realtime) · Tailwind 4

## Quick start

```bash
npm install
cp .env.example .env            # fill in Supabase URL + anon key
# Supabase: SQL editor → run supabase/schema.sql

# Option A: public test mint (default in .env.example)
# Option B: local mint with fake Lightning (needs Python 3.10+)
./scripts/local-mint.sh         # then set VITE_MINT_URL=http://<your-lan-ip>:3338

npm run spike                   # Day 1 go/no-go: must print "GO"
npm run dev                     # http://localhost:5173
```

`npm run spike` reads `MINT_URL` (default `http://127.0.0.1:3338`) and checks the four paths
the demo depends on. Run it against whichever mint you'll demo with, before building UI.

### Testing on phones

Phones need **HTTPS**: the camera (QR scanner), service worker and `crypto.randomUUID` only
work in a secure context. Either deploy (`npm run build`, then Vercel/Netlify with `dist/`)
or tunnel the dev server (`cloudflared tunnel --url http://localhost:5173`). The mint must
be reachable from the phones too: tunnel it the same way if it's local.

## How it works

```
src/
  cashu/      Pure Cashu logic, no React, no storage (shared with the spike script)
    wallet.ts      seeded wallet, cached mint keys, test top-up, NUT-11 support check
    locks.ts       contribution lock (2-of-3 + refund, SIG_ALL), recipient lock, inspectLock()
    contribute.ts  swap own ecash into a locked token
    verify.ts      every phone checks every contribution before counting it
    payout.ts      multi-party SIG_ALL release (prepare → review → approve → complete)
    refund.ts      reclaim own contribution after the deadline
  keys/       12-word seed, P2PK key derived from it, session
  feed/       Supabase: signed append-only events, group state reducer, co-sign channel
  store/      IndexedDB: seed, proofs, NUT-13 counters, mint cache
  screens/    Onboard, Wallet, CreateGroup, JoinGroup, Group (+ Approve dialog)
scripts/
  spike.ts        Day 1 end-to-end check against a real mint
  local-mint.sh   Nutshell + FakeWallet
supabase/schema.sql
```

**Trust model.** The server only relays. Every event is signed by its author's P2PK key and
verified on every phone; group state is rebuilt from the log; every contribution is checked
against the mint (lock keys, threshold, deadline, refund key, unspent) before it counts.

**Payout = one swap per contribution.** NUT-11 `SIG_ALL` requires all inputs of a swap to share
identical lock tags, and each contribution carries its own member's refund key. So a release is
N swaps, each signed by both officers; the co-signer approves all of them in one tap. The
co-signer recomputes every blinded output from its revealed secret and refuses to sign unless it
pays this cycle's recipient.

**Refunds.** Each contribution's `locktime` is that cycle's payout time + grace. After it, the
member's own key can spend it. Officers can also still pay out after the deadline (NUT-11), so
the app treats "already spent" as "check the feed", not as an error.

## Demo checklist

1. Three phones onboarded; Amaka starts a circle; Tunde and Zainab scan the QR.
2. Amaka taps **Start the rotation**. Everyone taps **Put in 1,000 sats**: all show *Verified*.
3. Tunde taps **Try to release alone** → the mint's refusal appears.
4. Amaka taps **Release pot**; Tunde approves; Zainab's balance rises.
5. Cycle 2: nobody releases. After the grace period, **Take back my 1,000 sats**.

## Known gaps (fine for the hackathon, fix after)

- Seed lives in IndexedDB, not a hardware keystore; no NUT-09 restore or NUT-27 backup UI yet.
- P2PK key uses an app-specific HKDF derivation; switch to cashu-ts seed-derived keys.
- A locked contribution token is only kept on the feed; also store it locally before posting.
- Supabase RLS allows anyone with the anon key to append (signatures make forgeries harmless,
  but spam is possible). Add rate limits or auth before real use.
- `SigAll` is marked experimental in cashu-ts 4.13; pin the version.
