import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { db } from '../store/db';

export const newMnemonic = () => generateMnemonic(wordlist, 128); // 12 words

export const isValidMnemonic = (m: string) => validateMnemonic(m.trim(), wordlist);

export async function saveMnemonic(mnemonic: string) {
  // Hackathon: IndexedDB in the member's own browser. Production: platform keystore.
  await db.set('mnemonic', mnemonic.trim());
}

export async function loadSeed(): Promise<Uint8Array | null> {
  const m = await db.get('mnemonic');
  return m ? mnemonicToSeedSync(m) : null;
}
