import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { HeadToHeadMatch, VenueProfile } from '@/types';
import { getCrexFixtureRange } from '@/lib/crex';
import { venueProfile } from '@/lib/venues';
import TeamBadge from '@/components/ui/TeamBadge';
import LocalTime from '@/components/ui/LocalTime';
import BackButton from '@/components/ui/BackButton';
import UpcomingRail from '@/components/home/UpcomingRail';
import { PageHeader, SectionHead } from '@/components/ui/Section';
import styles from './venue.module.scss';

// There is no venue endpoint: everything here is derived from a window of the schedule.
// Per-fetch freshness, not a page-level revalidate: ISR would cache notFound() for unknown keys.
const REVALIDATE = 1800;

async function loadVenue(key: string): Promise<VenueProfile | null> {
  const corpus = await getCrexFixtureRange({ revalidate: REVALIDATE }).catch(() => []);
  if (!corpus.length) return null;

  const named = corpus.find((m) => m.venueId === key && m.venue !== 'TBD');
  return venueProfile(key, named?.venue ?? 'Unknown ground', corpus);
}

export async function generateMetadata({ params }: { params: { key: string } }) {
  const venue = await loadVenue(params.key);
  if (!venue) return { title: 'Venue' };

  const decided = venue.chased + venue.defended;
  const split = decided
    ? `${venue.chased} of the last ${decided} results here went to the side batting second.`
    : null;

  return {
    title: `${venue.name} — Results, Fixtures & Chasing Record`,
    description: [
      `Cricket at ${venue.name}: recent results, upcoming fixtures and how matches are won here.`,
      split,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/** How decided matches split between the chasing side and the side batting first. */
function ChaseSplit({ venue }: { venue: VenueProfile }) {
  const decided = venue.chased + venue.defended;
  if (!decided) return null;

  const chasePct = Math.round((venue.chased / decided) * 100);
  const favours = chasePct > 55 ? 'Chasing' : chasePct < 45 ? 'Batting first' : null;

  return (
    <section className={styles.split} aria-labelledby="split-title">
      <div className={styles.splitHead}>
        <h2 id="split-title" className={styles.splitTitle}>
          How matches are won here
        </h2>
        <span className={styles.verdict} data-side={favours === 'Chasing' ? 'chase' : 'other'}>
          {favours ? `${favours} favoured` : 'Even ground'}
        </span>
      </div>

      <div className={styles.splitFigures}>
        <div className={styles.figure} data-side="chase">
          <span className={styles.figureLabel}>Won chasing</span>
          <span className={styles.figureNum}>{venue.chased}</span>
          <span className={styles.figurePct}>{chasePct}%</span>
        </div>
        <div className={styles.figure} data-side="defend">
          <span className={styles.figureLabel}>Won batting first</span>
          <span className={styles.figureNum}>{venue.defended}</span>
          <span className={styles.figurePct}>{100 - chasePct}%</span>
        </div>
      </div>

      <svg
        className={styles.bar}
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${venue.chased} of ${decided} won chasing, ${venue.defended} won batting first`}
      >
        <rect x="0" y="0" width={chasePct} height="8" className={styles.barChase} />
        <rect x={chasePct} y="0" width={100 - chasePct} height="8" className={styles.barDefend} />
        <line x1="50" x2="50" y1="0" y2="8" className={styles.barMid} />
      </svg>

      <p className={styles.basis}>
        {decided} decided {decided === 1 ? 'result' : 'results'}
        {venue.inconclusive > 0 && ` · ${venue.inconclusive} without a result`}
      </p>
    </section>
  );
}

function ResultRow({ match }: { match: HeadToHeadMatch }) {
  const body = (
    <>
      <span className={styles.rowMain}>
        <span className={styles.rowResult}>{match.result}</span>
        <span className={styles.rowMeta}>
          <LocalTime iso={match.startTime} format="date" />
          <span className={styles.rowSeries}>{match.series}</span>
        </span>
      </span>
      <span className={styles.rowFormat}>{match.format}</span>
    </>
  );

  return match.id ? (
    <Link href={`/matches/${match.id}`} className={styles.row}>
      {body}
    </Link>
  ) : (
    <div className={styles.row}>{body}</div>
  );
}

export default async function VenuePage({ params }: { params: { key: string } }) {
  const venue = await loadVenue(params.key);
  if (!venue) notFound();

  // Knockout slots carry placeholder sides ("Team 1 (TBC)") that are not teams anyone plays for.
  const regulars = venue.regulars.filter(({ team }) => !/\bTBC\b/i.test(`${team.shortName} ${team.name}`));

  return (
    <div className={styles.page}>
      <BackButton className={styles.back} />

      <PageHeader
        eyebrow="Venue"
        title={venue.name}
        aside={
          <dl className={styles.counts}>
            <div>
              <dt>Played</dt>
              <dd>{venue.playedCount}</dd>
            </div>
            <div>
              <dt>To come</dt>
              <dd>{venue.upcomingCount}</dd>
            </div>
          </dl>
        }
      />

      <div className={styles.top}>
        <ChaseSplit venue={venue} />

        {regulars.length > 0 && (
          <section className={styles.regularsBlock}>
            <SectionHead title="Regulars" level={3} />
            <ul className={styles.regulars}>
              {regulars.map(({ team, matches }) => (
                <li key={team.id}>
                  <Link href={`/teams/${team.id}`} className={styles.regular}>
                    <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="sm" />
                    <span className={styles.regularName}>
                      <span className={styles.regularCode}>{team.shortName}</span>
                      <span className={styles.regularFull}>{team.name}</span>
                    </span>
                    <span className={styles.regularCount}>
                      {matches}
                      <span className={styles.regularUnit}>{matches === 1 ? 'match' : 'matches'}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className={styles.lists}>
        {venue.upcoming.length > 0 && (
          <section className={styles.section}>
            <SectionHead title="Next here" count={venue.upcoming.length} />
            <UpcomingRail matches={venue.upcoming} />
          </section>
        )}

        {venue.played.length > 0 && (
          <section className={styles.section}>
            <SectionHead title="Recent results" count={venue.played.length} />
            <div className={styles.results}>
              {venue.played.map((m) => (
                <ResultRow match={m} key={m.key} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
