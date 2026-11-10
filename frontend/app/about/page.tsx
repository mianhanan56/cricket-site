import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import { CONTACT_EMAIL } from '@/lib/site';
import { InfoPage, InfoSection } from '@/components/info/InfoPage';
import styles from './about.module.scss';

export const metadata = pageMeta({
  title: 'About PulseCrease',
  absoluteTitle: true,
  description:
    'PulseCrease is a live cricket site: ball-by-ball scores, scorecards, win probability, fixtures, series stats, ICC rankings and alerts for the matches you follow.',
  path: '/about',
});

const SECTIONS = [
  { href: '/', title: 'Live scores', body: 'Every match in play, ball by ball, with the chase equation and win probability.' },
  { href: '/fixtures', title: 'Fixtures', body: 'The next month of internationals, T20 leagues and domestic cricket.' },
  { href: '/series', title: 'Series', body: 'Tours and tournaments with points tables, results and top performers.' },
  { href: '/rankings', title: 'ICC rankings', body: 'Team, batting, bowling and all-rounder lists for every format.' },
  { href: '/teams', title: 'Teams', body: 'Form, fixtures, results and squads for every ranked side.' },
  { href: '/players', title: 'Players', body: 'Career numbers, recent form and series-by-series performance.' },
  { href: '/news', title: 'News', body: 'Squad announcements, previews and reaction.' },
  { href: '/automations', title: 'Alerts', body: 'Wickets, milestones and close finishes from the matches you follow.' },
];

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="About"
      title="Cricket, as it happens"
      lead="PulseCrease follows every match in play — international, franchise and domestic — and turns each ball into a score you can read at a glance: who's ahead, what the chase needs and how the game has swung."
    >
      <InfoSection id="whats-here" title="What’s here">
        <ul className={styles.grid}>
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className={styles.tile}>
                <span className={styles.tileTitle}>{s.title}</span>
                <span className={styles.tileBody}>{s.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </InfoSection>

      <InfoSection id="how-it-works" title="How it works">
        <p>
          Scores, scorecards and commentary update live while a match is on. Win probability, momentum and the
          chase equation are worked out from the ball-by-ball record as it arrives, and team, venue and
          head-to-head records come from the last seven weeks of results.
        </p>
        <p>
          There is no account to make. What you follow, your alert rules and your theme are kept in your own
          browser — see the <Link href="/privacy">privacy policy</Link>.
        </p>
      </InfoSection>

      {CONTACT_EMAIL && (
        <InfoSection id="contact" title="Contact">
          <p>
            Corrections, feedback or questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </InfoSection>
      )}
    </InfoPage>
  );
}
