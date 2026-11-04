import { useEffect, useState } from 'react';
import { api, apiBaseUrl } from '../identity/data/api';

/** A tournament sponsor as the public tournament view sends it (Title sponsor first). */
export interface Sponsor {
  id: string;
  name: string;
  level: 'TITLE' | 'PARTNER';
  /** A website (http/https) or a phone number, or null. */
  link: string | null;
  /** API path of the logo, e.g. /api/v1/public/sponsors/<id>/logo?v=… */
  logoUrl: string;
}

export const MAX_SPONSORS = 4;
/** Logos are shrunk on the phone to this width before upload; the server takes up to 150 KB. */
export const LOGO_WIDTH = 400;
export const MAX_LOGO_BYTES = 150 * 1024;

export const sponsorLogoSrc = (sponsor: Pick<Sponsor, 'logoUrl'>) => (sponsor.logoUrl.startsWith('/') ? `${apiBaseUrl()}${sponsor.logoUrl}` : sponsor.logoUrl);
export const titleSponsor = (sponsors: readonly Sponsor[] | null | undefined) => sponsors?.find((sponsor) => sponsor.level === 'TITLE') ?? null;

/** Where a sponsor's link goes: the website, or a phone call for a number. Null when there is none. */
export function sponsorHref(link: string | null | undefined) {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  return /^\+?[0-9]{7,15}$/.test(link) ? `tel:${link}` : null;
}

/** Size to draw a logo at so it is at most maxWidth wide, keeping its shape. */
export function fitLogoSize(width: number, height: number, maxWidth = LOGO_WIDTH) {
  const scale = Math.min(1, maxWidth / width);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Shrinks a chosen logo to 400 px wide on the phone and returns it as base64. PNG keeps transparency;
 * a PNG still over 150 KB, and every other image, becomes a JPEG on white.
 */
export async function shrinkLogo(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitLogoSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas unavailable');
  const encode = (type: string) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image'))), type, 0.86));
  g.drawImage(bitmap, 0, 0, width, height);
  let blob = file.type === 'image/png' ? await encode('image/png') : null;
  if (!blob || blob.size > MAX_LOGO_BYTES) {
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#ffffff'; // JPEG has no transparency: put the logo on white, as printed logos are
    g.fillRect(0, 0, width, height);
    blob = await encode('image/jpeg');
  }
  if (blob.size > MAX_LOGO_BYTES) throw new Error('This logo is too detailed. Try a simpler image.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

/** A public tournament's name and sponsors, for match pages, the overlay and posters. Empty until loaded or without a tournament. */
export function useTournamentBrand(tournamentId: string | null | undefined) {
  const [brand, setBrand] = useState<{ id: string; name: string; sponsors: Sponsor[] } | null>(null);
  useEffect(() => {
    if (!tournamentId) return;
    let active = true;
    api<{ tournament: { name: string }; sponsors?: Sponsor[] }>(`/public/tournaments/${encodeURIComponent(tournamentId)}`)
      .then((result) => { if (active) setBrand({ id: tournamentId, name: result.tournament.name, sponsors: result.sponsors ?? [] }); })
      .catch(() => { /* pages work without the tournament name and sponsors */ });
    return () => { active = false; };
  }, [tournamentId]);
  const current = brand && brand.id === tournamentId ? brand : null;
  return { name: current?.name ?? null, sponsors: current?.sponsors ?? NO_SPONSORS };
}
const NO_SPONSORS: Sponsor[] = [];
