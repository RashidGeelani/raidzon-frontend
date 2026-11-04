import QRCode from 'qrcode';
import { POSTER } from './poster-palette';
import { apiBaseUrl } from '../identity/data/api';
import { fitRows, fitTables, printedLink, type FixturesPoster, type LivePoster, type PlayerPoster, type Poster, type PosterSponsor, type PosterStar, type ResultPoster, type TablePoster } from './poster-model';

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

/**
 * Draws the poster on a new canvas: 1080×1080 (feed) or 1080×1920 (WhatsApp status / Instagram story).
 * link goes in the QR code; a short link (raidzon.com/m/…) is also printed beside it.
 */
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
  const logos = await Promise.all((poster.sponsors ?? []).map(async (sponsor) => ({ sponsor, image: await loadLogo(sponsor.logoUrl) })));

  const story = size === 'story';
  const short = printedLink(link);
  // The Live now poster carries its own large QR code; the others a small one in the footer.
  const qrText: [string, string] | null = poster.kind === 'live' ? null
    : poster.kind === 'fixtures' || poster.kind === 'table' ? ['Fixtures, table and live scores', 'Scan to follow the tournament']
      : ['Full scorecard', 'Scan to see every raid'];
  const footerTop = footer(g, link, H, story, false, qrText, short);
  // Sponsor logos sit in a row just above the footer.
  const sponsorH = story ? 120 : 84;
  const bottom = logos.length ? footerTop - sponsorH - (story ? 48 : 30) : footerTop;
  // Draw once to measure, then again with the body centred between the header and the sponsors or footer.
  const draw = (shift: number) => {
    background(g, H);
    const top = header(g, poster, story ? 150 : 100, story);
    g.save();
    g.translate(0, shift);
    const end = poster.kind === 'result' ? resultBody(g, poster, top, story, bottom)
      : poster.kind === 'player' ? playerBody(g, poster, top, story, bottom)
        : poster.kind === 'fixtures' ? fixturesBody(g, poster, top, story, bottom)
          : poster.kind === 'table' ? tableBody(g, poster, top, story, bottom)
            : liveBody(g, poster, top, story, link, short, bottom);
    g.restore();
    if (logos.length) sponsorRow(g, logos, bottom + (story ? 20 : 12), sponsorH);
    footer(g, link, H, story, true, qrText, short);
    return end;
  };
  const end = draw(0);
  if (bottom - end > 120) draw(Math.round((bottom - 60 - end) / 2));
  return canvas;
}

/** A sponsor's logo, or null when it can't be loaded (the poster then prints the name). */
function loadLogo(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous'; // the API sends CORS headers, so the canvas can still be exported
    const timer = setTimeout(() => resolve(null), 6000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = url.startsWith('/') ? `${apiBaseUrl()}${url}` : url;
  });
}

