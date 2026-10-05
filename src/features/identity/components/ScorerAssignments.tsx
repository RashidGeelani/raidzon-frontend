import Dexie from 'dexie';
import { useEffect, useState } from 'react';
import { api, type AccountSession } from '../data/auth-client';
import { db, normalizePhone } from '../../matches/data/match-repository';
import type { LocalMatch, MatchState } from '../../scoring/domain/match-types';

interface Assignment {
  matchId: string;
  teamA: string;
  teamB: string;
  accepted: boolean;
  rulesetVersion: LocalMatch['rulesetVersion'];
}
export function ScorerAssignments({
  account,
  online,
  matches,
}: {
  account: AccountSession;
  online: boolean;
  matches: LocalMatch[];
}) {
  const [items, setItems] = useState<Assignment[]>([]);
  const [matchId, setMatchId] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const available = matches.filter(
    // A fixture match must be linked first: once delegated, this phone stops syncing it.
    (m) =>
      m.serverAccountId === account.accountId &&
      m.version === 0 &&
      m.serverVersion === 0 &&
      (!m.fixtureRef || m.fixtureRef.linked),
  );
  useEffect(() => {
    if (!online) return;
    let active = true;
    void api<Assignment[]>('/account/assignments', undefined, account.token)
      .then((value) => {
        if (active) setItems(value);
      })
      .catch(() => {
        if (active) setMessage('Unable to load scorer assignments.');
      });
    return () => {
      active = false;
    };
  }, [account.token, online, revision]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await work();
      setRevision((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Assignment could not be completed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Scorer assignments">
      <h3>Scorer assignments</h3>
      <p>
        Assign before scoring begins. The recipient must already have signed in. Assignment removes
        this device’s scoring authority; sync all work first.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const match = await db.matches.get(matchId);
            if (!match || match.version !== 0 || match.serverVersion !== 0)
              throw new Error('Only a synced match with no recorded events can be assigned.');
            await api(
              `/matches/${matchId}/scorer`,
              { phone: normalizePhone(phone) },
              account.token,
            );
            await db.matches.update(matchId, { scoringDelegated: true });
            setMessage('Scorer assigned. They can accept it from their account.');
            setPhone('');
          });
        }}
      >
        <label>
          Match to assign
          <select required value={matchId} onChange={(event) => setMatchId(event.target.value)}>
            <option value="">Select a synced, unscored match</option>
            {available.map((match) => (
              <option key={match.id} value={match.id}>
                {match.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scorer phone
          <input
            required
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <button disabled={!online || busy || !available.length}>Assign scorer</button>
      </form>
      <h4>Assigned to me</h4>
      {items.length === 0 && <p>No assignments loaded.</p>}
      {items.map((item) => (
        <div key={item.matchId}>
          <p>
            {item.teamA} vs {item.teamB}
          </p>
          <button
            disabled={!online || busy}
            onClick={() =>
              void run(async () => {
                const existing = await db.matches.get(item.matchId);
                if (
                  existing &&
                  existing.ownerSessionId === account.deviceId &&
                  !existing.scoringDelegated
                ) {
                  setMessage('Already on this device. Open the match from your match list.');
                  return;
                }
                if (existing && existing.version > 0)
                  throw new Error('Local history exists. It will not be replaced.');
                const state = await api<MatchState>(
                  `/matches/${item.matchId}/scorer/accept`,
                  {},
                  account.token,
                );
                const now = new Date().toISOString();
                await db.transaction('rw', db.matches, db.events, () =>
                  Dexie.Promise.all([db.matches.get(item.matchId), db.events.where('matchId').equals(item.matchId).count()]).then(([latest, localEvents]) => {
                  if ((latest && latest.version > 0) || localEvents)
                    throw new Error('Local history exists. It will not be replaced.');
                  return db.matches.put({
                    id: item.matchId,
                    name: `${item.teamA} vs ${item.teamB}`,
                    rulesetVersion: item.rulesetVersion,
                    createdAt: new Date(state.clock.startedAt ?? Date.now()).toISOString(),
                    updatedAt: now,
                    ownerSessionId: account.deviceId,
                    version: 0,
                    serverVersion: 0,
                    serverAccountId: account.accountId,
                    localAccountId: account.accountId,
                    initialState: structuredClone(state),
                    state,
                  });
                }));
                setMessage(
                  'Ready on this device. Open the match from your match list; offline scoring is available.',
                );
              })
            }
          >
            {item.accepted ? 'Open on scoring device' : 'Accept on this device'}
          </button>
        </div>
      ))}
      <button
        className="secondary"
        disabled={!online || busy}
        onClick={() => setRevision((value) => value + 1)}
      >
        Refresh assignments
      </button>
      {message && <p>{message}</p>}
    </section>
  );
}
