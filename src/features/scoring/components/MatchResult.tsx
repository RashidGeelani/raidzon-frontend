import { useMemo, useState } from 'react';
import type { LocalMatch, MatchEvent, Side } from '../domain/match-types';
import { milestones, summarizeMatch, type MatchSummary, type Standout, type TeamPerformance } from '../domain/match-summary';

const TEAM_COLORS = ['#ff5a1f', '#4c7dff'] as const;

/** Full-time result: winner, standout players, both teams' numbers and a story-sized share image. */
export function MatchResult({ match, events, watchLink }: { match: LocalMatch; events: MatchEvent[]; watchLink?: string }) {
  const state = match.state;
  const summary = useMemo(() => summarizeMatch(state, events), [state, events]);
  const margin = Math.abs(summary.teams[0].total - summary.teams[1].total);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  async function share() {
    setBusy(true);
    setNote('');
    try {
      const blob = await renderResultImage(summary, { tieBreak: state.phase !== 'REGULATION' ? state.tieScores : null });
      const file = new File([blob], `raidzon-${slug(summary.teams[0].name)}-vs-${slug(summary.teams[1].name)}.png`, { type: 'image/png' });
      const text = `${summary.headline}! ${summary.teams[0].name} ${summary.teams[0].total} – ${summary.teams[1].total} ${summary.teams[1].name}${watchLink ? `\nFull scorecard: ${watchLink}` : ''}`;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: summary.headline, text });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setNote('Image saved. Post it to WhatsApp status or your Instagram story.');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setNote('Could not create the image on this device.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="match-result" aria-label="Match result">
      <div className="result-hero">
        <p className="eyebrow">{summary.winner === 'DRAW' ? 'HONOURS SHARED' : 'MATCH DECIDED'}</p>
        <h2>{summary.headline}</h2>
        <p className="result-hero-margin">
          {summary.winner === 'DRAW'
            ? 'Level at full time · 1 table point each in a tournament'
            : `${margin ? `By ${margin} point${margin === 1 ? '' : 's'}` : 'Won on the tie-break'} · 3 table points in a tournament`}
        </p>
        <button className="result-share" disabled={busy} onClick={() => void share()}>
          {busy ? 'Preparing…' : 'Share result'}
          <small>WhatsApp · Instagram story</small>
        </button>
        {note && <p className="field-note" role="status">{note}</p>}
      </div>
      {(summary.playerOfTheMatch || summary.topRaider || summary.topDefender) && <div className="result-standouts">
        <StandoutRow label="Player of the match" icon="★" standout={summary.playerOfTheMatch} value={(s) => plural(s.player.raidPoints + s.player.tacklePoints, 'pt')} featured />
        <StandoutRow label="Top raider" icon="↗" standout={summary.topRaider} value={(s) => plural(s.player.raidPoints, 'raid pt')} />
        <StandoutRow label="Top defender" icon="⛨" standout={summary.topDefender} value={(s) => plural(s.player.tacklePoints, 'tackle pt')} />
      </div>}
      <div className="result-teams">
        {summary.teams.map((team, side) => (
          <TeamCard key={side} team={team} side={side as Side} winner={summary.winner === side} />
        ))}
      </div>
    </section>
  );
}

function StandoutRow({ label, icon, standout, value, featured = false }: {
  label: string; icon: string; standout: Standout | null; value: (s: Standout) => string; featured?: boolean;
}) {
  if (!standout) return null;
  return (
    <div className={`result-standout ${featured ? 'featured' : ''}`}>
      <span className="result-standout-icon" aria-hidden="true">{icon}</span>
      <span className="result-standout-text">
        <small>{label}</small>
        <strong>{standout.player.name}</strong>
        <em className={`result-from-${standout.side}`}>{standout.team}</em>
        {milestones(standout.player).length > 0 && (
          <span className="milestone-tags">
            {milestones(standout.player).map((tag) => (
              <span key={tag} className={`milestone-tag ${tag === 'Super 10' ? 'super-ten' : 'high-five'}`}>{tag}</span>
            ))}
          </span>
        )}
      </span>
      <b>{value(standout)}</b>
    </div>
  );
}

