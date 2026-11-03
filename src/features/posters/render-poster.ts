import QRCode from 'qrcode';
import { POSTER } from './poster-palette';
import type { PlayerPoster, Poster, PosterStar, ResultPoster } from './poster-model';

export type PosterSize = 'square' | 'story';
export const POSTER_SIZES: Record<PosterSize, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

const W = 1080;
const PAD = 80;
const BODY = 'Inter, "Segoe UI", Roboto, Arial, sans-serif';
const DISPLAY = `Rajdhani, ${BODY}`;
const font = (weight: number, size: number, family = BODY) => `${weight} ${size}px ${family}`;

type G = CanvasRenderingContext2D;

/** Draws the poster on a new canvas: 1080×1080 (feed) or 1080×1920 (WhatsApp status / Instagram story). */
export async function drawPoster(poster: Poster, size: PosterSize, link: string): Promise<HTMLCanvasElement> {
  const { height: H } = POSTER_SIZES[size];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas unavailable');
  // Web fonts load on first use; ask for the poster's weights so text isn't drawn in a fallback font.
  await Promise.all(['700 40px Rajdhani', '600 40px Rajdhani', '700 40px Inter', '600 40px Inter'].map((f) => document.fonts?.load(f).catch(() => undefined)));
  await document.fonts?.ready;

  const story = size === 'story';
  const footerTop = footer(g, link, H, story, false);
  // Draw once to measure, then again with the body centred between the header and the QR footer.
  const draw = (shift: number) => {
    background(g, H);
    const top = header(g, poster, story ? 150 : 100);
    g.save();
    g.translate(0, shift);
    const end = poster.kind === 'result' ? resultBody(g, poster, top, story, H) : playerBody(g, poster, top, story, H);
    g.restore();
    footer(g, link, H, story, true);
    return end;
  };
  const end = draw(0);
  if (footerTop - end > 120) draw(Math.round((footerTop - 60 - end) / 2));
  return canvas;
}

export async function renderPoster(poster: Poster, size: PosterSize, link: string): Promise<Blob> {
  const canvas = await drawPoster(poster, size, link);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/png'));
}

