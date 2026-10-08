import type { ScoreComponent, Side } from './match-types';

export type HighlightKind = 'SUPER_RAID' | 'SUPER_TACKLE' | 'ALL_OUT' | 'TECHNICAL';
export interface Highlight { kind: HighlightKind; side: Side }

export const HIGHLIGHT_TITLES: Record<HighlightKind, string> = {
  SUPER_RAID: 'Super Raid',
  SUPER_TACKLE: 'Super Tackle',
  ALL_OUT: 'All Out',
  TECHNICAL: 'Technical point',
};

/**
 * The big moments in one event, read from the points the scoring engine already awarded:
 * Super Raid = 3+ raider points (touches + bonus), Super Tackle = the extra point against 3 or fewer
 * defenders, All Out = the 2 All-Out points, technical point = the technical award.
 */
export function highlights(components: readonly Pick<ScoreComponent, 'kind' | 'side' | 'points'>[]): Highlight[] {
  const found: Highlight[] = [];
  const raid = components.filter((c) => c.kind === 'TOUCH' || c.kind === 'BONUS');
  if (raid.reduce((sum, c) => sum + c.points, 0) >= 3) found.push({ kind: 'SUPER_RAID', side: raid[0].side });
  for (const [kind, component] of [['SUPER_TACKLE', 'SUPER_TACKLE_EXTRA'], ['ALL_OUT', 'ALL_OUT'], ['TECHNICAL', 'TECHNICAL']] as const) {
    const hit = components.find((c) => c.kind === component);
    if (hit) found.push({ kind, side: hit.side });
  }
  return found;
}

export interface HighlightEvent { id: string; components?: readonly Pick<ScoreComponent, 'kind' | 'side' | 'points'>[] | null; at?: number }
/**
 * What to pop for the newest event on screen; each event pops once. Never pops for history: without
 * a timestamp `at` (ms) the first event seen is history (a fan opening mid-match); with one, events
 * older than 15 s are. An Undo has no components, and the event it brings back to the top was seen.
 */
export function popFor(seen: { ids?: Set<string> }, event: HighlightEvent, now = Date.now()): Highlight[] {
  if (!seen.ids) {
    seen.ids = new Set();
    if (event.at === undefined) { seen.ids.add(event.id); return []; }
  }
  if (seen.ids.has(event.id)) return [];
  seen.ids.add(event.id);
  if (event.at !== undefined && now - event.at > 15_000) return [];
  return highlights(event.components ?? []);
}
