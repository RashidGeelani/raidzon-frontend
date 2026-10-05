import { scoreRaid } from './score-raid';
import {
  activePlayers,
  clockStartsWithFirstRaid,
  isScorable,
  opposite,
  usesV3Rules,
  usesDoOrDie,
  isDoOrDie,
  remainingTime,
  type MatchIntent,
  type MatchState,
  type Player,
  type ScoreComponent,
  type Side,
} from './match-types';

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function applyEvent(
  previous: MatchState,
  input: Exclude<MatchIntent, { type: 'UNDO' }>,
  now: number,
  rulesetVersion: string = 'raidzon-v3',
) {
  requireRule(isScorable(rulesetVersion), 'Unsupported ruleset version.');
  // v4: the half clock is waiting for its first raid (stopped with the full half remaining).
  const halfClockPending = () =>
    state.clock.startedAt === null && state.clock.remainingMs === state.halfMinutes * 60_000;
  const state = structuredClone(previous);
  const doOrDie = usesDoOrDie(rulesetVersion);
  if (doOrDie && !state.emptyRaids) state.emptyRaids = [0, 0];
  const emptyRaid =
    input.type === 'RAID' &&
    input.outcome === 'EMPTY' &&
    !input.bonus &&
    !input.defenderIds.length &&
    !(input.selfOutDefenderIds ?? []).length;
  // An empty Do-or-Die raid puts the raider out, scored exactly like a raider Self-Out.
  const doOrDieFailed = doOrDie && emptyRaid && isDoOrDie(state);
  const intent =
    input.type === 'RAID' &&
    ((state.phase !== 'REGULATION' && input.outcome === 'EMPTY' && !input.bonus) || doOrDieFailed)
      ? { ...input, outcome: 'SELF_OUT' as const }
      : input;
  const components: ScoreComponent[] = [];
  const team = (side: Side) => state.teams[side];
  const player = (side: Side, id: string, status: Player['status']) => {
    const found = team(side).players.find((item) => item.id === id);
    requireRule(found?.status === status, `Player must be ${status.toLowerCase()}.`);
    return found;
  };
  const out = (side: Side, id: string) => {
    player(side, id, 'ACTIVE').status = 'OUT';
    team(side).queue.push(id);
  };
  const revive = (side: Side, count: number) => {
    for (let i = 0; i < count && team(side).queue.length; i++) {
      player(side, team(side).queue.shift()!, 'OUT').status = 'ACTIVE';
    }
  };
  const add = (side: Side, kind: ScoreComponent['kind'], points: number, playerId?: string) => {
    if (points) components.push({ side, kind, points, ...(playerId ? { playerId } : {}) });
  };
  const allOut = (eliminated: Side) => {
    if (activePlayers(team(eliminated)).length) return;
    add(opposite(eliminated), 'ALL_OUT', 2);
    team(eliminated)
      .players.filter((p) => p.status === 'OUT')
      .forEach((p) => {
        p.status = 'ACTIVE';
      });
    team(eliminated).queue = [];
  };
  const stopClock = () => {
    state.clock = { remainingMs: remainingTime(state.clock, now), startedAt: null };
    state.raidClock = { remainingMs: remainingTime(state.raidClock, now), startedAt: null };
  };
  let summary: string = intent.type.replaceAll('_', ' ').toLowerCase();
  requireRule(
    previous.status !== 'COMPLETED',
    'This match is complete. Undo the last event to correct it.',
  );

  switch (intent.type) {
    case 'START_RAID':
      requireRule(
        state.status === 'LIVE' && !state.currentRaiderId,
        'Finish the current raid first.',
      );
      if (state.phase !== 'REGULATION') {
        const selected = state.tieBreakerRaiders[state.turn];
        requireRule(
          selected.includes(intent.raiderId),
          'Choose one of the five selected tie-break raiders.',
        );
        requireRule(
          state.phase !== 'TIE_BREAK' || selected[state.tieRaids[state.turn]] === intent.raiderId,
          'Follow the selected five-raider sequence.',
        );
        requireRule(
          state.phase !== 'GOLDEN_RAID' || state.lastTieRaiders[state.turn] !== intent.raiderId,
          'A raider cannot take consecutive Golden Raid turns for their team.',
        );
        resetCourt(state);
      }
      player(state.turn, intent.raiderId, 'ACTIVE');
      state.currentRaiderId = intent.raiderId;
      if (clockStartsWithFirstRaid(rulesetVersion) && state.phase === 'REGULATION' && halfClockPending())
        state.clock = { remainingMs: state.clock.remainingMs, startedAt: now };
      state.raidClock = { remainingMs: state.raidSeconds * 1000, startedAt: now };
      state.expiryReviewed = false;
      summary = `Raid ${state.raidNumber} started`;
      break;
    case 'NOT_EXPIRED':
      requireRule(
        state.status === 'LIVE' &&
          state.currentRaiderId &&
          remainingTime(state.raidClock, now) === 0 &&
          !state.expiryReviewed,
        'No raid expiry decision is pending.',
      );
      state.expiryReviewed = true;
      summary = 'Official decision: raid not expired';
      break;
    case 'RAID': {
      requireRule(state.status === 'LIVE', 'Resume the match before scoring.');
      requireRule(
        state.currentRaiderId === intent.raiderId,
        'Start the raid with this raider first.',
      );
      requireRule(
        remainingTime(state.raidClock, now) > 0 ||
          state.expiryReviewed ||
          intent.outcome === 'SELF_OUT',
        'Resolve the raid expiry before scoring.',
      );
      const attack = state.turn;
      const defend = opposite(attack);
      const raider = player(attack, intent.raiderId, 'ACTIVE');
      const selfOuts = intent.selfOutDefenderIds ?? [];
      const selectedOuts = [...intent.defenderIds, ...selfOuts];
      const allDefenderOuts = intent.defenderOutOrder ?? selectedOuts;
      requireRule(
        new Set(selectedOuts).size === selectedOuts.length,
        'A defender can only be selected once.',
      );
      requireRule(
        allDefenderOuts.length === selectedOuts.length &&
          new Set(allDefenderOuts).size === selectedOuts.length &&
          allDefenderOuts.every((id) => selectedOuts.includes(id)),
        'OUT order must contain every selected defender exactly once.',
      );
      requireRule(
        !intent.defenderIds.length || !selfOuts.length || intent.defenderOutOrder,
        'Record the sequential OUT order for mixed outs.',
      );
      allDefenderOuts.forEach((id) => player(defend, id, 'ACTIVE'));
      const result = scoreRaid({
        outcome: intent.outcome,
        defendingCount: activePlayers(team(defend)).length,
        touches: intent.defenderIds.length,
        bonus: intent.bonus,
        defenderSelfOuts: selfOuts.length,
      });
      if (intent.outcome === 'TACKLE') {
        requireRule(intent.tacklerId, 'Choose the defender credited with the tackle.');
        player(defend, intent.tacklerId, 'ACTIVE').tacklePoints += result.defenderPoints;
      } else requireRule(!intent.tacklerId, 'Only a tackle can name a tackler.');
      raider.raidPoints += result.raiderPoints;
      add(attack, 'TOUCH', intent.defenderIds.length, raider.id);
      add(attack, 'BONUS', Number(intent.bonus), raider.id);
      add(attack, 'SELF_OUT', selfOuts.length);
      add(defend, 'TACKLE', result.defenderPoints, intent.tacklerId);
      add(defend, 'SUPER_TACKLE_EXTRA', result.superTackleExtra);
      // A failed Do-or-Die against 3 or fewer defenders is worth 2, like a Super Tackle:
      // 1 Self-Out point + 1 team-only extra, still with one revival and no tackle credit.
      const doOrDieSuperTackle = doOrDieFailed && activePlayers(team(defend)).length <= 3;
      if (doOrDieSuperTackle) add(defend, 'SUPER_TACKLE_EXTRA', 1);
      if (intent.outcome === 'SELF_OUT') add(defend, 'SELF_OUT', 1);
      allDefenderOuts.forEach((id) => out(defend, id));
      if (intent.outcome === 'TACKLE' || intent.outcome === 'SELF_OUT') out(attack, raider.id);
      // A defender self-out cannot rescue a team whose last raider was tackled.
      const lastRaiderTackled =
        usesV3Rules(rulesetVersion) &&
        intent.outcome === 'TACKLE' &&
        selfOuts.length > 0 &&
        activePlayers(team(attack)).length === 0;
      if (!lastRaiderTackled) revive(attack, result.attackingRevivals);
      revive(defend, result.defendingRevivals);
      allOut(attack);
      allOut(defend);
      summary = `${raider.name}: ${intent.outcome.toLowerCase().replace('_', ' ')}${intent.bonus ? ' + bonus' : ''}${result.raiderPoints >= 3 ? ' · Super Raid' : ''}`;
      if (selfOuts.length) summary += ` · ${selfOuts.length} defender self-out`;
      if (doOrDieFailed)
        summary = `${raider.name}: do-or-die raid failed${doOrDieSuperTackle ? ' · Super Tackle' : ''}`;
      if (doOrDie && state.phase === 'REGULATION')
        state.emptyRaids![attack] = emptyRaid && !doOrDieFailed ? state.emptyRaids![attack] + 1 : 0;
      if (state.phase !== 'REGULATION') {
        state.tieRaids[attack]++;
        state.lastTieRaiders[attack] = raider.id;
      }
      state.raidNumber++;
      state.turn = defend;
      state.currentRaiderId = null;
      state.raidClock = { remainingMs: state.raidSeconds * 1000, startedAt: null };
      state.expiryReviewed = false;
      break;
    }
    case 'TECHNICAL':
      requireRule(state.status === 'LIVE', 'Technical points require a live match.');
      requireRule(intent.side === 0 || intent.side === 1, 'Choose a team.');
      add(intent.side, 'TECHNICAL', 1);
      summary = `${team(intent.side).name}: technical point`;
      break;
    case 'DEFENDER_SELF_OUT': {
      requireRule(state.status === 'LIVE', 'Self-Out requires a live match.');
      requireRule(!state.currentRaiderId, 'Include defender Self-Out in the current raid result.');
      const defend = opposite(state.turn);
      const subject = player(defend, intent.playerId, 'ACTIVE');
      out(defend, subject.id);
      add(state.turn, 'SELF_OUT', 1);
      revive(state.turn, 1);
      allOut(defend);
      summary = `${subject.name}: defender self-out`;
      break;
    }
    case 'SUBSTITUTE': {
      requireRule(
        ['LIVE', 'PAUSED', 'HALF_TIME'].includes(state.status) && state.phase === 'REGULATION',
        'Substitutions are available during regulation.',
      );
      requireRule(intent.side === 0 || intent.side === 1, 'Choose a team.');
      requireRule(!state.currentRaiderId, 'Finish the raid before substituting.');
      const incoming = player(intent.side, intent.incomingId, 'BENCH');
      const outgoing = team(intent.side).players.find((p) => p.id === intent.outgoingId);
      requireRule(outgoing && outgoing.status !== 'BENCH', 'Choose an on-court or OUT player.');
      if (outgoing.status === 'ACTIVE') {
        requireRule(
          team(intent.side).activeSubstitutions < 3,
          'Three active substitutions already used this half.',
        );
        team(intent.side).activeSubstitutions++;
      } else
        team(intent.side).queue = team(intent.side).queue.map((id) =>
          id === outgoing.id ? incoming.id : id,
        );
      incoming.status = outgoing.status;
      outgoing.status = 'BENCH';
      summary = `${incoming.name} replaces ${outgoing.name}`;
      break;
    }
    case 'PAUSE':
      requireRule(state.status === 'LIVE', 'Only a live match can be paused.');
      stopClock();
      state.status = 'PAUSED';
      break;
    case 'RESUME':
      requireRule(state.status === 'PAUSED', 'The match is not paused.');
      state.status = 'LIVE';
      state.clock.startedAt =
        state.phase === 'REGULATION' && !(clockStartsWithFirstRaid(rulesetVersion) && halfClockPending()) ? now : null;
      if (state.currentRaiderId) state.raidClock.startedAt = now;
      break;
    case 'END_HALF':
      requireRule(!state.currentRaiderId, 'Finish the raid before ending the half.');
      requireRule(
        state.half === 1 &&
          state.phase === 'REGULATION' &&
          ['LIVE', 'PAUSED'].includes(state.status),
        'Only the first half can end here.',
      );
      stopClock();
      state.status = 'HALF_TIME';
      break;
    case 'SECOND_HALF':
      requireRule(state.status === 'HALF_TIME', 'End the first half first.');
      state.half = 2;
      state.turn = opposite(state.firstTurn);
      state.status = 'LIVE';
      state.teams.forEach((t) => {
        t.activeSubstitutions = 0;
      });
      if (doOrDie) state.emptyRaids = [0, 0];
      state.clock = {
        remainingMs: state.halfMinutes * 60_000,
        startedAt: clockStartsWithFirstRaid(rulesetVersion) ? null : now,
      };
      break;
    case 'END_MATCH':
      requireRule(!state.currentRaiderId, 'Finish the raid before ending the match.');
      requireRule(
        state.half === 2 &&
          state.phase === 'REGULATION' &&
          ['LIVE', 'PAUSED'].includes(state.status),
        'End regulation during the second half.',
      );
      stopClock();
      state.status = state.scores[0] === state.scores[1] ? 'TIED' : 'COMPLETED';
      if (state.status === 'COMPLETED') state.winner = state.scores[0] > state.scores[1] ? 0 : 1;
      break;
    case 'DRAW':
      requireRule(state.status === 'TIED', 'A draw requires tied regulation scores.');
      state.status = 'COMPLETED';
      state.winner = 'DRAW';
      break;
    case 'TIE_BREAK':
      requireRule(state.status === 'TIED', 'Tie-break requires tied regulation scores.');
      requireRule(
        intent.raiderIds?.length === 2 &&
          intent.raiderIds.every(
            (ids, side) =>
              ids.length === 5 &&
              new Set(ids).size === 5 &&
              ids.every((id) =>
                state.teams[side].players.some((p) => p.id === id && p.status !== 'BENCH'),
              ),
          ),
        'Select five distinct playing raiders per team in order.',
      );
      state.tieBreakerRaiders = structuredClone(intent.raiderIds);
      state.lastTieRaiders = ['', ''];
      state.status = 'LIVE';
      state.phase = 'TIE_BREAK';
      state.turn = state.firstTurn;
      state.tieRaids = [0, 0];
      state.tieScores = [0, 0];
      state.clock.startedAt = null;
      resetCourt(state);
      break;
    default:
      throw new Error('Unsupported match action.');
  }
  for (const component of components) {
    if (state.phase === 'REGULATION') state.scores[component.side] += component.points;
    else {
      state.tieScores[component.side] += component.points;
      if (state.phase === 'GOLDEN_RAID') state.pairScores[component.side] += component.points;
    }
  }
  // Decide only after equal opportunities: never after the first raid in a pair.
  if (intent.type === 'RAID' && state.phase !== 'REGULATION') {
    const limit = state.phase === 'TIE_BREAK' ? 5 : 1;
    if (state.tieRaids[0] === limit && state.tieRaids[1] === limit) {
      const scores = state.phase === 'TIE_BREAK' ? state.tieScores : state.pairScores;
      if (scores[0] !== scores[1]) {
        state.status = 'COMPLETED';
        state.winner = scores[0] > scores[1] ? 0 : 1;
      } else {
        state.phase = 'GOLDEN_RAID';
        state.goldenPair++;
        state.tieRaids = [0, 0];
        state.pairScores = [0, 0];
        resetCourt(state);
      }
    }
  }
  assertState(state);
  return { state, components, summary };
}

function resetCourt(state: MatchState) {
  for (const team of state.teams) {
    team.players.forEach((player) => {
      if (player.status === 'OUT') player.status = 'ACTIVE';
    });
    team.queue = [];
  }
}

export function assertState(state: MatchState) {
  for (const team of state.teams) {
    const participating = team.players.filter((p) => p.status !== 'BENCH');
    requireRule(participating.length === 7, 'A team must retain seven playing positions.');
    const out = team.players
      .filter((p) => p.status === 'OUT')
      .map((p) => p.id)
      .sort();
    requireRule(
      JSON.stringify(out) === JSON.stringify([...team.queue].sort()),
      'OUT players and FIFO queue differ.',
    );
    requireRule(new Set(team.queue).size === team.queue.length, 'Duplicate player in queue.');
  }
}