function background(g: G, H: number) {
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, POSTER.bg);
  bg.addColorStop(0.6, POSTER.surface);
  bg.addColorStop(1, POSTER.card);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.38, 40, W / 2, H * 0.38, W * 0.6);
  glow.addColorStop(0, alpha(POSTER.accent, 0.22));
  glow.addColorStop(1, alpha(POSTER.accent, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.fillStyle = POSTER.accent;
  g.fillRect(0, 0, W, 12);
}

/** Tournament name (or the brand) and "date · venue"; returns where the body starts. */
function header(g: G, poster: Poster, y: number) {
  text(g, (poster.tournament ?? 'RAIDZON KABADDI').toUpperCase(), W / 2, y, fit(g, (poster.tournament ?? 'RAIDZON KABADDI').toUpperCase(), W - 2 * PAD, 700, 52, DISPLAY), POSTER.accentSoft);
  const details = [poster.date, poster.venue].filter(Boolean).join('  ·  ');
  if (details) text(g, details, W / 2, y + 50, fit(g, details, W - 2 * PAD, 600, 28), POSTER.textMuted);
  return y + (details ? 50 : 0);
}

function resultBody(g: G, poster: ResultPoster, top: number, story: boolean, H: number) {
  let y = top + (story ? 110 : 70);
  text(g, 'FULL TIME', W / 2, y, font(700, 30), POSTER.textFaint, 6);
  y += story ? 110 : 80;
  const colors = [POSTER.teamA, POSTER.teamB];
  poster.teams.forEach((team, side) => {
    const x = side === 0 ? W * 0.27 : W * 0.73;
    pill(g, x, y - 34, 120, 8, colors[side]);
    text(g, team, x, y + 20, fit(g, team, 420, 700, 42, DISPLAY), POSTER.text, 0, 420);
    text(g, String(poster.score[side]), x, y + (story ? 230 : 170), font(700, story ? 210 : 150, DISPLAY), poster.winner === side || poster.winner === null ? POSTER.textStrong : POSTER.textMuted);
  });
  text(g, '–', W / 2, y + (story ? 200 : 150), font(700, story ? 100 : 80, DISPLAY), POSTER.textFaint);
  y += story ? 300 : 230;
  if (poster.tieBreak) {
    text(g, `Tie-break ${poster.tieBreak[0]} – ${poster.tieBreak[1]}`, W / 2, y, font(600, 30), POSTER.textMuted);
    y += story ? 50 : 30;
  }
  y += story ? 40 : 40;
  text(g, poster.headline.toUpperCase(), W / 2, y, fit(g, poster.headline.toUpperCase(), W - 2 * PAD, 700, story ? 80 : 64, DISPLAY), poster.winner === null ? POSTER.text : POSTER.success);
  y += story ? 90 : 40;
  const stars: [string, PosterStar | null, string][] = [['TOP RAIDER', poster.topRaider, 'raid'], ['TOP DEFENDER', poster.topDefender, 'tackle']];
  const shown = stars.filter(([, star]) => star);
  if (story) {
    // Stacked full-width cards.
    shown.forEach(([label, star, unit]) => { starCard(g, PAD, y, W - 2 * PAD, 190, label, star!, unit); y += 220; });
  } else if (shown.length) {
    // Side by side, sized to the space above the footer.
    const width = shown.length === 1 ? W - 2 * PAD : (W - 2 * PAD - 30) / 2;
    const height = Math.min(190, H - 250 - y);
    shown.forEach(([label, star, unit], index) => starCard(g, PAD + index * (width + 30), y, width, height, label, star!, unit));
    y += height;
  }
  return y;
}

function starCard(g: G, x: number, y: number, w: number, h: number, label: string, star: PosterStar, unit: string) {
  round(g, x, y, w, h, 28, alpha(POSTER.textStrong, 0.06), POSTER.line);
  const inner = w - 64;
  g.textAlign = 'left';
  g.font = font(700, 24); g.fillStyle = POSTER.accentSoft; g.fillText(label, x + 32, y + 48);
  g.font = fit(g, star.name, inner, 700, 46, DISPLAY); g.fillStyle = POSTER.textStrong; g.fillText(clip(g, star.name, inner), x + 32, y + h / 2 + 24);
  const points = `${star.points} ${unit} pt${star.points === 1 ? '' : 's'}`;
  g.font = font(600, 26); g.fillStyle = POSTER.textMuted;
  const team = clip(g, star.team, inner - g.measureText(points).width - 24);
  g.fillText(team, x + 32, y + h - 30);
  g.textAlign = 'right'; g.fillStyle = POSTER.text; g.font = font(700, 26);
  g.fillText(points, x + w - 32, y + h - 30);
}

function playerBody(g: G, poster: PlayerPoster, top: number, story: boolean, H: number) {
  let y = top + (story ? 130 : 70);
  text(g, 'PLAYER OF THE MATCH', W / 2, y, font(700, story ? 40 : 32, DISPLAY), POSTER.textFaint, 6);
  // Initials badge.
  const r = story ? 150 : 95;
  const cy = y + (story ? 60 : 30) + r;
  g.beginPath(); g.arc(W / 2, cy, r, 0, Math.PI * 2);
  g.fillStyle = POSTER.accent; g.fill();
  g.lineWidth = 8; g.strokeStyle = alpha(POSTER.textStrong, 0.85); g.stroke();
  const initials = poster.name.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w[0] ?? '')).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '★';
  text(g, initials, W / 2, cy + r * 0.3, font(700, r * 0.9, DISPLAY), POSTER.textStrong);
  y = cy + r + (story ? 120 : 75);
  text(g, poster.name.toUpperCase(), W / 2, y, fit(g, poster.name.toUpperCase(), W - 2 * PAD, 700, story ? 96 : 76, DISPLAY), POSTER.textStrong);
  y += story ? 60 : 46;
  text(g, poster.team, W / 2, y, fit(g, poster.team, W - 2 * PAD, 600, story ? 40 : 32), POSTER.textMuted);
  if (poster.tags.length) {
    y += story ? 70 : 50;
    g.font = font(700, 26);
    const widths = poster.tags.map((tag) => g.measureText(tag).width + 44);
    let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + 16 * (widths.length - 1)) / 2;
    poster.tags.forEach((tag, index) => {
      round(g, x, y - 34, widths[index], 48, 24, tag === 'Super 10' ? POSTER.accent : POSTER.success);
      g.textAlign = 'center'; g.fillStyle = tag === 'Super 10' ? POSTER.textStrong : POSTER.bg;
      g.fillText(tag, x + widths[index] / 2, y);
      x += widths[index] + 16;
    });
  }
  y += story ? 70 : 36;
  const boxes: [string, number][] = [['RAID PTS', poster.raidPoints], ['TACKLE PTS', poster.tacklePoints], ['TOTAL', poster.total]];
  const bw = (W - 2 * PAD - 2 * 24) / 3;
  const bh = story ? 210 : Math.min(160, H - 240 - y);
  boxes.forEach(([label, value], index) => {
    const x = PAD + index * (bw + 24);
    round(g, x, y, bw, bh, 28, index === 2 ? alpha(POSTER.accent, 0.18) : alpha(POSTER.textStrong, 0.06), index === 2 ? POSTER.accent : POSTER.line);
    text(g, String(value), x + bw / 2, y + bh * 0.6, font(700, story ? 110 : 80, DISPLAY), index === 2 ? POSTER.accentSoft : POSTER.textStrong);
    text(g, label, x + bw / 2, y + bh - (story ? 30 : 20), font(700, story ? 26 : 22), POSTER.textMuted, 2);
  });
  y += bh + (story ? 80 : 0);
  if (story) text(g, poster.scoreLine, W / 2, y, fit(g, poster.scoreLine, W - 2 * PAD, 600, 34), POSTER.text);
  return y;
}

