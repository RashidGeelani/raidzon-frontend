import { describe, expect, it } from 'vitest';
import { fitLogoSize, sponsorHref, sponsorLogoSrc, titleSponsor, type Sponsor } from './sponsors';
import { shortLinkPath } from '../public/ShortLinkPage';

const sponsor = (name: string, level: Sponsor['level']): Sponsor => ({ id: name, name, level, link: null, logoUrl: `/api/v1/public/sponsors/${name}/logo?v=1` });

describe('sponsorHref', () => {
  it('opens websites and calls phone numbers', () => {
    expect(sponsorHref('https://abcmotors.in')).toBe('https://abcmotors.in');
    expect(sponsorHref('+919876543210')).toBe('tel:+919876543210');
  });
  it('ignores missing or unexpected links', () => {
    expect(sponsorHref(null)).toBeNull();
    expect(sponsorHref('')).toBeNull();
    expect(sponsorHref('javascript:alert(1)')).toBeNull();
  });
});

describe('fitLogoSize', () => {
  it('shrinks wide logos to 400 px, keeping their shape', () => {
    expect(fitLogoSize(1600, 800)).toEqual({ width: 400, height: 200 });
    expect(fitLogoSize(3000, 7)).toEqual({ width: 400, height: 1 });
  });
  it('leaves small logos as they are', () => {
    expect(fitLogoSize(300, 120)).toEqual({ width: 300, height: 120 });
  });
});

describe('sponsor helpers', () => {
  it('finds the Title sponsor', () => {
    expect(titleSponsor([sponsor('A', 'PARTNER'), sponsor('B', 'TITLE')])?.name).toBe('B');
    expect(titleSponsor([sponsor('A', 'PARTNER')])).toBeNull();
    expect(titleSponsor(undefined)).toBeNull();
  });
  it('keeps full logo URLs and leaves API paths for the API host', () => {
    expect(sponsorLogoSrc({ logoUrl: 'https://cdn.example/logo.png' })).toBe('https://cdn.example/logo.png');
    expect(sponsorLogoSrc({ logoUrl: '/api/v1/public/sponsors/x/logo' })).toMatch(/\/api\/v1\/public\/sponsors\/x\/logo$/);
  });
});

describe('shortLinkPath', () => {
  it('opens the match page or the tournament page', () => {
    expect(shortLinkPath({ type: 'MATCH', id: 'abc' })).toBe('/watch/abc');
    expect(shortLinkPath({ type: 'TOURNAMENT', id: 'xyz' })).toBe('/tournaments/xyz');
  });
});
