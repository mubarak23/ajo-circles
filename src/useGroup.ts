import { useEffect, useState } from 'react';
import { fetchEvents, subscribeEvents, type GroupEvent } from './feed/events';
import { buildState, type GroupState } from './feed/state';

/** Live group state rebuilt from the signed event log, plus a 1-second clock for countdowns. */
export function useGroup(groupId: string | undefined) {
  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    fetchEvents(groupId)
      .then((evs) => alive && setEvents(evs))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    const unsubscribe = subscribeEvents(groupId, (e) =>
      setEvents((prev) => (prev.some((p) => p.id === e.id) ? prev : [...prev, e])),
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [groupId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const group: GroupState | null = groupId ? buildState(groupId, events) : null;
  return { group, events, loading, error, now };
}
