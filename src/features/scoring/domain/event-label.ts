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
  const doOrDie = text.match(/^(.*): do-or-die raid failed( · Super Tackle)?$/i);
  if (doOrDie) return `${doOrDie[1]} · Do-or-Die failed · raider out${doOrDie[2] ? ' · Super Tackle' : ''}`;
  const raid = text.match(/^(.*): (touch|empty|tackle|self out)( \+ bonus)?(.*)$/i);
  if (raid) return `${raid[1]} · ${OUTCOMES[raid[2].toLowerCase()]}${raid[3] ? ' + bonus' : ''}${raid[4]}`;
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

export const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

/**
 * A raid told in full for viewers: "Waseem · successful raid · 2 touches + bonus · Super Raid",
 * "Waseem · unsuccessful raid · tackled by Jafar", "Waseem · self-out". nameOf finds the tackler and,
 * when the event lists them, the defenders put out ("2 touches (Bilal, Danish)").
 */
export function raidDetail(
  summary: string,
  components: { kind: string; points: number; playerId?: string | null }[] | null | undefined,
  nameOf: (playerId: string) => string | undefined,
  outs: { touchedIds?: string[] | null; selfOutIds?: string[] | null } = {},
): string {
  const names = (ids?: string[] | null) => (ids ?? []).map(nameOf).filter(Boolean).join(', ');
  const raid = summary.trim().match(/^(.*): (touch|empty|tackle|self out)( \+ bonus)?(.*)$/i);
  if (!raid) return eventLabel(summary);
  const parts = components ?? [];
  const touches = parts.filter((c) => c.kind === 'TOUCH').reduce((total, c) => total + c.points, 0);
  const touched = names(outs.touchedIds);
  const scored = [touches ? `${plural(touches, 'touch', 'touches')}${touched ? ` (${touched})` : ''}` : '', raid[3] ? 'bonus' : ''].filter(Boolean).join(' + ');
  const outcome = raid[2].toLowerCase();
  const tackler = parts.find((c) => c.kind === 'TACKLE' && c.playerId)?.playerId;
  const result =
    outcome === 'tackle'
      ? ['unsuccessful raid', `tackled${tackler && nameOf(tackler) ? ` by ${nameOf(tackler)}` : ''}`, scored]
      : outcome === 'self out'
        ? ['self-out', scored]
        : [scored ? 'successful raid' : 'empty raid', scored];
  const allOut = parts.some((c) => c.kind === 'ALL_OUT') ? ' · All Out' : '';
  const selfOuts = names(outs.selfOutIds);
  const rest = selfOuts ? raid[4].replace(/ · \d+ defender self-out/, ` · ${selfOuts} self-out`) : raid[4];
  return [raid[1], ...result.filter(Boolean)].join(' · ') + rest + allOut;
}
