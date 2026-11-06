import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Notice, Shell, fmtNaira } from '../components/ui';
import { assertMintCanHoldPots } from '../cashu/wallet';
import { postEvent } from '../feed/events';
import { config } from '../config';
import { db } from '../store/db';
import { useSignedIn } from '../session';

export default function CreateGroup() {
  const { session, wallet } = useSignedIn();
  const navigate = useNavigate();
  const [name, setName] = useState('Balogun market circle');
  const [amount, setAmount] = useState(1000);
  const [cycleMinutes, setCycleMinutes] = useState(config.cycleMinutes);
  const [graceMinutes, setGraceMinutes] = useState(config.graceMinutes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      assertMintCanHoldPots(wallet); // block groups on mints that can't enforce the lock
      const groupId = crypto.randomUUID();
      await postEvent(groupId, 'group_created', { name, mintUrl: config.mintUrl, amountSats: amount, cycleMinutes, graceMinutes }, session.keys);
      await postEvent(groupId, 'member_joined', { name: session.name }, session.keys);
      await db.set('groupId', groupId);
      navigate(`/group/${groupId}`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const field = 'min-h-12 rounded-xl bg-white px-4 text-base ring-1 ring-ink/20';
  return (
    <Shell title="Start a circle">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Circle name</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Each member puts in (sats)</span>
        <input className={`${field} num`} type="number" min={10} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        <span className="text-sm opacity-70">≈ {fmtNaira(amount)} per cycle</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2">
          <span className="font-semibold">Cycle (minutes)</span>
          <input className={`${field} num`} type="number" min={1} value={cycleMinutes} onChange={(e) => setCycleMinutes(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-semibold">Refund grace (min)</span>
          <input className={`${field} num`} type="number" min={1} value={graceMinutes} onChange={(e) => setGraceMinutes(Number(e.target.value))} />
        </label>
      </div>
      <Notice>
        {config.groupSize} members, all officers. Any {config.requiredOfficerSigs} must agree to pay out. If nobody pays out, each member can take their money back {graceMinutes} min after payout time.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <Button onClick={create} busy={busy} disabled={!name.trim() || amount < 10}>
        Start circle
      </Button>
    </Shell>
  );
}
