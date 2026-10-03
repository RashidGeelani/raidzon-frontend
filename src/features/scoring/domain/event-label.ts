/**
 * Event summaries are stored in a compact form shared with the server ("end half",
 * "Star 1: touch"). These helpers turn them into the words people read.
 */
const LIFECYCLE: Record<string, string> = {
  'end half': 'Half-time',
  'second half': 'Second half started',
  'end match': 'Full time',
  pause: 'Match paused',
  resume: 'Match resumed',
  draw: 'Draw accepted',
  'tie break': 'Tie-break started',
  'not expired': 'Raid not expired (official decision)',
};

const OUTCOMES: Record<string, string> = {
  touch: 'successful raid',
  empty: 'empty raid',
  tackle: 'tackled',
  'self out': 'self-out',
};

export function eventLabel(summary: string): string {
  const text = summary.trim();
  const lifecycle = LIFECYCLE[text.toLowerCase()];
  if (lifecycle) return lifecycle;
  const raid = text.match(/^(.*): (touch|empty|tackle|self out)( \+ bonus)?(.*)$/i);
  if (raid) return `${raid[1]} · ${OUTCOMES[raid[2].toLowerCase()]}${raid[3] ? ' + bonus' : ''}${raid[4]}`;
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

export const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
