import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Notice, Sats, Shell } from '../components/ui';
import { topUp } from '../cashu/wallet';
import { db } from '../store/db';
import { useSignedIn } from '../session';

const TOP_UP_SATS = 5_000;

export default function WalletScreen() {
  const { session, wallet, balance, refreshBalance } = useSignedIn();
  const [groupId, setGroupId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void db.get('groupId').then(setGroupId);
  }, []);

  const addSats = async () => {
    setBusy(true);
    setError(null);
    try {
      await topUp(wallet, TOP_UP_SATS);
      await refreshBalance();
    } catch (e) {
      setError(`Top-up failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={`Hi, ${session.name}`}>
      <section className="rounded-2xl bg-white p-5 ring-1 ring-ink/10">
        <h2 className="text-sm font-semibold opacity-70">Your wallet</h2>
        <div className="mt-2">
          <Sats value={balance} big />
        </div>
        <Button variant="secondary" className="mt-5 w-full" onClick={addSats} busy={busy}>
          Add {TOP_UP_SATS.toLocaleString('en-NG')} test sats
        </Button>
      </section>

      {error && <Notice tone="error">{error}</Notice>}

      {groupId ? (
        <Link to={`/group/${groupId}`} className="contents">
          <Button className="w-full">Open my circle</Button>
        </Link>
      ) : (
        <div className="flex flex-col gap-3">
          <Link to="/create" className="contents">
            <Button className="w-full">Start a circle</Button>
          </Link>
          <Link to="/join" className="contents">
            <Button variant="secondary" className="w-full">Join with a QR code</Button>
          </Link>
        </div>
      )}
    </Shell>
  );
}
