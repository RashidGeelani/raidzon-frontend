import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Modal panel: slides up from the bottom on phones, centred on wider screens. Closes on the
 * backdrop, the × button or Escape, and returns focus to where it was.
 */
export function Sheet({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);
  return (
    <div className="ui-sheet-backdrop" onClick={onClose}>
      <div ref={panel} tabIndex={-1} className="ui-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="quiet" aria-label="Close" onClick={onClose}>×</button>
        </header>
        {children}
      </div>
    </div>
  );
}
