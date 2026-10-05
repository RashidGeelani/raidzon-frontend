import { useState } from 'react';
import type { LocalMatch } from '../scoring/domain/match-types';
import { pushNow } from './data/live-sync';
import { detachFixture, retryFixtureLink } from './data/sync-matches';

/**
 * Shown when the tournament refused to attach this match to its fixture. The scores are safe and
 * uploaded; the scorer can retry after the organizer fixes things, or keep it as a normal match.
 */
export function FixtureLinkNotice({ match, online }: { match: LocalMatch; online: boolean }) {
  const [busy, setBusy] = useState(false);
  const error = match.fixtureRef?.linkError;
  if (!error) return null;
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      void pushNow(match.id);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel fixture-link-notice" role="alert" aria-label="Fixture not linked">
      <strong>Not counted in the tournament yet</strong>
      <p>{error}</p>
      <p className="fixture-link-help">
        Scores are saved and still visible to watchers. Ask the organizer to fix the fixture, then try
        again — or keep this as a normal match.
      </p>
      <div className="fixture-link-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy || !online}
          onClick={() => void run(() => retryFixtureLink(match.id))}
        >
          Try again
        </button>
        <button
          type="button"
          className="quiet"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Keep this as a normal match? It will not count in the tournament.'))
              void run(() => detachFixture(match.id));
          }}
        >
          Keep as normal match
        </button>
      </div>
    </section>
  );
}