function TeamCard({ team, side, winner }: { team: TeamPerformance; side: Side; winner: boolean }) {
  const rows: [string, number][] = [
    ['Raid points', team.raidPoints],
    ['Tackle points', team.tacklePoints],
    ['All-out points', team.allOutPoints],
    ['Extras', team.extraPoints],
  ];
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return (
    <article className={`result-team result-team-${side} ${winner ? 'winner' : ''}`}>
      <header>
        <span className={`team-mark side-${side}`}>{team.name.slice(0, 2).toUpperCase()}</span>
        <span><strong>{team.name}</strong>{winner && <em>WINNER</em>}</span>
        <b>{team.total}</b>
      </header>
      <ul>
        {rows.map(([label, value]) => (
          <li key={label}>
            <span>{label}</span>
            <i><s style={{ width: `${(value / max) * 100}%` }} /></i>
            <b>{value}</b>
          </li>
        ))}
      </ul>
      <p>
        {team.successfulRaids}/{team.raids} successful raids
        {team.superRaids ? ` · ${team.superRaids} super raid${team.superRaids === 1 ? '' : 's'}` : ''}
        {team.superTackles ? ` · ${team.superTackles} super tackle${team.superTackles === 1 ? '' : 's'}` : ''}
      </p>
    </article>
  );
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';

/** Draws a 1080×1920 story image (WhatsApp status / Instagram story size). */
export async function renderResultImage(summary: MatchSummary, extra: { tieBreak: [number, number] | null }): Promise<Blob> {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas unavailable');
  await document.fonts?.ready?.catch?.(() => undefined);
  const font = (weight: number, size: number) => `${weight} ${size}px Inter, "Segoe UI", Roboto, Arial, sans-serif`;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d0d1c');
  bg.addColorStop(0.55, '#151530');
  bg.addColorStop(1, '#2a0f08');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // glow
  const glow = g.createRadialGradient(W / 2, 560, 40, W / 2, 560, 620);
  glow.addColorStop(0, 'rgba(255,90,31,.35)');
  glow.addColorStop(1, 'rgba(255,90,31,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  const center = (text: string, y: number, f: string, color: string) => { g.font = f; g.fillStyle = color; g.textAlign = 'center'; g.fillText(text, W / 2, y); };
  const fit = (text: string, maxWidth: number, f: (size: number) => string, size: number) => {
    let s = size;
    g.font = f(s);
    while (g.measureText(text).width > maxWidth && s > 24) { s -= 2; g.font = f(s); }
    return f(s);
  };
  const round = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fillStyle = fill;
    g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); }
  };

  center('raidzOn', 150, font(800, 64), '#ff5a1f');
  center('FULL TIME', 230, font(700, 34), '#a3a3c8');

  // Team marks and score
  const [a, b] = summary.teams;
  [a, b].forEach((team, side) => {
    const x = side === 0 ? 250 : W - 250;
    round(x - 80, 280, 160, 160, 40, TEAM_COLORS[side]);
    g.font = font(800, 64); g.fillStyle = '#fff'; g.textAlign = 'center';
    g.fillText(team.name.slice(0, 2).toUpperCase(), x, 382);
    g.font = fit(team.name, 360, (s) => font(700, s), 44); g.fillStyle = '#e8e8ff';
    g.fillText(team.name, x, 505);
    g.font = font(900, 180); g.fillStyle = '#ffffff';
    g.fillText(String(team.total), x, 700);
    if (summary.winner === side) {
      round(x - 95, 735, 190, 54, 27, 'rgba(34,211,155,.16)');
      g.font = font(800, 30); g.fillStyle = '#22d39b'; g.fillText('WINNER', x, 772);
    }
  });
  center(':', 670, font(800, 110), '#5c5c85');
  if (extra.tieBreak) center(`Tie-break ${extra.tieBreak[0]} – ${extra.tieBreak[1]}`, 835, font(600, 32), '#a3a3c8');
  center(summary.headline, 900, fit(summary.headline, 940, (s) => font(800, s), 68), '#ffffff');

  // Standouts
  const standouts: [string, Standout | null, (s: Standout) => string][] = [
    ['PLAYER OF THE MATCH', summary.playerOfTheMatch, (s) => plural(s.player.raidPoints + s.player.tacklePoints, 'pt')],
    ['TOP RAIDER', summary.topRaider, (s) => plural(s.player.raidPoints, 'raid pt')],
    ['TOP DEFENDER', summary.topDefender, (s) => plural(s.player.tacklePoints, 'tackle pt')],
  ];
  let y = 960;
  standouts.forEach(([label, standout, value], index) => {
    const h = index === 0 ? 160 : 124;
    round(80, y, W - 160, h, 36, index === 0 ? 'rgba(255,90,31,.16)' : 'rgba(255,255,255,.06)', index === 0 ? 'rgba(255,90,31,.6)' : undefined);
    g.textAlign = 'left';
    g.font = font(700, 26); g.fillStyle = index === 0 ? '#ff8a4c' : '#9a9ac0';
    g.fillText(label, 130, y + 52);
    // Super 10 / High 5 pills after the label.
    if (standout) {
      let tx = 130 + g.measureText(label).width + 18;
      for (const tag of milestones(standout.player)) {
        g.font = font(800, 22);
        const tw = g.measureText(tag).width + 28;
        round(tx, y + 28, tw, 34, 17, tag === 'Super 10' ? 'rgba(255,90,31,.9)' : 'rgba(34,211,155,.9)');
        g.fillStyle = tag === 'Super 10' ? '#ffffff' : '#062a1f';
        g.fillText(tag, tx + 14, y + 53);
        tx += tw + 10;
      }
    }
    g.font = fit(standout?.player.name ?? '—', 560, (s) => font(800, s), index === 0 ? 56 : 44); g.fillStyle = '#ffffff';
    g.fillText(standout?.player.name ?? '—', 130, y + (index === 0 ? 122 : 100));
    if (standout) {
      g.textAlign = 'right';
      g.font = font(800, index === 0 ? 46 : 38); g.fillStyle = index === 0 ? '#ff8a4c' : '#e8e8ff';
      g.fillText(value(standout), W - 130, y + (index === 0 ? 100 : 82));
      g.font = font(600, 26); g.fillStyle = TEAM_COLORS[standout.side];
      g.fillText(standout.team, W - 130, y + (index === 0 ? 140 : 112));
    }
    y += h + 20;
  });
  y += 10;

  // Team performance
  const rows: [string, (t: TeamPerformance) => number][] = [
    ['Raid', (t) => t.raidPoints], ['Tackle', (t) => t.tacklePoints], ['All-out', (t) => t.allOutPoints], ['Extras', (t) => t.extraPoints],
  ];
  round(80, y, W - 160, 290, 36, 'rgba(255,255,255,.05)');
  rows.forEach(([label, pick], index) => {
    const ry = y + 70 + index * 62;
    const va = pick(a), vb = pick(b), max = Math.max(1, va, vb);
    g.textAlign = 'center'; g.font = font(600, 28); g.fillStyle = '#a3a3c8';
    g.fillText(label, W / 2, ry);
    g.font = font(800, 32); g.fillStyle = '#fff';
    g.textAlign = 'left'; g.fillText(String(va), 120, ry);
    g.textAlign = 'right'; g.fillText(String(vb), W - 120, ry);
    if (va) round(W / 2 - 110 - 270 * (va / max), ry - 20, Math.max(12, 270 * (va / max)), 16, 8, TEAM_COLORS[0]);
    if (vb) round(W / 2 + 110, ry - 20, Math.max(12, 270 * (vb / max)), 16, 8, TEAM_COLORS[1]);
  });

  center('Scored live on raidzon.com', H - 80, font(600, 30), '#7d7da6');
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/png'));
}
