import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { Proof } from '@cashu/cashu-ts';
import { Button, Countdown, Notice, Sats, Shell, fmtSats } from '../components/ui';
import { contribute } from '../cashu/contribute';
import { verifyContribution, type Verdict } from '../cashu/verify';
import { approveRelease, completeRelease, prepareRelease, reviewRelease, type ReleaseRequest } from '../cashu/payout';
import { reclaim } from '../cashu/refund';
import { openCosignChannel, type CosignMessage } from '../feed/cosign-channel';
import { postEvent } from '../feed/events';
import type { GroupState } from '../feed/state';
import { addProofs, loadProofs, replaceProofs } from '../store/proofs';
import { config } from '../config';
import { useGroup } from '../useGroup';
import { useSignedIn } from '../session';

type Pending = { cycle: number; savedPreviews: string[] };
type Incoming = { request: ReleaseRequest; from: string; problem: string | null };

export default function Group() {
  const { groupId } = useParams();
  const { session, wallet, balance, refreshBalance } = useSignedIn();
  const { group, loading, error, now } = useGroup(groupId);
  const me = session.keys.pubkey;

  const [verdicts, setVerdicts] = useState<Record<string, Verdict | 'checking'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error' | 'good'; text: string } | null>(null);
  const [copiedGroupId, setCopiedGroupId] = useState(false);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const pending = useRef<Pending | null>(null);
  const channel = useRef<ReturnType<typeof openCosignChannel> | null>(null);
  const claimed = useRef(new Set<string>());
  const groupRef = useRef<GroupState | null>(null);
  groupRef.current = group;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice({ tone: 'error', text: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(null);
      await refreshBalance();
    }
  };

  // --- Verify every contribution on this phone before counting it -----------------------
  useEffect(() => {
    if (!group) return;
    for (const c of group.contributions) {
      if (verdicts[c.token]) continue;
      setVerdicts((v) => ({ ...v, [c.token]: 'checking' }));
      void verifyContribution(wallet, group, c.cycle, c.member, c.token).then((verdict) =>
        setVerdicts((v) => ({ ...v, [c.token]: verdict })),
      );
    }
  }, [group?.contributions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const verifiedPot = useCallback(
    // One entry per verified contribution: each is released in its own swap (see cashu/payout.ts).
    (cycle: number): Proof[][] =>
      (group?.contributions ?? [])
        .filter((c) => c.cycle === cycle)
        .flatMap((c) => {
          const v = verdicts[c.token];
          return v && v !== 'checking' && v.ok ? [v.proofs] : [];
        }),
    [group, verdicts],
  );

  // --- Co-sign channel: requests from other officers, approvals for my pending release ---
  const onCosign = useCallback(
    async (m: CosignMessage) => {
      const g = groupRef.current;
      if (!g || !g.officerPubkeys.includes(m.from)) return;
      if (m.kind === 'request') {
        setIncoming({ request: m.request, from: m.from, problem: reviewRelease(g, m.request, verifiedPot(m.request.cycle)) });
      } else if (m.kind === 'approved' && pending.current?.cycle === m.cycle) {
        const p = pending.current;
        pending.current = null;
        await run('release', async () => {
          const token = await completeRelease(wallet, g, p.savedPreviews, m.signedPkgs);
          await postEvent(g.id, 'payout', { cycle: p.cycle, recipient: g.recipientFor(p.cycle), token }, session.keys);
          setNotice({ tone: 'good', text: `Released to ${g.nameOf(g.recipientFor(p.cycle))}.` });
        });
      } else if (m.kind === 'declined' && pending.current?.cycle === m.cycle) {
        pending.current = null;
        setBusy(null);
        setNotice({ tone: 'error', text: `${g.nameOf(m.from)} declined: ${m.reason}` });
      }
    },
    [verifiedPot], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!groupId) return;
    const ch = openCosignChannel(groupId, (m) => void onCosign(m));
    channel.current = ch;
    return () => ch.close();
  }, [groupId, onCosign]);

  // --- Collect payouts addressed to me ---------------------------------------------------
  useEffect(() => {
    if (!group) return;
    for (const p of group.payouts) {
      if (p.recipient !== me || claimed.current.has(p.token)) continue;
      claimed.current.add(p.token);
      void wallet.ops
        .receive(p.token)
        .privkey(session.keys.privkey)
        .run()
        .then(async (proofs) => {
          await addProofs(proofs);
          await refreshBalance();
          setNotice({ tone: 'good', text: `You received the pot for cycle ${p.cycle}.` });
        })
        .catch(() => undefined); // already collected on an earlier visit
    }
  }, [group?.payouts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Shell title="Circle"><p>Loading…</p></Shell>;
  if (error || !group) return <Shell title="Circle"><Notice tone="error">{error ?? 'Circle not found.'}</Notice></Shell>;

  const back = <Link to="/" aria-label="Back to wallet" className="text-2xl">‹</Link>;
  const inviteUrl = `${location.origin}/join/${group.id}`;
  const copyGroupId = async () => {
    try {
      await navigator.clipboard.writeText(group.id);
      setCopiedGroupId(true);
      window.setTimeout(() => setCopiedGroupId(false), 2000);
    } catch {
      setNotice({ tone: 'error', text: 'Could not copy the group ID. Please copy it manually.' });
    }
  };
  const groupIdControl = (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-ink/10">
      <span className="text-sm font-semibold">Group ID</span>
      <code className="break-all text-sm">{group.id}</code>
      <Button variant="secondary" onClick={() => void copyGroupId()}>
        {copiedGroupId ? 'Copied!' : 'Copy group ID'}
      </Button>
    </section>
  );
  const groupDetails = (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-ink/10">
      <h2 className="font-display text-lg font-bold">Group details</h2>
      <dl className="mt-3 flex flex-col gap-3 text-sm">
        <div className="flex justify-between gap-4"><dt className="opacity-70">Contribution</dt><dd className="text-right font-semibold">{fmtSats(group.amountSats)} per member</dd></div>
        <div className="flex justify-between gap-4"><dt className="opacity-70">Group size</dt><dd className="text-right font-semibold">{config.groupSize} members</dd></div>
        <div className="flex justify-between gap-4"><dt className="opacity-70">Cycle length</dt><dd className="text-right font-semibold">{Math.round(group.cycleSeconds / 60)} minutes</dd></div>
        <div className="flex justify-between gap-4"><dt className="opacity-70">Refund grace</dt><dd className="text-right font-semibold">{Math.round(group.graceSeconds / 60)} minutes</dd></div>
        <div className="flex flex-col gap-1"><dt className="opacity-70">Mint</dt><dd className="break-all font-semibold">{group.mintUrl}</dd></div>
        <div className="flex justify-between gap-4"><dt className="opacity-70">Organiser</dt><dd className="text-right font-semibold">{group.nameOf(group.creator)}</dd></div>
      </dl>
    </section>
  );

  // --- Before the rotation starts: gather members ----------------------------------------
  if (!group.isStarted) {
    return (
      <Shell title={group.name} back={back}>
        <p>{group.members.length} of {config.groupSize} members have joined.</p>
        {groupDetails}
        {groupIdControl}
        <Notice>Contributions open after the organiser starts the rotation.</Notice>
        <ul className="flex flex-col gap-2">
          {group.members.map((m) => <li key={m.pubkey} className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink/10">{m.name}</li>)}
        </ul>
        {!group.isFull && (
          <section className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 ring-1 ring-ink/10">
            <QRCodeSVG value={inviteUrl} size={208} />
            <p className="text-center text-sm">Members scan this to join</p>
          </section>
        )}
        {group.isFull && group.creator === me && (
          <Button
            busy={busy === 'start'}
            onClick={() => run('start', () =>
              postEvent(group.id, 'rotation_set', { order: group.members.map((m) => m.pubkey), startAt: Math.floor(Date.now() / 1000) }, session.keys))}
          >
            Start the rotation
          </Button>
        )}
        {group.isFull && group.creator !== me && <Notice>Waiting for {group.nameOf(group.creator)} to start the rotation.</Notice>}
      </Shell>
    );
  }

  // --- Running circle ---------------------------------------------------------------------
  const cycle = group.currentCycle(now);
  const recipient = group.recipientFor(cycle);
  const thisCycle = group.contributions.filter((c) => c.cycle === cycle);
  const pot = verifiedPot(cycle);
  const potSats = pot.flat().reduce((s, p) => s + p.amount.toNumber(), 0);
  const iContributed = thisCycle.some((c) => c.member === me);
  const allIn = thisCycle.length === config.groupSize && pot.length > 0 && thisCycle.every((c) => {
    const v = verdicts[c.token];
    return v && v !== 'checking' && v.ok;
  });
  const paid = group.isPaidOut(cycle);

  const startRelease = (alone: boolean) =>
    run(alone ? 'heist' : 'release', async () => {
      const { request, savedPreviews } = await prepareRelease(wallet, group, cycle, pot, session.keys.privkey);
      if (alone) {
        try {
          // Submit with only this officer's signature (1 of the 2 the lock needs).
          await completeRelease(wallet, group, savedPreviews, request.parts.map((p) => p.pkg));
          setNotice({ tone: 'error', text: 'The mint accepted one signature. This mint is NOT enforcing the lock.' });
        } catch (e) {
          setNotice({ tone: 'good', text: `Mint refused a single-officer release: ${e instanceof Error ? e.message : e}` });
        }
        return;
      }
      pending.current = { cycle, savedPreviews };
      await channel.current?.send({ kind: 'request', from: me, request });
      setNotice({ tone: 'info', text: 'Waiting for a second officer to approve…' });
    });

  // Cycles where I can (or soon can) take my money back.
  const refundable = Array.from({ length: Math.max(0, cycle) }, (_, i) => i + 1).filter(
    (c) =>
      !group.isPaidOut(c) &&
      group.contributions.some((x) => x.cycle === c && x.member === me) &&
      !group.refunds.some((r) => r.cycle === c && r.member === me) &&
      now >= group.payoutDate(c),
  );

  return (
    <Shell title={group.name} back={back}>
      {groupDetails}
      {groupIdControl}
      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink/10">
        <div className="adire px-5 py-4 text-white">
          <p className="text-sm opacity-90">Cycle {cycle} · {group.nameOf(recipient)}'s turn</p>
          <p className="mt-1 text-sm opacity-90">Payout time in <Countdown to={group.payoutDate(cycle)} now={now} /></p>
        </div>
        <div className="p-5">
          <h2 className="text-sm font-semibold opacity-70">In the pot, verified at the mint</h2>
          <div className="mt-2"><Sats value={potSats} big /></div>
        </div>
      </section>

      <ul className="flex flex-col gap-2">
        {group.members.map((m) => {
          const c = thisCycle.find((x) => x.member === m.pubkey);
          const v = c ? verdicts[c.token] : undefined;
          const status = !c ? 'Not yet' : paid ? 'Paid out' : !v || v === 'checking' ? 'Checking…' : v.ok ? 'Verified' : `Rejected: ${v.reason}`;
          const tone = status === 'Verified' || status === 'Paid out' ? 'text-palm' : status.startsWith('Rejected') ? 'text-danger' : 'opacity-60';
          return (
            <li key={m.pubkey} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-ink/10">
              <span>{m.name}{m.pubkey === me && ' (you)'}</span>
              <span className={`text-sm font-semibold ${tone}`}>{status}</span>
            </li>
          );
        })}
      </ul>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {!iContributed && !paid ? (
        <div className="flex flex-col gap-2">
        <Button
          busy={busy === 'contribute'}
          disabled={balance < group.amountSats}
          onClick={() => run('contribute', async () => {
            const mine = await loadProofs();
            const { keep, token } = await contribute(wallet, group, cycle, me, mine);
            await replaceProofs(mine, keep); // persist before posting
            await postEvent(group.id, 'contribution', { cycle, amount: group.amountSats, token }, session.keys);
          })}
        >
          Put in {fmtSats(group.amountSats)}
        </Button>
        {balance < group.amountSats && <p className="text-center text-sm opacity-70">Add {fmtSats(group.amountSats - balance)} to your wallet to contribute.</p>}
        </div>
      ) : iContributed ? (
        <Notice tone="good">You have contributed {fmtSats(group.amountSats)} for cycle {cycle}.</Notice>
      ) : null}

      {allIn && !paid && (
        <div className="flex flex-col gap-2">
          <Button busy={busy === 'release'} onClick={() => startRelease(false)}>
            Release pot to {group.nameOf(recipient)}
          </Button>
          <Button variant="danger" busy={busy === 'heist'} onClick={() => startRelease(true)}>
            Try to release alone (demo)
          </Button>
        </div>
      )}

      {paid && <Notice tone="good">Cycle {cycle} paid out to {group.nameOf(recipient)}.</Notice>}

      {refundable.map((c) =>
        now >= group.refundDeadline(c) ? (
          <Button
            key={c}
            variant="secondary"
            busy={busy === `refund-${c}`}
            onClick={() => run(`refund-${c}`, async () => {
              const mine = group.contributions.find((x) => x.cycle === c && x.member === me)!;
              const result = await reclaim(wallet, wallet.decodeToken(mine.token).proofs, session.keys.privkey);
              if (result.status === 'refunded') {
                await addProofs(result.proofs);
                await postEvent(group.id, 'refund', { cycle: c }, session.keys);
                setNotice({ tone: 'good', text: `${fmtSats(result.amount)} back in your wallet.` });
              } else if (result.status === 'too-early') {
                setNotice({ tone: 'info', text: 'The mint still sees the lock as active. Try again in a few seconds.' });
              } else {
                setNotice({ tone: 'info', text: 'Already spent: check whether the officers paid out late.' });
              }
            })}
          >
            Take back my {fmtSats(group.amountSats)} from cycle {c}
          </Button>
        ) : (
          <Notice key={c}>Cycle {c} wasn't paid out. You can take your money back in <Countdown to={group.refundDeadline(c)} now={now} />.</Notice>
        ),
      )}

      {incoming && (
        <ApproveDialog
          group={group}
          incoming={incoming}
          busy={busy === 'approve'}
          onDecline={async () => {
            await channel.current?.send({ kind: 'declined', from: me, cycle: incoming.request.cycle, reason: incoming.problem ?? 'Declined' });
            setIncoming(null);
          }}
          onApprove={() => run('approve', async () => {
            const signedPkgs = approveRelease(incoming.request, session.keys.privkey);
            await channel.current?.send({ kind: 'approved', from: me, cycle: incoming.request.cycle, signedPkgs });
            setIncoming(null);
          })}
        />
      )}
    </Shell>
  );
}

function ApproveDialog(props: {
  group: GroupState;
  incoming: Incoming;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const { group, incoming, busy, onApprove, onDecline } = props;
  const { request, from, problem } = incoming;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-10 flex items-end bg-ink/50 p-4 sm:items-center">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-5">
        <h2 className="font-display text-xl font-bold">
          Release {fmtSats(request.amount)} to {group.nameOf(request.recipient)} for cycle {request.cycle}?
        </h2>
        <p className="mt-2 text-sm opacity-80">{group.nameOf(from)} has signed. Yours is the second signature the mint needs.</p>
        {problem ? (
          <Notice tone="error">Don't approve: {problem}</Notice>
        ) : (
          <Notice tone="good">Checked: every input is this cycle's pot, every output pays {group.nameOf(request.recipient)}.</Notice>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onDecline}>Decline</Button>
          <Button onClick={onApprove} busy={busy} disabled={!!problem}>Approve</Button>
        </div>
      </div>
    </div>
  );
}