/** Logos on white tiles (most logos are made for a light background), Title sponsor first. */
function sponsorRow(g: G, logos: { sponsor: PosterSponsor; image: HTMLImageElement | null }[], y: number, h: number) {
  const gap = 20;
  const tileW = Math.min(230, (W - 2 * PAD - gap * (logos.length - 1)) / logos.length);
  let x = W / 2 - (tileW * logos.length + gap * (logos.length - 1)) / 2;
  for (const { sponsor, image } of logos) {
    round(g, x, y, tileW, h, 16, POSTER.textStrong);
    if (image && image.width && image.height) {
      const scale = Math.min((tileW - 28) / image.width, (h - 20) / image.height);
      const w = image.width * scale, ih = image.height * scale;
      g.drawImage(image, x + (tileW - w) / 2, y + (h - ih) / 2, w, ih);
    } else {
      text(g, sponsor.name, x + tileW / 2, y + h / 2 + 9, fit(g, sponsor.name, tileW - 24, 700, 26), POSTER.bg, 0, tileW - 24);
    }
    x += tileW + gap;
  }
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
function header(g: G, poster: Poster, y: number, story: boolean) {
  text(g, (poster.tournament ?? 'RAIDZON KABADDI').toUpperCase(), W / 2, y, fit(g, (poster.tournament ?? 'RAIDZON KABADDI').toUpperCase(), W - 2 * PAD, 700, 52, DISPLAY), POSTER.accentSoft);
  const presented = poster.presentedBy ? `presented by ${poster.presentedBy}` : null;
  // The story size has room for "presented by" on its own line; the square post keeps it beside the date.
  if (presented && story) {
    y += 44;
    text(g, presented, W / 2, y, fit(g, presented, W - 2 * PAD, 600, 26), POSTER.text);
  }
  const details = [story ? null : presented, poster.date, poster.venue].filter(Boolean).join('  ·  ');
  if (details) text(g, details, W / 2, y + 50, fit(g, details, W - 2 * PAD, 600, 28), POSTER.textMuted);
  return y + (details ? 50 : 0);
}

function resultBody(g: G, poster: ResultPoster, top: number, story: boolean, bottom: number) {
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
    const height = Math.max(150, Math.min(190, bottom - 10 - y));
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

function playerBody(g: G, poster: PlayerPoster, top: number, story: boolean, bottom: number) {
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
  const bh = story ? 210 : Math.max(120, Math.min(160, bottom - 10 - y));
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

const FIXTURE_TITLE = 'NEXT MATCHES';

function fixturesBody(g: G, poster: FixturesPoster, top: number, story: boolean, footerTop: number) {
  let y = top + (story ? 110 : 70);
  text(g, FIXTURE_TITLE, W / 2, y, font(700, story ? 34 : 30), POSTER.textFaint, 6);
  y += story ? 80 : 64;
  text(g, poster.label.toUpperCase(), W / 2, y, fit(g, poster.label.toUpperCase(), W - 2 * PAD, 700, story ? 76 : 60, DISPLAY), POSTER.textStrong);
  y += story ? 60 : 40;
  const h = story ? 128 : 108, gap = story ? 18 : 14;
  const { shown, more } = fitRows(poster.rows, Math.max(1, Math.floor((footerTop - 50 - y) / (h + gap))));
  const timeWidth = 190;
  shown.forEach((row) => {
    round(g, PAD, y, W - 2 * PAD, h, 24, alpha(POSTER.textStrong, 0.06), POSTER.line);
    const live = row.time === 'LIVE';
    round(g, PAD + 18, y + 18, timeWidth - 36, h - 36, 16, live ? POSTER.live : alpha(POSTER.accent, 0.16));
    text(g, row.time, PAD + timeWidth / 2, y + h / 2 + 11, fit(g, row.time, timeWidth - 56, 700, 30), live ? POSTER.textStrong : POSTER.accentSoft, 0, timeWidth - 56);
    const x = PAD + timeWidth + 10, inner = W - PAD - 28 - x;
    g.textAlign = 'left';
    g.font = font(700, story ? 36 : 32, DISPLAY); g.fillStyle = POSTER.textStrong;
    g.fillText(clip(g, row.teamA, inner), x, y + h / 2 - 6);
    g.font = font(600, story ? 24 : 21); g.fillStyle = POSTER.textFaint;
    const vs = 'vs  ';
    g.fillText(vs, x, y + h / 2 + (story ? 38 : 32));
    const vsWidth = g.measureText(vs).width;
    g.font = font(700, story ? 36 : 32, DISPLAY); g.fillStyle = POSTER.textStrong;
    if (row.stage) {
      g.font = font(600, story ? 22 : 20); g.fillStyle = POSTER.textMuted; g.textAlign = 'right';
      g.fillText(clip(g, row.stage, 220), W - PAD - 28, y + (story ? 40 : 34));
      g.textAlign = 'left';
      g.font = font(700, story ? 36 : 32, DISPLAY); g.fillStyle = POSTER.textStrong;
    }
    g.fillText(clip(g, row.teamB, inner - vsWidth), x + vsWidth, y + h / 2 + (story ? 40 : 34));
    y += h + gap;
  });
  if (more) {
    text(g, `+${more} more match${more === 1 ? '' : 'es'} · see all on raidzon.com`, W / 2, y + 28, font(600, story ? 28 : 24), POSTER.textMuted);
    y += 50;
  }
  return y;
}

function tableBody(g: G, poster: TablePoster, top: number, story: boolean, footerTop: number) {
  let y = top + (story ? 110 : 70);
  text(g, 'POINTS TABLE', W / 2, y, font(700, story ? 34 : 30), POSTER.textFaint, 6);
  y += story ? 50 : 42;
  text(g, poster.progress, W / 2, y, font(600, story ? 28 : 24), POSTER.textMuted);
  y += story ? 50 : 36;
  const titled = poster.tables.some((table) => table.title);
  const rowH = story ? 62 : 46, headH = titled ? (story ? 96 : 76) : (story ? 56 : 48), gap = story ? 28 : 16;
  const budget = Math.floor((footerTop - 20 - y - poster.tables.length * (headH + 12) - (poster.tables.length - 1) * gap) / rowH);
  const tables = fitTables(poster.tables, Math.max(poster.tables.length * 2, budget));
  // Columns from the right edge: P W D L Pts.
  const cols = ['P', 'W', 'D', 'L', 'PTS'];
  const colW = story ? 86 : 78;
  const colX = (i: number) => W - PAD - 24 - (cols.length - 1 - i) * colW - colW / 2;
  const teamX = PAD + 88, teamMax = colX(0) - colW / 2 - teamX - 12;
  for (const table of tables) {
    const lines = table.rows.length + (table.hidden ? 1 : 0);
    round(g, PAD, y, W - 2 * PAD, headH + lines * rowH + 12, 24, alpha(POSTER.textStrong, 0.05), POSTER.line);
    g.textAlign = 'left';
    g.font = font(700, story ? 34 : 30, DISPLAY); g.fillStyle = POSTER.textStrong;
    if (table.title) g.fillText(table.title.toUpperCase(), PAD + 28, y + (story ? 46 : 38));
    if (table.note) {
      g.textAlign = 'right'; g.font = font(600, story ? 22 : 19); g.fillStyle = POSTER.success;
      g.fillText(table.note, W - PAD - 28, y + (story ? 44 : 36));
    }
    const hy = y + headH - (story ? 18 : 14);
    g.font = font(700, story ? 20 : 18); g.fillStyle = POSTER.textFaint;
    g.textAlign = 'left'; g.fillText('#', PAD + 32, hy); g.fillText('TEAM', teamX, hy);
    g.textAlign = 'center'; cols.forEach((col, i) => g.fillText(col, colX(i), hy));
    let ry = y + headH;
    for (const row of table.rows) {
      if (row.qualifies) {
        g.fillStyle = alpha(POSTER.success, 0.12); g.fillRect(PAD + 3, ry, W - 2 * PAD - 6, rowH);
        g.fillStyle = POSTER.success; g.fillRect(PAD + 3, ry + 8, 6, rowH - 16);
      }
      const base = ry + rowH / 2 + (story ? 10 : 8);
      g.font = font(700, story ? 26 : 22); g.fillStyle = POSTER.textMuted; g.textAlign = 'left';
      g.fillText(String(row.rank), PAD + 32, base);
      g.font = font(700, story ? 30 : 26, DISPLAY); g.fillStyle = POSTER.textStrong;
      g.fillText(clip(g, row.team, teamMax), teamX, base);
      g.textAlign = 'center';
      [row.played, row.won, row.drawn, row.lost, row.points].forEach((value, i) => {
        g.font = font(700, story ? 26 : 22); g.fillStyle = i === 4 ? POSTER.accentSoft : POSTER.text;
        g.fillText(String(value), colX(i), base);
      });
      ry += rowH;
    }
    if (table.hidden) {
      g.textAlign = 'left'; g.font = font(600, story ? 22 : 19); g.fillStyle = POSTER.textMuted;
      g.fillText(`+${table.hidden} more team${table.hidden === 1 ? '' : 's'}`, teamX, ry + rowH / 2 + 7);
      ry += rowH;
    }
    y = ry + 12 + gap;
  }
  return y - gap;
}

function liveBody(g: G, poster: LivePoster, top: number, story: boolean, link: string, short: string | null, bottom: number) {
  let y = top + (story ? 130 : 60);
  // LIVE badge with a dot.
  const badgeW = story ? 260 : 210, badgeH = story ? 72 : 58;
  round(g, W / 2 - badgeW / 2, y, badgeW, badgeH, badgeH / 2, POSTER.live);
  g.beginPath(); g.arc(W / 2 - badgeW / 2 + (story ? 40 : 32), y + badgeH / 2, story ? 10 : 8, 0, Math.PI * 2); g.fillStyle = POSTER.textStrong; g.fill();
  text(g, 'LIVE NOW', W / 2 + (story ? 24 : 20), y + badgeH / 2 + (story ? 12 : 10), font(700, story ? 36 : 30, DISPLAY), POSTER.textStrong, 3);
  y += badgeH + (story ? 130 : 80);
  const teamFont = (name: string) => fit(g, name.toUpperCase(), W - 2 * PAD, 700, story ? 96 : 72, DISPLAY);
  text(g, poster.teams[0].toUpperCase(), W / 2, y, teamFont(poster.teams[0]), POSTER.textStrong);
  y += story ? 90 : 62;
  text(g, 'VS', W / 2, y, font(700, story ? 40 : 32, DISPLAY), POSTER.accentSoft, 4);
  y += story ? 110 : 78;
  text(g, poster.teams[1].toUpperCase(), W / 2, y, teamFont(poster.teams[1]), POSTER.textStrong);
  y += story ? 110 : 50;
  // As large as fits above the sponsors or footer, leaving room for the lines under it.
  const size = story ? 380 : Math.max(150, Math.min(230, bottom - y - (short ? 110 : 66)));
  qr(g, link, W / 2 - size / 2, y, size);
  y += size + (story ? 64 : 46);
  text(g, 'Scan to watch raid by raid', W / 2, y, font(700, story ? 36 : 28), POSTER.text);
  if (short) {
    y += story ? 56 : 42;
    text(g, `or open ${short}`, W / 2, y, font(700, story ? 32 : 26), POSTER.accentSoft);
  }
  return y;
}

/** Small QR code to the match or tournament page (when qrText is given), and the raidzon.com mark. */
function footer(g: G, link: string, H: number, story: boolean, paint: boolean, qrText: [string, string] | null, short: string | null) {
  // Kept small: the tappable link travels in the share caption; the QR helps printed posters and screens at the ground.
  const size = story ? 160 : 110;
  const x = PAD, y = qrText ? H - PAD - size + (story ? 0 : 20) : H - PAD - 40;
  if (!paint) return y;
  if (qrText) {
    qr(g, link, x, y, size);
    g.textAlign = 'left';
    g.font = font(600, story ? 28 : 24); g.fillStyle = POSTER.textMuted;
    g.fillText(qrText[0], x + size + 24, y + size / 2 - 6);
    // A short link replaces the "scan" hint: people can type it from a printed poster or a screen.
    g.font = short ? font(700, story ? 26 : 22) : font(600, story ? 22 : 19); g.fillStyle = short ? POSTER.accentSoft : POSTER.textFaint;
    g.fillText(short ?? qrText[1], x + size + 24, y + size / 2 + 26);
  }
  const markY = qrText ? y + size - 4 : y + 30;
  g.textAlign = qrText ? 'right' : 'center';
  g.font = font(700, story ? 40 : 34, DISPLAY); g.fillStyle = POSTER.accent;
  g.fillText('raidzon.com', qrText ? W - PAD : W / 2, markY);
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
