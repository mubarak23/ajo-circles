// Short-lived co-sign messages ride a Supabase broadcast channel, not the events table.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { ReleaseRequest } from '../cashu/payout';

export type CosignMessage =
  | { kind: 'request'; from: string; request: ReleaseRequest }
  | { kind: 'approved'; from: string; cycle: number; signedPkgs: string[] }
  | { kind: 'declined'; from: string; cycle: number; reason: string };

export function openCosignChannel(groupId: string, onMessage: (m: CosignMessage) => void) {
  const channel: RealtimeChannel = supabase
    .channel(`cosign:${groupId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'cosign' }, ({ payload }) => onMessage(payload as CosignMessage))
    .subscribe();

  return {
    send: (m: CosignMessage) => channel.send({ type: 'broadcast', event: 'cosign', payload: m }),
    close: () => void supabase.removeChannel(channel),
  };
}
