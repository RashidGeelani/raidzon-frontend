import { useEffect, useRef, useState } from 'react';
import type { TournamentGroup } from './data/format-types';

interface Drag {
  teamId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

/** Moves a team into a group (or within it) before `beforeTeamId`; null appends. */
export function moveTeam(groups: TournamentGroup[], teamId: string, toGroup: number, beforeTeamId: string | null): TournamentGroup[] {
  const next = groups.map((group) => ({ ...group, teamIds: group.teamIds.filter((id) => id !== teamId) }));
  const target = next[toGroup].teamIds;
  const index = beforeTeamId ? target.indexOf(beforeTeamId) : -1;
  target.splice(index < 0 ? target.length : index, 0, teamId);
  return next;
}

/**
 * Drag teams between groups (touch and mouse), or tap a team then tap "Move here". For a
 * knockout the single list is the seeding order: drag a team onto another to place it before it.
 */
export function GroupBoard({
  groups,
  teamName,
  disabled,
  onChange,
}: {
  groups: TournamentGroup[];
  teamName: (id: string) => string;
  disabled: boolean;
  onChange: (groups: TournamentGroup[]) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const single = groups.length === 1;

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const moved = current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 6;
      setDrag({ ...current, x: event.clientX, y: event.clientY, moved });
    };
    const up = (event: PointerEvent) => {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;
      if (!current.moved) {
        setPicked((value) => (value === current.teamId ? null : current.teamId));
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const groupEl = target?.closest<HTMLElement>('[data-drop-group]');
      if (!groupEl) return;
      const before = target?.closest<HTMLElement>('[data-team]')?.dataset.team ?? null;
      const toGroup = Number(groupEl.dataset.dropGroup);
      if (before === current.teamId) return;
      setPicked(null);
      onChange(moveTeam(groups, current.teamId, toGroup, before));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // groups/onChange are read when the drag ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, groups, onChange]);

  const pickedGroup = picked ? groups.findIndex((group) => group.teamIds.includes(picked)) : -1;
  return (
    <div className={`group-board ${single ? 'group-board-single' : ''} ${drag?.moved ? 'dragging' : ''}`}>
      {groups.map((group, index) => (
        <section className="group-column" key={group.id ?? 'draw'} data-drop-group={index} aria-label={single ? 'Seeding order' : `Group ${group.name}`}>
          <header>
            <strong>{single ? 'Seeding order' : `Group ${group.name}`}</strong>
            <small>{group.teamIds.length} team{group.teamIds.length === 1 ? '' : 's'}</small>
          </header>
          <ol>
            {group.teamIds.map((teamId, position) => (
              <li key={teamId} data-team={teamId}>
                <button
                  type="button"
                  className={`group-chip ${picked === teamId ? 'picked' : ''} ${drag?.moved && drag.teamId === teamId ? 'ghosted' : ''}`}
                  disabled={disabled}
                  aria-pressed={picked === teamId}
                  aria-label={`${teamName(teamId)}${single ? `, seed ${position + 1}` : `, group ${group.name}`}. Drag to move, or tap then choose where.`}
                  onPointerDown={(event) => {
                    if (disabled || event.button > 0) return;
                    setDrag({ teamId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setPicked((value) => (value === teamId ? null : teamId));
                    }
                  }}
                >
                  <span className="group-chip-grip" aria-hidden="true">⋮⋮</span>
                  {single && <b>{position + 1}</b>}
                  <span className="group-chip-name">{teamName(teamId)}</span>
                </button>
                {picked && picked !== teamId && single && (
                  <button type="button" className="group-place-here" onClick={() => { onChange(moveTeam(groups, picked, index, teamId)); setPicked(null); }}>
                    Place {teamName(picked)} here
                  </button>
                )}
              </li>
            ))}
            {group.teamIds.length === 0 && <li className="group-empty">Drop teams here</li>}
          </ol>
          {picked && !single && pickedGroup !== index && (
            <button type="button" className="group-move-here" onClick={() => { onChange(moveTeam(groups, picked, index, null)); setPicked(null); }}>
              Move {teamName(picked)} here
            </button>
          )}
        </section>
      ))}
      {drag?.moved && (
        <div className="group-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {teamName(drag.teamId)}
        </div>
      )}
    </div>
  );
}
