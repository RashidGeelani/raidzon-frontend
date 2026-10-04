import { useEffect, useState } from 'react';
import {
  activePlayers,
  clockStartsWithFirstRaid,
  isScorable,
  opposite,
  remainingTime,
  usesV3Rules,
  type LocalMatch,
  type MatchEvent,
  type MatchIntent,
  type Side,
  isDoOrDie,
  usesDoOrDie,
} from '../domain/match-types';
import { scoreRaid, type RaidOutcome } from '../domain/score-raid';
import { DoOrDieAlert } from './DoOrDieAlert';
import { undoTarget } from '../../matches/data/match-repository';
import { CourtDrawers } from './CourtDrawers';
import { MatchResult } from './MatchResult';
import { SidelineToggle } from '../../../app/DisplaySettingsCard';
import { eventLabel, plural } from '../domain/event-label';
import { raidWarning, unlockRaidAudio, useRaidWarning } from '../raid-warning';

const clockText = (ms: number) =>
  `${Math.floor(Math.ceil(ms / 1000) / 60)
    .toString()
    .padStart(2, '0')}:${(Math.ceil(ms / 1000) % 60).toString().padStart(2, '0')}`;

export function LiveMatch({
  match,
  events,
  onRecord,
  onBack,
  onShare,
  saving,
}: {
  match: LocalMatch;
  events: MatchEvent[];
  onRecord: (intent: MatchIntent) => Promise<void>;
  onBack: () => void;
  onShare?: () => void;
  saving: boolean;
}) {
  const state = match.state;
  const [now, setNow] = useState(Date.now());
  // No outcome is pre-selected, so a rushed Confirm cannot record an empty raid by accident.
  const [outcome, setOutcome] = useState<RaidOutcome | null>(null);
  const [defenders, setDefenders] = useState<string[]>([]);
  const [tacklerId, setTacklerId] = useState('');
  const [bonus, setBonus] = useState(false);
  const [selfOutId, setSelfOutId] = useState('');
  const [raidSelfOuts, setRaidSelfOuts] = useState<string[]>([]);
  const [outOrder, setOutOrder] = useState<string[]>([]);
  const [tieSelection, setTieSelection] = useState<[string[], string[]]>([
    Array(5).fill(''),
    Array(5).fill(''),
  ]);
  const [subSide, setSubSide] = useState<Side>(0);
  const [outgoingId, setOutgoingId] = useState('');
  const [incomingId, setIncomingId] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setDefenders([]);
    setTacklerId('');
    setBonus(false);
    setOutcome(null);
    setSelfOutId('');
    setRaidSelfOuts([]);
    setOutOrder([]);
    setOutgoingId('');
    setIncomingId('');
  }, [match.version]);
  const attack = state.teams[state.turn];
  const defend = state.teams[opposite(state.turn)];
  const defendersOnCourt = activePlayers(defend);
  const raidRemaining = remainingTime(state.raidClock, now);
  const expiryPending =
    !!state.currentRaiderId &&
    raidRemaining === 0 &&
    !state.expiryReviewed &&
    state.status === 'LIVE';
  const halfWaiting =
    clockStartsWithFirstRaid(match.rulesetVersion) &&
    state.phase === 'REGULATION' &&
    state.status !== 'COMPLETED' &&
    state.clock.startedAt === null &&
    state.clock.remainingMs === state.halfMinutes * 60_000;
  const raiding = !!state.currentRaiderId && state.status === 'LIVE';
  const raidWarn = raidWarning(raidRemaining, raiding);
  useRaidWarning(raiding ? `${state.half}:${state.raidNumber}:${state.currentRaiderId}` : null, raidRemaining);
  const target = undoTarget(events);
  const reversed = new Set(
    events.flatMap((e) => (e.intent.type === 'UNDO' ? [e.intent.targetEventId] : [])),
  );
  const currentRaider = attack.players.find((p) => p.id === state.currentRaiderId);
  const eligibleRaiders =
    state.phase === 'REGULATION'
      ? activePlayers(attack)
      : attack.players.filter(
          (p) =>
            p.status !== 'BENCH' &&
            (state.tieBreakerRaiders?.[state.turn] ?? []).includes(p.id) &&
            (state.phase === 'TIE_BREAK'
              ? p.id === state.tieBreakerRaiders?.[state.turn][state.tieRaids[state.turn]]
              : p.id !== state.lastTieRaiders?.[state.turn]),
        );
  const live =
    state.status === 'LIVE' && isScorable(match.rulesetVersion);
  const displayScores = state.phase === 'REGULATION' ? state.scores : state.tieScores;
  async function confirmAction(intent: MatchIntent, question: string) {
    if (window.confirm(question)) await onRecord(intent);
  }
  function toggleDefender(id: string) {
    setOutOrder((previous) =>
      defenders.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous.filter((item) => item !== id), id],
    );
    setRaidSelfOuts((previous) => previous.filter((item) => item !== id));
    setDefenders((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  }
  // v5: after two empty raids in a row, this raid must score or the raider is OUT.
  const doOrDie = usesDoOrDie(match.rulesetVersion) && isDoOrDie(state) && state.status !== 'COMPLETED';
  let raidPreview = 'Choose what happened in the raid.';
  if (outcome) try {
    const doOrDieFails =
      doOrDie && outcome === 'EMPTY' && !bonus && !defenders.length && !raidSelfOuts.length;
    const effectiveOutcome =
      (state.phase !== 'REGULATION' && outcome === 'EMPTY' && !bonus) || doOrDieFails ? 'SELF_OUT' : outcome;
    const result = scoreRaid({
      outcome: effectiveOutcome,
      defendingCount: defendersOnCourt.length,
      touches: defenders.length,
      defenderSelfOuts: raidSelfOuts.length,
      bonus,
    });
    const parts: string[] = [];
    if (result.attackingPoints) parts.push(`+${result.attackingPoints} ${attack.name}`);
    if (result.defendingPoints) parts.push(`+${result.defendingPoints} ${defend.name}`);
    if (!parts.length) parts.push('No points');
    const outs = defenders.length + raidSelfOuts.length;
    if (outs) parts.push(`${outs} defender${outs === 1 ? '' : 's'} out`);
    if (effectiveOutcome === 'TACKLE' || effectiveOutcome === 'SELF_OUT') parts.push('raider out');
    // Revivals only happen when someone is waiting to come back.
    const revived = Math.min(result.attackingRevivals, attack.queue.length);
    if (revived) parts.push(`${revived} revived`);
    if (result.allOutPoints) parts.push('All-out');
    if (doOrDieFails) parts.push('empty Do-or-Die raid');
    else if (effectiveOutcome !== outcome) parts.push('no touch in a tie-break: raider out');
    else if (result.superTackleExtra) parts.push('Super Tackle');
    raidPreview = parts.join(' · ');
  } catch {
    /* Incomplete selections are validated on confirmation. */
  }
  const teamBreakdown = (side: Side) =>
    events
      .filter((e) => !reversed.has(e.id) && e.intent.type !== 'UNDO')
      .flatMap((e) => e.components)
      .filter((c) => c.side === side)
      .reduce<Record<string, number>>(
        (totals, c) => ({ ...totals, [c.kind]: (totals[c.kind] || 0) + c.points }),
        {},
      );

  return (
    <div className="scoring-screen" onPointerDown={unlockRaidAudio}>
      <header className="live-view-header"><button className="tournament-back" onClick={onBack} aria-label="Back to matches">←</button><span className="live-status">{state.status.replaceAll('_', ' ')}</span><small>{state.status === 'COMPLETED' ? 'Match result' : 'Scorer mode'}</small><SidelineToggle />{onShare && <button className="share-live-button secondary" onClick={onShare}>Share live link</button>}</header>
      {!isScorable(match.rulesetVersion) && (
        <p role="status" className="field-note">
          Previous ruleset: history is preserved. Start a new match to use the updated rules.
        </p>
      )}
      <section className={`scoreboard ${state.status !== 'COMPLETED' ? 'scoreboard-compact' : ''}`} aria-label="Scoreboard">
        <div className="score-meta">
          <span>
            <i className={`dot ${live ? 'live' : ''}`} />
            {state.status.replaceAll('_', ' ')}
          </span>
          <span>
            {state.phase === 'REGULATION'
              ? `HALF ${state.half} · ${clockText(remainingTime(state.clock, now))}${halfWaiting ? ' · starts with first raid' : ''}`
              : state.phase === 'TIE_BREAK'
                ? 'FIVE RAIDS EACH'
                : `GOLDEN RAID · PAIR ${state.goldenPair}`}
          </span>
          <span>RAID {state.raidNumber}</span>
        </div>
        <div className="scores">
          {state.teams.map((team, side) => (
            <div
              className={`score-team ${side === state.turn && live ? 'raiding' : ''}`}
              key={side}
            >
              <span className={`team-mark side-${side}`}>
                {team.name.slice(0, 2).toUpperCase()}
              </span>
              <h2>{team.name}</h2>
              <strong>{displayScores[side]}</strong>
              <span>
                {state.status === 'COMPLETED'
                  ? state.winner === side
                    ? 'WINNER'
                    : state.winner === 'DRAW'
                      ? 'DRAW'
                      : 'FULL TIME'
                  : side === state.turn
                    ? '↗ RAIDING'
                    : 'DEFENDING'}
              </span>
            </div>
          ))}
        </div>
        <div className="score-footer">
          {state.phase !== 'REGULATION' ? (
            <>
              <span>
                Regulation {state.scores[0]}–{state.scores[1]}
              </span>
              <span>
                Raids {state.tieRaids[0]}–{state.tieRaids[1]}{' '}
                {state.phase === 'GOLDEN_RAID' &&
                  `· Pair score ${state.pairScores[0]}–${state.pairScores[1]}`}
              </span>
            </>
          ) : (
            <>
              <span>Raid #{state.raidNumber}</span>
              <span>{match.serverVersion === match.version ? 'Backed up' : 'On this phone'}</span>
            </>
          )}
        </div>
      </section>
      {state.status !== 'COMPLETED' && <CourtDrawers teams={state.teams} currentRaiderId={state.currentRaiderId} />}
      {doOrDie && state.status === 'LIVE' && !state.currentRaiderId && (
        <DoOrDieAlert key={`${state.half}:${state.raidNumber}`} team={attack.name} raidNumber={state.raidNumber} />
      )}
      <div className="match-layout">
        <div className="match-main">
          {state.status === 'COMPLETED' ? (
            <MatchResult match={match} events={events} watchLink={match.serverAccountId ? `${window.location.origin}/watch/${match.id}` : undefined} />
          ) : state.status === 'TIED' ? (
            <section className="panel">
              <p className="eyebrow">LEVEL AT FULL TIME</p>
              <h2>How will this one end?</h2>
              {state.teams.map((team, side) => (
                <fieldset key={side}>
                  <legend>{team.name}: five raiders in order</legend>
                  {tieSelection[side].map((id, index) => (
                    <label key={index}>
                      Raid {index + 1}
                      <select
                        aria-label={team.name + ' raid ' + (index + 1)}
                        value={id}
                        onChange={(e) =>
                          setTieSelection((previous) => {
                            const next: [string[], string[]] = [[...previous[0]], [...previous[1]]];
                            next[side][index] = e.target.value;
                            return next;
                          })
                        }
                      >
                        <option value="">Select raider</option>
                        {team.players
                          .filter((p) => p.status !== 'BENCH')
                          .map((p) => (
                            <option
                              key={p.id}
                              value={p.id}
                              disabled={tieSelection[side].includes(p.id) && id !== p.id}
                            >
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </fieldset>
              ))}
              <p className="field-note">
                All seven return before each raid. No empty raids: score a touch or bonus, otherwise
                the raider is OUT. Golden Raids cannot repeat your team's previous raider.
              </p>
              <p>
                {match.fixtureRef?.knockout
                  ? 'Knockout match: there must be a winner. Play five raids each; still level? Golden Raid pairs decide it.'
                  : 'Share the points, or play five raids each. Still level? Golden Raid pairs decide the winner.'}
              </p>
              <div className="actions">
                {!match.fixtureRef?.knockout && (
                  <button
                    className="secondary"
                    disabled={saving}
                    onClick={() =>
                      confirmAction({ type: 'DRAW' }, 'Accept a draw and finish this match?')
                    }
                  >
                    Accept draw
                  </button>
                )}
                <button
                  className="primary"
                  disabled={
                    saving ||
                    tieSelection.some((ids) => ids.some((id) => !id) || new Set(ids).size !== 5)
                  }
                  onClick={() =>
                    confirmAction(
                      { type: 'TIE_BREAK', raiderIds: tieSelection },
                      'Start five raids per team, followed by Golden Raid pairs if tied?',
                    )
                  }
                >
                  Decide winner →
                </button>
              </div>
            </section>
          ) : state.status === 'HALF_TIME' ? (
            <section className="panel">
              <p className="eyebrow">HALF-TIME</p>
              <h2>Take a breath. Keep the momentum.</h2>
              <p>
                Scores and OUT queues carry forward. Active substitution allowances reset for half
                two.
              </p>
              <button
                className="primary"
                disabled={saving}
                onClick={() => onRecord({ type: 'SECOND_HALF' })}
              >
                Start second half →
              </button>
            </section>
          ) : (
            <section className="panel raid-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">
                    {attack.name} · RAID {state.raidNumber}
                    {doOrDie && <span className="do-or-die-badge">Do-or-Die</span>}
                  </p>
                  <h2>
                    {state.status === 'PAUSED'
                      ? 'Match paused'
                      : currentRaider
                        ? `${currentRaider.name} is raiding`
                        : 'Who’s taking the raid?'}
                  </h2>
                </div>
                <div
                  className={`raid-clock ${expiryPending ? 'expired' : raidWarn ? 'warning' : ''}`}
                  aria-label="Raid timer"
                >
                  {clockText(raidRemaining)}
                </div>
              </div>
              {currentRaider && target?.intent.type === 'START_RAID' && state.status === 'LIVE' && (
                <button
                  type="button"
                  className="quiet wrong-raider"
                  disabled={saving}
                  onClick={() => onRecord({ type: 'UNDO', targetEventId: target.id })}
                >
                  ↶ Wrong raider? Pick again
                </button>
              )}
              {state.status === 'PAUSED' ? (
                <button
                  className="primary"
                  disabled={saving}
                  onClick={() => onRecord({ type: 'RESUME' })}
                >
                  Resume match
                </button>
              ) : (
                <>
                  {!currentRaider ? (
                    <>
                      <p className="field-note">
                        Tap the raider to start the raid and its clock.
                      </p>
                      <div className="player-grid">
                        {eligibleRaiders.map((p) => (
                          <button
                            key={p.id}
                            className="player-chip"
                            disabled={saving}
                            onClick={() => onRecord({ type: 'START_RAID', raiderId: p.id })}
                          >
                            {p.name}
                            <small>{p.raidPoints} raid pts</small>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : expiryPending ? (
                    <div className="expiry">
                      <h3>Raid clock reached zero</h3>
                      <p>Confirm the on-court decision before recording the result.</p>
                      <div className="actions">
                        <button
                          className="danger"
                          disabled={saving}
                          onClick={() =>
                            onRecord({
                              type: 'RAID',
                              raiderId: currentRaider.id,
                              outcome: 'SELF_OUT',
                              defenderIds: [],
                              bonus: false,
                            })
                          }
                        >
                          Raid expired · Self-Out
                        </button>
                        <button
                          className="secondary"
                          disabled={saving}
                          onClick={() => onRecord({ type: 'NOT_EXPIRED' })}
                        >
                          Not expired
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="outcomes">
                        {(
                          [
                            ['TOUCH', 'Successful'],
                            [
                              'EMPTY',
                              state.phase !== 'REGULATION'
                                ? 'No touch / bonus only'
                                : doOrDie
                                  ? 'Empty = OUT / bonus'
                                  : 'Empty / bonus only',
                            ],
                            ['TACKLE', 'Tackled'],
                            ['SELF_OUT', 'Self-Out'],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            className={outcome === value ? 'selected' : ''}
                            aria-pressed={outcome === value}
                            onClick={() => {
                              setOutcome(value);
                              setDefenders([]);
                              setTacklerId('');
                              setRaidSelfOuts([]);
                              setOutOrder([]);
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label className="bonus-toggle">
                        <input
                          type="checkbox"
                          checked={bonus}
                          disabled={defendersOnCourt.length < 6}
                          onChange={(e) => setBonus(e.target.checked)}
                        />
                        <span>
                          Bonus +1
                          <small>
                            {defendersOnCourt.length >= 6
                              ? 'Valid line crossing · no revival'
                              : 'Requires 6 or 7 defenders'}
                          </small>
                        </span>
                      </label>
                      {outcome && outcome !== 'EMPTY' && outcome !== 'TACKLE' && (
                        <>
                          <p className="field-note">Select defenders OUT, in OUT order.</p>
                          <div className="player-grid">
                            {defendersOnCourt.map((p) => (
                              <button
                                key={p.id}
                                className={`player-chip ${defenders.includes(p.id) ? 'selected' : ''}`}
                                aria-pressed={defenders.includes(p.id)}
                                onClick={() => toggleDefender(p.id)}
                              >
                                {p.name}
                                <small>
                                  {defenders.includes(p.id)
                                    ? `OUT #${outOrder.indexOf(p.id) + 1}`
                                    : 'On court'}
                                </small>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {outcome === 'TACKLE' && (
                        <label>
                          Defender credited
                          <select value={tacklerId} onChange={(e) => setTacklerId(e.target.value)}>
                            <option value="">Choose defender</option>
                            {defendersOnCourt.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {
                        <details>
                          <summary>Defender Self-Out during this raid</summary>
                          <p className="field-note">
                            Included in this same raid event. Team points and revivals only; no
                            individual credit.
                            {usesV3Rules(match.rulesetVersion) &&
                              ' If the last on-court raider is tackled, the self-out point stays but All-Out replaces the attacking revival: the opponent gets two extra points and all seven playing members return.'}
                          </p>
                          <div className="player-grid">
                            {defendersOnCourt.map((p) => (
                              <button
                                key={p.id}
                                className={`player-chip ${raidSelfOuts.includes(p.id) ? 'selected' : ''}`}
                                aria-pressed={raidSelfOuts.includes(p.id)}
                                onClick={() => {
                                  setOutOrder((previous) =>
                                    raidSelfOuts.includes(p.id)
                                      ? previous.filter((id) => id !== p.id)
                                      : [...previous.filter((id) => id !== p.id), p.id],
                                  );
                                  setDefenders((previous) => previous.filter((id) => id !== p.id));
                                  setRaidSelfOuts((previous) =>
                                    previous.includes(p.id)
                                      ? previous.filter((id) => id !== p.id)
                                      : [...previous, p.id],
                                  );
                                }}
                              >
                                {p.name}
                                <small>
                                  {raidSelfOuts.includes(p.id)
                                    ? `OUT #${outOrder.indexOf(p.id) + 1} · Self-Out`
                                    : 'Self-Out'}
                                </small>
                              </button>
                            ))}
                          </div>
                        </details>
                      }
                      {outcome === 'TACKLE' && (
                        <>
                          <p className="field-note">Defenders OUT before the tackle (if any), in OUT order.</p>
                          <div className="player-grid">
                            {defendersOnCourt.map((p) => (
                              <button
                                key={p.id}
                                className={`player-chip ${defenders.includes(p.id) ? 'selected' : ''}`}
                                aria-pressed={defenders.includes(p.id)}
                                onClick={() => toggleDefender(p.id)}
                              >
                                {p.name}
                                <small>
                                  {defenders.includes(p.id)
                                    ? `OUT #${outOrder.indexOf(p.id) + 1}`
                                    : 'On court'}
                                </small>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="raid-confirm-bar">
                      <div className="outcome-preview">{raidPreview}</div>
                      <button
                        className="primary full"
                        disabled={
                          saving ||
                          !outcome ||
                          (outcome === 'TOUCH' && !defenders.length) ||
                          (outcome === 'TACKLE' && !tacklerId)
                        }
                        onClick={() =>
                          onRecord({
                            type: 'RAID',
                            raiderId: currentRaider.id,
                            outcome: outcome!,
                            defenderIds: defenders,
                            defenderOutOrder: outOrder,
                            selfOutDefenderIds: raidSelfOuts,
                            bonus,
                            ...(outcome === 'TACKLE' ? { tacklerId } : {}),
                          })
                        }
                      >
                        {saving ? 'Saving…' : 'Confirm raid →'}
                      </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}
          <div className="toolbar">
            <button
              className="secondary"
              disabled={saving || !target}
              onClick={() =>
                target &&
                confirmAction(
                  { type: 'UNDO', targetEventId: target.id },
                  `Undo “${eventLabel(target.summary)}”?`,
                )
              }
            >
              ↶ Undo last event
            </button>
            {live && (
              <button
                className="quiet"
                disabled={saving}
                onClick={() => onRecord({ type: 'PAUSE' })}
              >
                Pause match
              </button>
            )}
            {['LIVE', 'PAUSED'].includes(state.status) && state.phase === 'REGULATION' && (
              <button
                className="quiet"
                disabled={saving || !!state.currentRaiderId}
                onClick={() =>
                  confirmAction(
                    { type: state.half === 1 ? 'END_HALF' : 'END_MATCH' },
                    state.half === 1 ? 'End the first half now?' : 'End regulation now?',
                  )
                }
              >
                {state.half === 1 ? 'End first half' : 'End regulation'}
              </button>
            )}
          </div>
          {live && (
            <details className="panel">
              <summary>Official actions</summary>
              <p className="field-note">Technical points give no individual credit or revival.</p>
              <div className="actions">
                {state.teams.map((team, side) => (
                  <button
                    className="secondary"
                    disabled={saving}
                    key={side}
                    onClick={() => onRecord({ type: 'TECHNICAL', side: side as Side })}
                  >
                    +1 Technical · {team.name}
                  </button>
                ))}
              </div>
              <label>
                Defender Self-Out
                <select value={selfOutId} onChange={(e) => setSelfOutId(e.target.value)}>
                  <option value="">Choose active defender</option>
                  {defendersOnCourt.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary"
                disabled={saving || !selfOutId || !!state.currentRaiderId}
                onClick={() => onRecord({ type: 'DEFENDER_SELF_OUT', playerId: selfOutId })}
              >
                Record defender Self-Out
              </button>
            </details>
          )}
          {state.phase === 'REGULATION' &&
            ['LIVE', 'PAUSED', 'HALF_TIME'].includes(state.status) && (
              <details className="panel">
                <summary>Substitutions</summary>
                <div className="settings">
                  <label>
                    Team
                    <select
                      value={subSide}
                      onChange={(e) => {
                        setSubSide(Number(e.target.value) as Side);
                        setOutgoingId('');
                        setIncomingId('');
                      }}
                    >
                      {state.teams.map((t, i) => (
                        <option key={i} value={i}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Player leaving
                    <select value={outgoingId} onChange={(e) => setOutgoingId(e.target.value)}>
                      <option value="">Choose player</option>
                      {state.teams[subSide].players
                        .filter((p) => p.status !== 'BENCH')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.status}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Substitute entering
                    <select value={incomingId} onChange={(e) => setIncomingId(e.target.value)}>
                      <option value="">Choose substitute</option>
                      {state.teams[subSide].players
                        .filter((p) => p.status === 'BENCH')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <p className="field-note">
                  {state.teams[subSide].activeSubstitutions}/3 active substitutions used this half.
                  OUT substitutions retain their queue position.
                </p>
                <button
                  className="secondary"
                  disabled={saving || !!state.currentRaiderId || !outgoingId || !incomingId}
                  onClick={() =>
                    onRecord({ type: 'SUBSTITUTE', side: subSide, outgoingId, incomingId })
                  }
                >
                  Confirm substitution
                </button>
              </details>
            )}
          <section className="panel">
            <div className="panel-title">
              <h2>Match timeline</h2>
              <span className="tag">{plural(events.length, 'event')}</span>
            </div>
            {events.length === 0 ? (
              <p className="muted">A clear court. Start the first raid to begin the story.</p>
            ) : (
              <ol className="timeline">
                {[...events].reverse().map((event) => (
                  <li key={event.id} className={reversed.has(event.id) ? 'reversed' : ''}>
                    <span className="event-number">{String(event.sequence).padStart(2, '0')}</span>
                    <div>
                      <strong>{eventLabel(event.summary)}</strong>
                      <small>
                        {event.components
                          .map(
                            (c) =>
                              `${state.teams[c.side].name} +${c.points} ${c.kind.toLowerCase().replaceAll('_', ' ')}`,
                          )
                          .join(' · ')}
                        {reversed.has(event.id) ? ' · UNDONE' : ''}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <details className="match-aside"><summary>Full rosters and revival queues</summary>
          {state.teams.map((team, index) => (
            <section className="panel" key={index}>
              <div className="panel-title">
                <h2>{team.name}</h2>
                <span className={`team-dot side-${index}`} />
              </div>
              <div className="court-count">
                <strong>{activePlayers(team).length}</strong>
                <span>ON COURT</span>
                <small>{team.queue.length} out</small>
              </div>
              <div className="roster-list">
                {team.players.map((p) => (
                  <div key={p.id}>
                    <span>
                      {p.name}
                      <small>
                        {p.raidPoints} raid · {p.tacklePoints} tackle
                        {p.raidPoints >= 10 ? ' · Super 10' : ''}
                        {p.tacklePoints >= 5 ? ' · High Five' : ''}
                      </small>
                    </span>
                    <span className={`status status-${p.status.toLowerCase()}`}>{p.status}</span>
                  </div>
                ))}
              </div>
              <p className="eyebrow queue-label">NEXT TO RETURN</p>
              <p className="queue">
                {team.queue.length
                  ? team.queue.map((id) => team.players.find((p) => p.id === id)?.name).join(' → ')
                  : 'No players waiting'}
              </p>
              {state.status === 'COMPLETED' && (
                <div className="breakdown">
                  {Object.entries(teamBreakdown(index as Side)).map(([kind, points]) => (
                    <p key={kind}>
                      <span>{kind.toLowerCase().replaceAll('_', ' ')}</span>
                      <strong>{points}</strong>
                    </p>
                  ))}
                </div>
              )}
            </section>
          ))}
        </details>
      </div>
    </div>
  );
}
