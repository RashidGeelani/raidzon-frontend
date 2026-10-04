import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full-screen warning shown once when a team's raid is Do-or-Die (two empty raids in a row).
 * One tap dismisses it; the raid card keeps a red Do-or-Die badge until the raid is scored.
 */
export function DoOrDieAlert({ team, raidNumber }: { team: string; raidNumber: number }) {
  const [open, setOpen] = useState(true);
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
          defenders get 1 point.
        </p>
        <button type="button" className="primary" autoFocus onClick={() => setOpen(false)}>
          Got it — pick the raider
        </button>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? alert : createPortal(alert, document.body);
}
