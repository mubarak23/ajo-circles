// Append-only, signed group events. The server only relays; every phone verifies every row.
import { supabase } from './supabase';
import { signMessage, verifyMessage, type P2PKKeys } from '../keys/p2pk';

export type Payloads = {
  group_created: { name: string; mintUrl: string; amountSats: number; cycleMinutes: number; graceMinutes: number };
  member_joined: { name: string };
  rotation_set: { order: string[]; startAt: number }; // startAt: unix seconds, cycle 1 begins
  contribution: { cycle: number; amount: number; token: string };
  payout: { cycle: number; recipient: string; token: string };
  refund: { cycle: number };
};
export type EventType = keyof Payloads;

export type GroupEvent<T extends EventType = EventType> = {
  id: string;
  group_id: string;
  type: T;
  author: string;
  payload: Payloads[T];
  sig: string;
  created_at: string;
};

/** Postgres jsonb reorders keys, so sign a canonical form. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

const message = (groupId: string, type: string, payload: unknown) => `ajo/v1|${groupId}|${type}|${canonical(payload)}`;

export async function postEvent<T extends EventType>(groupId: string, type: T, payload: Payloads[T], keys: P2PKKeys) {
  const sig = signMessage(message(groupId, type, payload), keys.privkey);
  const { error } = await supabase.from('events').insert({ group_id: groupId, type, author: keys.pubkey, payload, sig });
  if (error) throw new Error(`Could not post ${type}: ${error.message}`);
}

const isAuthentic = (e: GroupEvent) => {
  try {
    return verifyMessage(e.sig, message(e.group_id, e.type, e.payload), e.author);
  } catch {
    return false;
  }
};

export async function fetchEvents(groupId: string): Promise<GroupEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load the group: ${error.message}`);
  return (data as GroupEvent[]).filter(isAuthentic);
}

/** Calls onEvent for every new authentic event. Returns an unsubscribe function. */
export function subscribeEvents(groupId: string, onEvent: (e: GroupEvent) => void) {
  const channel = supabase
    .channel(`events:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'events', filter: `group_id=eq.${groupId}` },
      (msg) => {
        const e = msg.new as GroupEvent;
        if (isAuthentic(e)) onEvent(e);
      },
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
