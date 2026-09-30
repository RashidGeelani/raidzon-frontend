import { useEffect, useState } from 'react';
import { restoreSession } from '../identity/data/session-store';
import { sessionId } from '../matches/data/match-repository';
import type { LocalMatch } from '../scoring/domain/match-types';

export function MatchActions({ matchId, matches, onScore, completed = false }: {
  matchId: string; matches: LocalMatch[]; onScore?: (id: string) => void; completed?: boolean;
}) {
  const [authority, setAuthority] = useState<{ device: string; account: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([sessionId(), restoreSession()]).then(([device, account]) => {
      if (active) setAuthority({ device, account: account?.accountId ?? null });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [matchId]);
  const local = matches.find((match) => match.id === matchId);
  const owner = local?.serverAccountId ?? local?.localAccountId;
  const canScore = local && authority && !local.scoringDelegated && local.ownerSessionId === authority.device && (!owner || owner === authority.account);
  return <div className="match-access-actions">
    <a className="watch-match" href={`/watch/${matchId}`}>{completed ? 'View result' : '◉ Watch Live'}</a>
    {canScore && onScore && !completed && <button onClick={() => onScore(matchId)}>Score</button>}
  </div>;
}
