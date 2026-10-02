import { useState } from 'react';
import type { TeamInput } from '../matches/data/match-repository';
import { defaultLineup, lineupProblem, lineupToTeamInput, type LineupMember, type LineupSlot } from './data/team-client';

/** Pick 7 starters and up to 5 substitutes from a squad or tournament roster. */
export function LineupPicker({
  teamName,
  members,
  onApply,
  startOpen = true,
}: {
  teamName: string;
  members: LineupMember[];
  onApply: (team: TeamInput) => void;
  startOpen?: boolean;
}) {
  const [lineup, setLineup] = useState<Record<string, LineupSlot>>(() => defaultLineup(members));
  const [open, setOpen] = useState(startOpen);
  if (!open)
    return (
      <p className="field-note">
        {members.length} registered players. <button type="button" className="quiet" onClick={() => setOpen(true)}>Choose lineup</button>
      </p>
    );
  const problem = lineupProblem(lineup);
  const slots = Object.values(lineup);
  return (
    <div className="lineup-picker" aria-label={`${teamName} lineup`}>
      <p className="field-note">
        Starters {slots.filter((s) => s === 'STARTER').length}/7 · Substitutes {slots.filter((s) => s === 'SUB').length}/5
      </p>
      {members.map((member) => (
        <div className="lineup-row" key={member.id}>
          <span>
            {member.jersey != null && <b>{member.jersey} </b>}
            {member.name}
            {member.leadership === 'CAPTAIN' && <b className="lead-badge">C</b>}
            {member.leadership === 'VICE_CAPTAIN' && <b className="lead-badge">VC</b>}
          </span>
          <select
            aria-label={`${member.name} lineup slot`}
            value={lineup[member.id] ?? 'OUT'}
            onChange={(e) => setLineup({ ...lineup, [member.id]: e.target.value as LineupSlot })}
          >
            <option value="STARTER">Starter</option>
            <option value="SUB">Substitute</option>
            <option value="OUT">Not playing</option>
          </select>
        </div>
      ))}
      {problem && <p className="error" role="alert">{problem}</p>}
      <button
        type="button"
        className="secondary"
        disabled={!!problem}
        onClick={() => { onApply(lineupToTeamInput({ name: teamName, members }, lineup)); setOpen(false); }}
      >
        Use this lineup
      </button>
    </div>
  );
}
