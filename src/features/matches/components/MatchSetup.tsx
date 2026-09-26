import { useState, type FormEvent } from 'react';
import { createMatch, type TeamInput } from '../data/match-repository';
import type { LocalMatch, Side } from '../../scoring/domain/match-types';

const emptyTeam = (): TeamInput => ({
  name: '',
  players: Array.from({ length: 7 }, () => ({ name: '', phone: '' })),
});
export function MatchSetup({
  session,
  onCreated,
  onCancel,
}: {
  session: string;
  onCreated: (match: LocalMatch) => void;
  onCancel: () => void;
}) {
  const [teams, setTeams] = useState<[TeamInput, TeamInput]>([emptyTeam(), emptyTeam()]);
  const [firstTurn, setFirstTurn] = useState<Side>(0);
  const [halfMinutes, setHalfMinutes] = useState(20);
  const [raidSeconds, setRaidSeconds] = useState(30);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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
      onCreated(await createMatch({ teams, firstTurn, halfMinutes, raidSeconds }, session));
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
          <p>Seven starters. Your teams. No sign-in needed.</p>
        </div>
        <button type="button" className="quiet" onClick={onCancel}>
          Back to matches
        </button>
      </div>
      <div className="setup-teams">
        {teams.map((team, index) => {
          const side = index as Side;
          return (
            <section className="panel" key={side}>
              <p className="eyebrow">TEAM {side === 0 ? 'A' : 'B'}</p>
              <label>
                Team name
                <input
                  required
                  maxLength={60}
                  value={team.name}
                  placeholder={side === 0 ? 'e.g. Valley Raiders' : 'e.g. City Warriors'}
                  onChange={(e) =>
                    update(side, (t) => {
                      t.name = e.target.value;
                    })
                  }
                />
              </label>
              <p className="field-note">Players 1–7 start on court. Phone numbers stay private.</p>
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
                      value={player.name}
                      onChange={(e) =>
                        update(side, (t) => {
                          t.players[playerIndex].name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="sr-only">
                      Team {side + 1} player {playerIndex + 1} phone
                    </span>
                    <input
                      required
                      type="tel"
                      placeholder="Mobile number"
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
      <section className="panel settings">
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
      <p className="field-note">
        Indian numbers can omit +91. For other countries, include the country code. No OTP is sent.
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
