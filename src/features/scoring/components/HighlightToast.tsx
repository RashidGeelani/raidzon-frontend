import { useEffect, useRef, useState } from 'react';
import { HIGHLIGHT_TITLES, popFor, type Highlight, type HighlightEvent } from '../domain/highlights';

/**
 * Short pop-up for Super Raid, Super Tackle, All Out and technical points (see popFor). It never
 * blocks taps (pointer-events: none) and dismisses itself.
 */
export function HighlightToast({ event, teams }: { event?: HighlightEvent; teams: readonly string[] }) {
  const seen = useRef<{ ids?: Set<string> }>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [shown, setShown] = useState<Highlight[]>([]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!event) return;
    const found = popFor(seen.current, event);
    if (!found.length) return;
    clearTimeout(timer.current);
    setShown(found);
    timer.current = setTimeout(() => setShown([]), 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);
  return (
    <div className="highlight-toast-region" role="status" aria-live="polite">
      {shown.map((h) => (
        <div key={h.kind} className={`highlight-toast highlight-${h.kind.toLowerCase().replace('_', '-')} side-${h.side}`}>
          <strong>{HIGHLIGHT_TITLES[h.kind]}</strong>
          <span>{teams[h.side]}</span>
        </div>
      ))}
    </div>
  );
}
