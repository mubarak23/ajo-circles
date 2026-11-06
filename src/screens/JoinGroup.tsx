import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Button, Notice, Sats, Shell } from '../components/ui';
import { postEvent } from '../feed/events';
import { config } from '../config';
import { db } from '../store/db';
import { useGroup } from '../useGroup';
import { useSignedIn } from '../session';

function Scanner({ onScan }: { onScan: (text: string) => void }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: 240 }, false);
    scanner.render(onScan, () => undefined);
    return () => void scanner.clear().catch(() => undefined);
  }, [onScan]);
  return <div id="qr-reader" className="overflow-hidden rounded-2xl bg-white" />;
}

export default function JoinGroup() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { session } = useSignedIn();
  const { group, loading, error } = useGroup(groupId);
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [enteredGroupId, setEnteredGroupId] = useState('');

  if (!groupId) {
    return (
      <Shell title="Join a circle">
        <p>Enter the group ID or scan the QR code on the organiser's phone.</p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const id = enteredGroupId.trim();
            if (id) navigate(`/join/${encodeURIComponent(id)}`);
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Group ID</span>
            <input
              value={enteredGroupId}
              onChange={(event) => setEnteredGroupId(event.target.value)}
              placeholder="Paste the group ID"
              className="min-h-12 rounded-xl bg-white px-4 text-base ring-1 ring-ink/20"
            />
          </label>
          <Button type="submit" disabled={!enteredGroupId.trim()}>Continue</Button>
        </form>
        <p className="text-center text-sm opacity-70">or scan the organiser's QR code</p>
        <Scanner
          onScan={(text) => {
            const id = text.match(/\/join\/([0-9a-f-]{36})/i)?.[1];
            if (id) navigate(`/join/${id}`);
          }}
        />
      </Shell>
    );
  }

  const alreadyIn = group?.members.some((m) => m.pubkey === session.keys.pubkey);

  const join = async () => {
    setBusy(true);
    try {
      if (!alreadyIn) await postEvent(groupId, 'member_joined', { name: session.name }, session.keys);
      await db.set('groupId', groupId);
      navigate(`/group/${groupId}`);
    } catch (e) {
      setJoinError(String(e));
      setBusy(false);
    }
  };

  return (
    <Shell title="Join a circle">
      {loading && <p>Loading the circle…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {!loading && !group && <Notice tone="error">This invite doesn't match any circle. Ask the organiser for a new QR code.</Notice>}
      {group && (
        <>
          <section className="rounded-2xl bg-white p-5 ring-1 ring-ink/10">
            <h2 className="font-display text-xl font-bold">{group.name}</h2>
            <p className="mt-1 text-sm opacity-75">Started by {group.nameOf(group.creator)} · {group.members.length} of {config.groupSize} joined</p>
            <div className="mt-4"><Sats value={group.amountSats} /></div>
            <p className="text-sm opacity-75">each, every {Math.round(group.cycleSeconds / 60)} minutes</p>
          </section>
          {group.isFull && !alreadyIn ? (
            <Notice tone="error">This circle is full.</Notice>
          ) : (
            <Button onClick={join} busy={busy}>{alreadyIn ? 'Open circle' : 'Join circle'}</Button>
          )}
          {joinError && <Notice tone="error">{joinError}</Notice>}
        </>
      )}
    </Shell>
  );
}
