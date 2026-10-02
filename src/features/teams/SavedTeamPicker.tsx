import { useEffect, useState } from 'react';
import type { TeamInput } from '../matches/data/match-repository';
import { restoreSession } from '../identity/data/session-store';
import { cachedTeams, refreshTeamCache, type TeamDetail } from './data/team-client';
import { LineupPicker } from './LineupPicker';

/** Fills one side of match setup from a saved squad. Works offline from the device cache. */
export function SavedTeamPicker({ label, onApply }: { label: string; onApply: (team: TeamInput) => void }) {
  const [teams, setTeams] = useState<TeamDetail[]>([]);
  const [teamId, setTeamId] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const account = await restoreSession().catch(() => null);
      if (!account) return;
      const show = async () => { const rows = await cachedTeams(account.accountId); if (active) setTeams(rows); };
      await show();
      if (navigator.onLine) await refreshTeamCache(account).then(show).catch(() => undefined);
    })();
    return () => { active = false; };
  }, []);

  const team = teams.find((item) => item.id === teamId);
  if (teams.length === 0) return null;
  return (
    <div className="saved-team-picker">
      <label>
        Load saved team
        <select aria-label={`${label}: load saved team`} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">— Type players manually —</option>
          {teams.map((item) => (
            <option key={item.id} value={item.id} disabled={item.members.length < 7}>
              {item.name} ({item.members.length} players{item.members.length < 7 ? ', needs 7' : ''})
            </option>
          ))}
        </select>
      </label>
      {team && <LineupPicker key={team.id + team.revision} teamName={team.name} members={team.members} onApply={onApply} />}
    </div>
  );
}