/** QR code to the public match page, and the raidzon.com mark. */
function footer(g: G, link: string, H: number, story: boolean, paint: boolean) {
  // Kept small: the tappable link travels in the share caption; the QR helps printed posters and screens at the ground.
  const size = story ? 160 : 110;
  const x = PAD, y = H - PAD - size + (story ? 0 : 20);
  if (!paint) return y;
  qr(g, link, x, y, size);
  g.textAlign = 'left';
  g.font = font(600, story ? 28 : 24); g.fillStyle = POSTER.textMuted;
  g.fillText('Full scorecard', x + size + 24, y + size / 2 - 6);
  g.font = font(600, story ? 22 : 19); g.fillStyle = POSTER.textFaint;
  g.fillText('Scan to see every raid', x + size + 24, y + size / 2 + 26);
  g.textAlign = 'right';
  g.font = font(700, story ? 40 : 34, DISPLAY); g.fillStyle = POSTER.accent;
  g.fillText('raidzon.com', W - PAD, y + size - 4);
  return y;
}

function qr(g: G, link: string, x: number, y: number, size: number) {
  const { modules } = QRCode.create(link, { errorCorrectionLevel: 'M' });
  const quiet = 2;
  const cell = size / (modules.size + quiet * 2);
  round(g, x, y, size, size, 16, POSTER.textStrong);
  g.fillStyle = POSTER.bg;
  for (let row = 0; row < modules.size; row++)
    for (let col = 0; col < modules.size; col++)
      if (modules.get(row, col)) g.fillRect(x + (col + quiet) * cell, y + (row + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
}

/** Centred text, cut with an ellipsis if it is still wider than max. */
function text(g: G, value: string, x: number, y: number, f: string, color: string, spacing = 0, max = W - 2 * PAD) {
  g.font = f; g.fillStyle = color; g.textAlign = 'center';
  g.letterSpacing = `${spacing}px`;
  g.fillText(clip(g, value, max), x, y);
  g.letterSpacing = '0px';
}

/** The largest font, down to 60% of size, that fits the width; ellipsis covers anything still too wide. */
function fit(g: G, value: string, width: number, weight: number, size: number, family = BODY) {
  let s = size;
  g.font = font(weight, s, family);
  while (g.measureText(value).width > width && s > size * 0.6) { s -= 2; g.font = font(weight, s, family); }
  return font(weight, s, family);
}

/** Cuts text to fit width with an ellipsis, in the current font. */
function clip(g: G, value: string, width: number) {
  if (g.measureText(value).width <= width) return value;
  let chars = [...value];
  while (chars.length > 1 && g.measureText(`${chars.join('')}…`).width > width) chars = chars.slice(0, -1);
  return `${chars.join('').trimEnd()}…`;
}

function round(g: G, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); }
}

const pill = (g: G, cx: number, y: number, w: number, h: number, color: string) => round(g, cx - w / 2, y, w, h, h / 2, color);

/** "#ff4500" at an opacity, for glows and card fills. */
function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
