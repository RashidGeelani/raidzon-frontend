import type { ReactNode } from 'react';

/** Small status label: neutral, live (red), success (green) or accent (orange). */
export function Chip({ tone = 'neutral', children }: { tone?: 'neutral' | 'live' | 'success' | 'accent'; children: ReactNode }) {
  return <span className={`ui-chip ${tone === 'neutral' ? '' : `ui-chip-${tone}`}`}>{children}</span>;
}
