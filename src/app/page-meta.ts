/** Per-page title, description, canonical and optional JSON-LD for the public pages (shared links, help). */
export function setPageMeta(title: string, description: string, jsonLd?: object) {
  document.title = title;
  const url = `${window.location.origin}${window.location.pathname.replace(/\/+$/, '') || '/'}`;
  const tags: [string, string, string][] = [
    ['meta[name="description"]', 'content', description],
    ['meta[property="og:title"]', 'content', title],
    ['meta[property="og:description"]', 'content', description],
    ['meta[property="og:url"]', 'content', url],
    ['meta[name="twitter:title"]', 'content', title],
    ['meta[name="twitter:description"]', 'content', description],
    ['link[rel="canonical"]', 'href', url],
  ];
  for (const [selector, attribute, value] of tags) document.head.querySelector(selector)?.setAttribute(attribute, value);
  document.getElementById('page-jsonld')?.remove();
  if (!jsonLd) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'page-jsonld';
  script.textContent = JSON.stringify(jsonLd);
  document.head.append(script);
}

/** schema.org SportsEvent for one kabaddi match; also built by the server-side page renderer (api/page.js). */
export function matchJsonLd(teamA: string, teamB: string, status: string, url: string, startedAt?: number | null, venue?: string | null) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${teamA} vs ${teamB}`,
    sport: 'Kabaddi',
    url,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    competitor: [{ '@type': 'SportsTeam', name: teamA }, { '@type': 'SportsTeam', name: teamB }],
    description: `${teamA} vs ${teamB} kabaddi match, ${status.toLowerCase().replaceAll('_', ' ')}. Live score on RaidzOn.`,
    ...(startedAt ? { startDate: new Date(startedAt).toISOString() } : {}),
    ...(venue ? { location: { '@type': 'Place', name: venue, address: venue } } : {}),
  };
}

/** schema.org SportsEvent for a kabaddi tournament; mirrored in api/page.js. */
export function tournamentJsonLd(name: string, venue: string, startsOn: string, teams: string[], url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name,
    sport: 'Kabaddi',
    url,
    startDate: startsOn,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: venue, address: venue },
    competitor: teams.map((team) => ({ '@type': 'SportsTeam', name: team })),
  };
}

/** schema.org Person for a kabaddi player's public page; mirrored in api/page.js. */
export function playerJsonLd(name: string, description: string, url: string) {
  return { '@context': 'https://schema.org', '@type': 'Person', name, url, description, knowsAbout: 'Kabaddi' };
}
