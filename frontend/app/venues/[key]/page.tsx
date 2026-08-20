import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { HeadToHeadMatch, Match, VenueProfile } from '@/types';
import { getCrexFixtureRange } from '../../../lib/crex';
import { venueProfile } from '../../../lib/venues';
import RankingCrest from '../../../components/rankings/RankingCrest';
import styles from './venue.module.scss';

// Keys here are crex venue f_keys ("3E", "GY") — carried on every match, fixture
// and schedule row, and until now never anything but a caption.
//
// There is no venue endpoint. Everything on this page is derived from a window of
// the schedule (`getCrexFixtureRange`), whose finished rows carry both sides, the
// scores and the result sentence. So the page describes that window and says so,
// rather than implying a full history of the ground.
//
// Freshness is per-fetch rather than a page-level `revalidate`, for the same
// reason as every other keyed route here: an ISR-cached route caches notFound()
// too, which serves an unknown key as a soft 404.
const REVALIDATE = 1800;

async function loadVenue(key: string): Promise<VenueProfile | null> {
  const corpus = await getCrexFixtureRange({ revalidate: REVALIDATE }).catch(() => []);
  if (!corpus.length) return null;

  // The name comes out of the corpus rather than a second /mapping call: a venue
  // with no match in the window has no page anyway, and every match in it has
  // the ground already resolved.
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDayTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The ground's character in one bar: how its decided matches split between the
 * side chasing and the side batting first.
 *
 * The page's signature element, and the only place boldness is spent, because it
 * is the one thing a venue page can tell a reader that no other page can. Read
 * off the result sentence — "won by 6 wickets" was chased, "won by 34 runs" was
 * defended — so the count of matches it can read is stated alongside it rather
 * than the total being implied.
 */
function ChaseSplit({ venue }: { venue: VenueProfile }) {
  const decided = venue.chased + venue.defended;
  if (!decided) return null;

  const chasePct = Math.round((venue.chased / decided) * 100);
  const favours = chasePct > 55 ? 'chasing' : chasePct < 45 ? 'batting first' : 'neither side';

  return (
    <section className={styles.split}>
      <div className={styles.splitHead}>
        <h2 className={styles.splitTitle}>How matches are won here</h2>
        <p className={styles.splitLede}>
          {favours === 'neither side' ? (
            <>An even ground — no clear advantage either way.</>
          ) : (
            <>
              Favours <strong>{favours}</strong>.
            </>
          )}{' '}
          <span className={styles.splitBasis}>
            {decided} decided {decided === 1 ? 'result' : 'results'} in this window
            {venue.inconclusive > 0 && `, ${venue.inconclusive} not counted`}
          </span>
        </p>
      </div>

      <div
        className={styles.bar}
        role="img"
        aria-label={`${venue.chased} of ${decided} won chasing, ${venue.defended} won batting first`}
      >
        {/* A percentage cannot be a class, so it arrives as data. Every colour and
            dimension in the bar is in the stylesheet. */}
        <span className={styles.barChase} style={{ width: `${chasePct}%` }} />
        <span className={styles.barDefend} style={{ width: `${100 - chasePct}%` }} />
      </div>

      <div className={styles.splitLegend}>
        <span className={styles.legendChase}>
          <span className={styles.legendFigure}>{venue.chased}</span> won chasing
        </span>
        <span className={styles.legendDefend}>
          <span className={styles.legendFigure}>{venue.defended}</span> won batting first
        </span>
      </div>
    </section>
  );
}

function ResultRow({ match }: { match: HeadToHeadMatch }) {
  const body = (
    <>
      <span className={styles.rowMain}>
        <span className={styles.rowTop}>{match.result}</span>
        <span className={styles.rowMeta}>
          {fmtDate(match.startTime)} · {match.series}
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
    <div className={`${styles.row} ${styles.rowInert}`}>{body}</div>
  );
}

function FixtureRow({ match }: { match: Match }) {
  const body = (
    <>
      <span className={styles.rowMain}>
        <span className={styles.rowTop}>
          {match.homeTeam.shortName} <span className={styles.vs}>vs</span>{' '}
          {match.awayTeam.shortName}
        </span>
        <span className={styles.rowMeta}>
          {fmtDayTime(match.startTime)} · {match.series.name}
        </span>
      </span>
      <span className={styles.rowFormat}>{match.format}</span>
    </>
  );

  // A fixture with no match key yet still has a preview page — `match.id` falls
  // back to the id built from its series and schedule row.
  return (
    <Link href={`/matches/${match.id}`} className={styles.row}>
      {body}
    </Link>
  );
}

export default async function VenuePage({ params }: { params: { key: string } }) {
  const venue = await loadVenue(params.key);
  if (!venue) notFound();

  const total = venue.playedCount + venue.upcomingCount;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Ground</p>
        <h1 className={styles.heading}>{venue.name}</h1>
        <p className={styles.caption}>
          {total} {total === 1 ? 'match' : 'matches'} · {venue.playedCount} played,{' '}
          {venue.upcomingCount} to come
        </p>
      </header>

      <ChaseSplit venue={venue} />

      {venue.regulars.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Regulars</h2>
          <ul className={styles.regulars}>
            {venue.regulars.map(({ team, matches }) => (
              <li key={team.id}>
                <Link href={`/teams/${team.id}`} className={styles.regular}>
                  <RankingCrest name={team.name} shortName={team.shortName} logo={team.logo} />
                  <span className={styles.regularName}>{team.shortName}</span>
                  <span className={styles.regularCount}>{matches}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {venue.upcoming.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Next here
            <span className={styles.sectionCount}>{venue.upcomingCount}</span>
          </h2>
          <div className={styles.list}>
            {venue.upcoming.map((m) => (
              <FixtureRow match={m} key={m.id} />
            ))}
          </div>
        </section>
      )}

      {venue.played.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Recent results
            {/* The total, with what is actually listed said alongside it when the
                list is a slice — a "12" over twelve rows drawn from fifteen
                results is the same quiet mismatch the header had. */}
            <span className={styles.sectionCount}>
              {venue.played.length < venue.playedCount
                ? `${venue.played.length} of ${venue.playedCount}`
                : venue.playedCount}
            </span>
          </h2>
          <div className={styles.list}>
            {venue.played.map((m) => (
              <ResultRow match={m} key={m.key} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
