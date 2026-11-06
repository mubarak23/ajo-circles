import { useMemo, useState } from 'react';
import { Button, Notice, Shell } from '../components/ui';
import { newMnemonic, saveMnemonic } from '../keys/seed';
import { db } from '../store/db';
import { useSession } from '../session';

export default function Onboard() {
  const { reload } = useSession();
  const words = useMemo(() => newMnemonic().split(' '), []);
  const [name, setName] = useState('');
  const [wroteDown, setWroteDown] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    await saveMnemonic(words.join(' '));
    await db.set('name', name.trim());
    await reload();
  };

  return (
    <Shell title="Ajo Circles">
      <p className="text-lg">Save with your circle. Nobody can run with the pot.</p>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-ink/10">
        <h2 className="font-display text-lg font-bold">Your 12 recovery words</h2>
        <p className="mt-1 text-sm opacity-80">Write them on paper. They are the only way back into your money if you lose this phone.</p>
        <ol className="mt-4 grid grid-cols-3 gap-2">
          {words.map((w, i) => (
            <li key={i} className="rounded-lg bg-wash px-2 py-2 text-sm">
              <span className="num mr-1 opacity-60">{i + 1}.</span>
              {w}
            </li>
          ))}
        </ol>
      </section>

      <label className="flex flex-col gap-2">
        <span className="font-semibold">Your name in the group</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Amaka"
          className="min-h-12 rounded-xl bg-white px-4 text-base ring-1 ring-ink/20"
        />
      </label>

      <label className="flex items-start gap-3">
        <input type="checkbox" checked={wroteDown} onChange={(e) => setWroteDown(e.target.checked)} className="mt-1 size-5" />
        <span>I've written my 12 words down</span>
      </label>

      <Notice>Test sats only. Nothing here is real money.</Notice>
      <Button onClick={start} busy={busy} disabled={!wroteDown || !name.trim()}>
        Create my wallet
      </Button>
    </Shell>
  );
}
