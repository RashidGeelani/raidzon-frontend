import { useEffect, useState, type FormEvent } from 'react';
import { createMatch, recentPlayers, type TeamInput } from '../data/match-repository';
import type { LocalMatch, Side } from '../../scoring/domain/match-types';
import type { PreparedFixture } from '../../tournaments/types';
import { SavedTeamPicker } from '../../teams/SavedTeamPicker';
import { LineupPicker } from '../../teams/LineupPicker';
import { defaultLineup, lineupToTeamInput, rosterMembers } from '../../teams/data/team-client';

const emptyTeam = (): TeamInput => ({
  name: '',
  players: Array.from({ length: 7 }, () => ({ name: '', phone: '' })),
});
export function MatchSetup({
  session,
  onCreated,
  onCancel,
  preset,
}: {
  session: string;
  onCreated: (match: LocalMatch) => void;
  onCancel: () => void;
  preset?: PreparedFixture | null;
}) {
  const [teams, setTeams] = useState<[TeamInput, TeamInput]>(() => {
    const teamA = emptyTeam();
    const teamB = emptyTeam();
    if (preset) {
      teamA.name = preset.teamA;
      teamB.name = preset.teamB;
      // Tournament squads hold up to 20; start with the default 7 starters + 5 substitutes.
      const fromRoster = (name: string, roster: { name: string; phone: string }[]) =>
        lineupToTeamInput({ name, members: rosterMembers(roster) }, defaultLineup(rosterMembers(roster))).players;
      if (preset.rosterA.length >= 7) teamA.players = fromRoster(preset.teamA, preset.rosterA);
      if (preset.rosterB.length >= 7) teamB.players = fromRoster(preset.teamB, preset.rosterB);
    }
    return [teamA, teamB];
  });
  const [firstTurn, setFirstTurn] = useState<Side>(0);
  const [halfMinutes, setHalfMinutes] = useState(preset?.halfMinutes ?? 20);
  const [raidSeconds, setRaidSeconds] = useState(preset?.raidSeconds ?? 30);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Once blank names are filled in automatically, the match is a practice match.
  const [practice, setPractice] = useState(false);
  // Players scored before on this phone, offered as suggestions so names and numbers are typed once.
  const [recent, setRecent] = useState<{ name: string; phone: string }[]>([]);
  useEffect(() => {
    let active = true;
    void recentPlayers().then((rows) => active && setRecent(rows)).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const phoneRequired = !!preset;
  function quickFill() {
    setPractice(true);
    setTeams((previous) => {
      const next = structuredClone(previous);
      next.forEach((team, side) => {
        if (!team.name.trim()) team.name = side === 0 ? 'Team A' : 'Team B';
        team.players.forEach((player, index) => {
          if (!player.name.trim()) player.name = `${side === 0 ? 'A' : 'B'} player ${index + 1}`;
        });
      });
      return next;
    });
  }
  function pickName(side: Side, playerIndex: number, value: string) {
    update(side, (t) => {
      const player = t.players[playerIndex];
      player.name = value;
      const known = recent.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());
      if (known && !player.phone.trim()) player.phone = known.phone;
    });
  }
  function update(side: Side, change: (team: TeamInput) => void) {
    setTeams((previous) => {
      const next = structuredClone(previous);
      change(next[side]);
      return next;
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      onCreated(
        await createMatch(
          {
            teams,
            firstTurn,
            halfMinutes,
            raidSeconds,
            practice: practice && !preset,
            fixtureRef: preset
              ? { tournamentId: preset.tournamentId, fixtureId: preset.fixtureId, knockout: !!preset.knockout }
              : undefined,
          },
          session,
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="setup">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SET THE COURT</p>
          <h1>A match starts here.</h1>
          <p>Seven starters a side. Phone numbers are optional — add them to keep players’ stats across matches.</p>
          {preset && (
            <p>
              Fixture prepared: {preset.teamA} vs {preset.teamB}. Add the players, then sync the
              match; it will link to the fixture after synchronization.
            </p>
          )}
        </div>
        <button type="button" className="quiet" onClick={onCancel}>
          Back to matches
        </button>
      </div>
      <section className="panel settings" aria-label="Match settings">
        {preset && (
          <p className="field-note settings-locked">Team names come from the fixture. Timers start at the tournament’s defaults — change them if this match is shorter or longer.</p>
        )}
        <label>
          First raid
          <select value={firstTurn} onChange={(e) => setFirstTurn(Number(e.target.value) as Side)}>
            <option value={0}>{teams[0].name || 'Team A'}</option>
            <option value={1}>{teams[1].name || 'Team B'}</option>
          </select>
        </label>
        <label>
          Minutes per half
          <input
            required
            type="number"
            min={1}
            max={60}
            value={halfMinutes}
            onChange={(e) => setHalfMinutes(Number(e.target.value))}
          />
        </label>
        <label>
          Seconds per raid
          <input
            required
            type="number"
            min={5}
            max={120}
            value={raidSeconds}
            onChange={(e) => setRaidSeconds(Number(e.target.value))}
          />
        </label>
      </section>
      {!preset && (
        <div className="setup-quick">
          <button type="button" className="secondary" onClick={quickFill}>Quick match: fill blank names</button>
          <small>Fills empty team and player names so you can start scoring straight away. The match becomes a practice match.</small>
        </div>
      )}
      {practice && !preset && (
        <p className="practice-note" role="status">
          <span className="practice-tag">PRACTICE</span> Practice match: it won’t count towards player profiles or leaderboards.
        </p>
      )}
      {recent.length > 0 && (
        <datalist id="recent-players">
          {recent.map((player) => <option key={player.phone} value={player.name}>{`•••• ${player.phone.slice(-4)}`}</option>)}
        </datalist>
      )}
      <div className="setup-teams">
        {teams.map((team, index) => {
          const side = index as Side;
          return (
            <section className="panel" key={side}>
              <p className="eyebrow">TEAM {side === 0 ? 'A' : 'B'}</p>
              {preset ? (
                // Fixture matches may only use the team's registered tournament roster.
                (side === 0 ? preset.rosterA : preset.rosterB).length >= 7 && (
                  <LineupPicker
                    startOpen={false}
                    teamName={side === 0 ? preset.teamA : preset.teamB}
                    members={rosterMembers(side === 0 ? preset.rosterA : preset.rosterB)}
                    onApply={(picked) => update(side, (t) => { t.players = picked.players; })}
                  />
                )
              ) : (
                <SavedTeamPicker
                  label={`Team ${side === 0 ? 'A' : 'B'}`}
                  onApply={(saved) =>
                    update(side, (t) => {
                      t.name = saved.name;
                      t.players = saved.players;
                    })
                  }
                />
              )}
              <label>
                Team name
                <input
                  required
                  maxLength={60}
                  readOnly={!!preset}
                  title={preset ? 'Set by the tournament fixture' : undefined}
                  value={team.name}
                  placeholder={side === 0 ? 'e.g. Valley Raiders' : 'e.g. City Warriors'}
                  onChange={(e) =>
                    update(side, (t) => {
                      t.name = e.target.value;
                    })
                  }
                />
              </label>
              <p className="field-note">Players 1–7 start on court.{phoneRequired ? ' Phone numbers stay private.' : ' Phone numbers are optional and stay private.'}</p>
              {team.players.map((player, playerIndex) => (
                <div className="player-input" key={playerIndex}>
                  <span className="number">{String(playerIndex + 1).padStart(2, '0')}</span>
                  <label>
                    <span className="sr-only">
                      Team {side + 1} player {playerIndex + 1} name
                    </span>
                    <input
                      required
                      maxLength={70}
                      placeholder={playerIndex < 7 ? 'Starter name' : 'Substitute name'}
                      list={recent.length ? 'recent-players' : undefined}
                      autoComplete="off"
                      value={player.name}
                      onChange={(e) => pickName(side, playerIndex, e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="sr-only">
                      Team {side + 1} player {playerIndex + 1} phone
                    </span>
                    <input
                      required={phoneRequired}
                      type="tel"
                      placeholder={phoneRequired ? 'Mobile number' : 'Mobile (optional)'}
                      value={player.phone}
                      onChange={(e) =>
                        update(side, (t) => {
                          t.players[playerIndex].phone = e.target.value;
                        })
                      }
                    />
                  </label>
                  {playerIndex >= 7 && (
                    <button
                      type="button"
                      className="quiet"
                      aria-label={`Remove substitute ${playerIndex + 1}`}
                      onClick={() =>
                        update(side, (t) => {
                          t.players.splice(playerIndex, 1);
                        })
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                disabled={team.players.length === 12}
                onClick={() =>
                  update(side, (t) => {
                    t.players.push({ name: '', phone: '' });
                  })
                }
              >
                + Add substitute <small>{team.players.length - 7}/5</small>
              </button>
            </section>
          );
        })}
      </div>
      <p className="field-note">
        Indian numbers can omit +91. For other countries, include the country code. No OTP is sent.
        {!phoneRequired && ' A player without a number is counted for this match only.'}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={saving}>
        {saving ? 'Saving match…' : 'Start match →'}
      </button>
    </form>
  );
}
