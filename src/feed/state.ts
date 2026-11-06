// Rebuild group state from the event log. Pure: same events in, same state out, on every phone.
import { config } from '../config';
import type { GroupEvent, Payloads } from './events';

export type Member = { pubkey: string; name: string };
export type Contribution = { cycle: number; member: string; amount: number; token: string; at: string };

export type GroupState = {
  id: string;
  name: string;
  creator: string;
  mintUrl: string;
  amountSats: number;
  members: Member[];
  officerPubkeys: string[];
  order: string[];
  startAt: number | null;
  contributions: Contribution[];
  payouts: Payloads['payout'][];
  refunds: { cycle: number; member: string }[];
  maxPayoutFee: number;
  cycleSeconds: number;
  graceSeconds: number;
  isFull: boolean;
  isStarted: boolean;
  currentCycle: (nowSec?: number) => number;
  payoutDate: (cycle: number) => number;
  refundDeadline: (cycle: number) => number;
  recipientFor: (cycle: number) => string;
  isPaidOut: (cycle: number) => boolean;
  nameOf: (pubkey: string) => string;
};

export function buildState(groupId: string, events: GroupEvent[]): GroupState | null {
  const created = events.find((e) => e.type === 'group_created') as GroupEvent<'group_created'> | undefined;
  if (!created) return null;
  const g = created.payload;

  const members: Member[] = [];
  for (const e of events) {
    if (e.type !== 'member_joined' || members.length >= config.groupSize) continue;
    if (!members.some((m) => m.pubkey === e.author)) {
      members.push({ pubkey: e.author, name: (e.payload as Payloads['member_joined']).name });
    }
  }
  const memberKeys = new Set(members.map((m) => m.pubkey));

  // Only the creator can start the rotation, and only once.
  const rotation = events.find((e) => e.type === 'rotation_set' && e.author === created.author) as
    | GroupEvent<'rotation_set'>
    | undefined;

  const contributions: Contribution[] = events
    .filter((e): e is GroupEvent<'contribution'> => e.type === 'contribution' && memberKeys.has(e.author))
    .map((e) => ({ ...e.payload, member: e.author, at: e.created_at }));

  const payouts = events
    .filter((e): e is GroupEvent<'payout'> => e.type === 'payout' && memberKeys.has(e.author))
    .map((e) => e.payload);

  const refunds = events
    .filter((e): e is GroupEvent<'refund'> => e.type === 'refund' && memberKeys.has(e.author))
    .map((e) => ({ cycle: e.payload.cycle, member: e.author }));

  const cycleSeconds = g.cycleMinutes * 60;
  const graceSeconds = g.graceMinutes * 60;
  const startAt = rotation?.payload.startAt ?? null;
  const order = rotation?.payload.order ?? [];

  return {
    id: groupId,
    name: g.name,
    creator: created.author,
    mintUrl: g.mintUrl,
    amountSats: g.amountSats,
    members,
    officerPubkeys: members.map((m) => m.pubkey), // hackathon: every member is an officer
    order,
    startAt,
    contributions,
    payouts,
    refunds,
    maxPayoutFee: 10, // sats of fee tolerance when the co-signer checks outputs
    cycleSeconds,
    graceSeconds,
    isFull: members.length === config.groupSize,
    isStarted: startAt !== null,
    currentCycle: (now = Date.now() / 1000) => (startAt === null ? 0 : Math.floor((now - startAt) / cycleSeconds) + 1),
    payoutDate: (c) => (startAt ?? 0) + c * cycleSeconds,
    refundDeadline: (c) => (startAt ?? 0) + c * cycleSeconds + graceSeconds,
    recipientFor: (c) => order[(c - 1) % order.length],
    isPaidOut: (c) => payouts.some((p) => p.cycle === c),
    nameOf: (pk) => members.find((m) => m.pubkey === pk)?.name ?? pk.slice(0, 8),
  };
}
