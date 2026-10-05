import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Raids whose alert was already dismissed, so pause/resume or an undone raid start don't reopen it. */
const dismissed = new Set<string>();

/**
 * Full-screen warning shown once when a team's raid is Do-or-Die (two empty raids in a row).
 * One tap dismisses it; the raid card keeps a red Do-or-Die badge until the raid is scored.
 */
export function DoOrDieAlert({
  raidKey,
  team,
  raidNumber,
  points,
}: {
  raidKey: string;
  team: string;
  raidNumber: number;
  /** Defenders' points if the raid is empty: 2 against 3 or fewer defenders, otherwise 1. */
  points: number;
}) {
  const [open, setOpenState] = useState(() => !dismissed.has(raidKey));
  const setOpen = (next: boolean) => {
    if (!next) dismissed.add(raidKey);
    setOpenState(next);
  };
  useEffect(() => {
    if (!open) return;
    navigator.vibrate?.([120, 80, 120]);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  const alert = (
    <div
      className="do-or-die-alert"
      role="alertdialog"
      aria-modal="true"
      aria-label={`Do-or-Die raid for ${team}`}
      onClick={() => setOpen(false)}
    >
      <div className="do-or-die-alert-body">
        <p className="do-or-die-alert-eyebrow">RAID {raidNumber}</p>
        <h2>
          DO <span>OR</span> DIE
        </h2>
        <p className="do-or-die-alert-team">{team}</p>
        <p className="do-or-die-alert-rule">
          Two empty raids in a row. This raider must score a touch or bonus, or they are OUT and the
          defenders get {points === 1 ? '1 point' : `${points} points`}.
        </p>
        <button type="button" className="primary" autoFocus onClick={() => setOpen(false)}>
          Got it — pick the raider
        </button>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? alert : createPortal(alert, document.body);
}
