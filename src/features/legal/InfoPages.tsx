import type { ReactNode } from 'react';

/** Contact address shown on Help and Privacy. Set VITE_SUPPORT_EMAIL at build time. */
export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || 'support@raidzon.com';
const UPDATED = '2 October 2026';

function InfoLayout({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <main className="info-page">
      <header className="info-page-header">
        <a className="tournament-back" href="/" aria-label="Back to raidzOn">←</a>
        <span className="info-page-brand">raidzOn</span>
      </header>
      <section className="info-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </section>
      {children}
      <footer className="info-page-footer">
        <a href="/help">Help & Support</a>
        <a href="/privacy">Privacy policy</a>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </footer>
    </main>
  );
}

const FAQ: [string, ReactNode][] = [
  ['Do I need an account to score?', 'No. Anyone can score a match on their phone without signing in, even with no internet. Sign in with your phone number when you want to share the match live, keep stats on your player profile, or run a tournament.'],
  ['What happens if the internet drops during a match?', 'Keep scoring. Every raid is saved on your phone first and uploads automatically when you reconnect. The badge above the scoreboard shows whether watchers are seeing the latest score.'],
  ['How do people watch the match live?', 'When you start a match while signed in, you get a live link to copy or share on WhatsApp. Anyone with the link sees the score raid by raid. You can find it again with "Share live link" on the scoring screen.'],
  ['When does the match clock start?', 'Each half’s clock starts with that half’s first raid. The raid timer turns red with a beep in the last 10 seconds of a raid.'],
  ['How do I undo a mistake?', 'Tap "Undo last event" below the raid panel. It reverses the latest event and restores the score, players and revival queue.'],
  ['How do the on-court tabs work?', 'The slim tabs at the screen edges show each team’s players on court (green dot) and the revival queue in the order players return. Tap a tab to open or close it.'],
  ['How do I run a tournament?', <>Open <strong>Tournaments → My tournaments</strong> and tap <strong>Host your own tournament</strong>. Add teams, schedule fixtures, then score each fixture. Standings update automatically.</>],
  ['How does a team join someone else’s tournament?', 'Open the tournament from Explore and use "Play in this tournament" to send a request with your saved squad. The organizer approves or rejects it, and you get a notification either way.'],
  ['Why does my name look different in some matches?', 'The name you set on your profile replaces the name a team typed for you in every match linked to your verified number. You can change your profile name once every 30 days.'],
];

export function HelpPage() {
  return (
    <InfoLayout eyebrow="HELP & SUPPORT" title="How can we help?" intro="Quick answers about scoring, sharing and tournaments. Still stuck? Write to us and we’ll get back to you.">
      <a className="info-contact" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('raidzOn support')}`}>
        <span aria-hidden="true">✉</span>
        <span><strong>Contact support</strong><small>{SUPPORT_EMAIL}</small></span>
        <b aria-hidden="true">›</b>
      </a>
      <section className="info-section">
        <h2>Frequently asked questions</h2>
        {FAQ.map(([question, answer]) => (
          <details className="info-faq" key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      <section className="info-section">
        <h2>Report a scoring problem</h2>
        <p>Tell us the match, the teams and roughly when it happened. If you can, add a screenshot of the scoring screen. Your scores stay on your phone until they upload, so nothing is lost while we look into it.</p>
      </section>
    </InfoLayout>
  );
}

const POLICY: [string, ReactNode][] = [
  ['Who we are', 'raidzOn is a kabaddi scoring, tournament and player-statistics app. This policy explains what information the app collects, why, and the choices you have.'],
  ['Information you give us', <ul>
    <li><strong>Phone number</strong> — to sign you in with a one-time code and to link matches and statistics to you.</li>
    <li><strong>Names</strong> — your player name, and the names of teams, players, tournaments and venues that you or other organizers enter.</li>
    <li><strong>Match data</strong> — raids, scores, substitutions and other events recorded by scorers.</li>
    <li><strong>Messages</strong> — the optional note sent with a request to join a tournament.</li>
  </ul>],
  ['Information collected automatically', <ul>
    <li>A random device identifier and sign-in session, so only the scoring phone can change a match.</li>
    <li>Basic technical logs (such as time of request and errors) kept to run and secure the service.</li>
    <li>Data stored on your phone (matches, saved squads) so the app works offline. It stays on your device until it uploads or you clear the app’s data.</li>
  </ul>],
  ['How we use it', <ul>
    <li>To sign you in, save and sync matches, run tournaments and calculate standings and player statistics.</li>
    <li>To show live and public scorecards that an organizer chooses to share.</li>
    <li>To send in-app notifications about join requests and approvals.</li>
    <li>To keep the service secure and fix problems. We do not sell your information and we do not show ads.</li>
  </ul>],
  ['What other people can see', <ul>
    <li>Public scorecards and live links show team names, player names and scores — never phone numbers.</li>
    <li>When a tournament organizer approves your team, they receive the squad’s player names and phone numbers so they can run the tournament.</li>
    <li>Team owners and managers see the phone numbers of players in their squad.</li>
  </ul>],
  ['Service providers', 'We use trusted providers to run the app: hosting for the app and database, and an SMS provider to deliver sign-in codes. They process data only to provide those services to us.'],
  ['How long we keep it', 'Match and tournament records are kept so statistics and standings stay accurate. Sign-in codes expire within minutes. You can ask us to delete your account and personal information at any time.'],
  ['Your choices and rights', <>You can update your player name in your profile, stop sharing a scorecard, and sign out at any time. To access, correct or delete your information, or to raise a concern, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We’ll respond as required by applicable law, including India’s Digital Personal Data Protection Act, 2023.</>],
  ['Children', 'raidzOn is meant for players, scorers and organizers. If a young player is added to a team, the organizer should have permission from a parent or guardian. Contact us to remove a child’s information.'],
  ['Security', 'Information is sent over encrypted connections and access is limited to the people who need it to run a match or tournament. No system is perfectly secure, so please keep your phone and sign-in codes private.'],
  ['Changes', 'We may update this policy as the app changes. The date at the top shows the latest version; important changes will be highlighted in the app.'],
];

export function PrivacyPage() {
  return (
    <InfoLayout eyebrow={`PRIVACY POLICY · UPDATED ${UPDATED.toUpperCase()}`} title="Your data, plainly explained" intro="We collect only what we need to score matches, run tournaments and keep your stats.">
      {POLICY.map(([heading, body]) => (
        <section className="info-section" key={heading}>
          <h2>{heading}</h2>
          {typeof body === 'string' ? <p>{body}</p> : body}
        </section>
      ))}
    </InfoLayout>
  );
}
