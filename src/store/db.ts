// Thin typed wrapper over IndexedDB (idb-keyval). Everything private stays on this device.
import { get, set, del, createStore } from 'idb-keyval';

const store = createStore('ajo-circles', 'kv');

export type Keys = {
  mnemonic: string;
  name: string;
  proofs: string[]; // serializeProofs() output
  counters: Record<string, number>; // NUT-13 deterministic counters per keyset
  mintCache: { mintInfo: unknown; keychain: unknown };
  groupId: string;
};

export const db = {
  get: <K extends keyof Keys>(k: K) => get<Keys[K]>(k, store),
  set: <K extends keyof Keys>(k: K, v: Keys[K]) => set(k, v, store),
  del: (k: keyof Keys) => del(k, store),
};
