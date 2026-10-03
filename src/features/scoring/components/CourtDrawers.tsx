import { useState } from 'react';
import type { Side, Team } from '../domain/match-types';

/**
 * On-court players as two slim tabs on the screen edges (team A left, team B right). A tap opens
 * the team's panel: players on court with a green dot, then the revival queue in return order.
 */
export function CourtDrawers({
  teams,
  currentRaiderId,
}: {
  teams: [Team, Team] | Team[];
  currentRaiderId: string | null;
}) {
  // On wide screens the drawers sit beside the scoring column, so both start open.
  const [open, setOpen] = useState<[boolean, boolean]>(() => {
    const wide = typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 1100px)').matches;
    return [wide, wide];
  });
  // On phones only one drawer is open at a time so the two never overlap.
  const toggle = (side: Side) =>
    setOpen((previous) => {
      const next: [boolean, boolean] = [...previous];
      next[side] = !previous[side];
      if (next[side] && window.innerWidth < 640) next[side === 0 ? 1 : 0] = false;
      return next;
    });
  return (
    <>
      {teams.slice(0, 2).map((team, index) => {
        const side = index as Side;
        const onCourt = team.players.filter((player) => player.status === 'ACTIVE');
        const queue = team.queue
          .map((id) => team.players.find((player) => player.id === id))
          .filter((player): player is Team['players'][number] => !!player);
        const code = team.name.slice(0, 3).toUpperCase();
        return (
          <aside
            key={side}
            className={`court-drawer court-drawer-${side === 0 ? 'left' : 'right'} ${open[side] ? 'open' : ''}`}
            aria-label={`${team.name} on court`}
          >
            <button
              className="court-drawer-tab"
              aria-expanded={open[side]}
              aria-label={`${open[side] ? 'Hide' : 'Show'} ${team.name} on court`}
              onClick={() => toggle(side)}
            >
              <span className="court-drawer-tab-label">On court</span>
              <b className={`court-drawer-code court-team-${side}`}>{code}</b>
              <span className="court-drawer-count">{onCourt.length}</span>
              <i aria-hidden="true">{open[side] === (side === 0) ? '‹' : '›'}</i>
            </button>
            {open[side] && (
              <div className="court-drawer-panel">
                <strong className={`court-drawer-team court-team-${side}`}>{team.name}</strong>
                <ul className="court-drawer-list">
                  {onCourt.map((player) => (
                    <li key={player.id} className={player.id === currentRaiderId ? 'current' : ''}>
                      <i className="court-dot" aria-label="On court" />
                      <span>{player.name}</span>
                    </li>
                  ))}
                  {onCourt.length === 0 && <li className="muted">Nobody on court</li>}
                </ul>
                <p className="court-drawer-heading">Revival queue</p>
                {queue.length ? (
                  <ol className="court-drawer-list court-drawer-queue">
                    {queue.map((player, order) => (
                      <li key={player.id}>
                        <b title="Revival order">{order + 1}</b>
                        <span>{player.name}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="court-drawer-empty">No one waiting</p>
                )}
              </div>
            )}
          </aside>
        );
      })}
    </>
  );
}
