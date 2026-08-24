import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { HeadToHeadMatch, Match, TeamProfile } from '@/types';
import { getCrexTeamProfile } from '../../../lib/crex';
import RankingCrest from '../../../components/rankings/RankingCrest';
import LocalTime from '../../../components/ui/LocalTime';
import BackButton from '../../../components/ui/BackButton';
import styles from './team.module.scss';

// Keys here are crex team f_keys ("2Y", "1GK") — the same ones on every
// scorecard, schedule row, points-table line and team-ranking row. Every side in
// the app was named and unopenable before this page existed.
//
// Freshness is set per-fetch rather than with a page-level `revalidate`, for the
// same reason as /matches/[id], /series/[id] and /players/[id]: an ISR-cached
// route caches the notFound() path too, serving an unknown key as a soft 404.
const REVALIDATE = 1800;

async function loadTeam(key: string): Promise<TeamProfile | null> {
  return getCrexTeamProfile(key, { revalidate: REVALIDATE }).catch(() => null);
}

export async function generateMetadata({ params }: { params: { key: string } }) {
  const profile = await loadTeam(params.key);
  if (!profile) return { title: 'Team' };

  const { team, rankings, upcoming } = profile;
  const ranked = rankings.length
    ? `Ranked ${rankings.map((r) => `${r.position} in ${r.format}`).join(', ')}.`
    : null;

  return {
    title: `${team.name} — Fixtures, Squad & Form`,
    description: [
      `${team.name} cricket: upcoming fixtures, recent results and the current squad.`,
      ranked,
      upcoming[0] && `Next up ${upcoming[0].homeTeam.shortName} vs ${upcoming[0].awayTeam.shortName}.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}



const FORM_WORD = { W: 'won', L: 'lost', N: 'no result' } as const;

/** The side's last five, most recent first. Shares the table's vocabulary. */
function FormStrip({ form }: { form: Array<'W' | 'L' | 'N'> }) {
  return (
    <span className={styles.form}>
      <span className={styles.srOnly}>
        Last {form.length}, most recent first: {form.map((f) => FORM_WORD[f]).join(', ')}
      </span>
      {form.map((f, i) => (
        <span className={styles.formDot} data-result={f} key={i} aria-hidden="true">
          {f}
        </span>
      ))}
    </span>
  );
}

/**
 * One finished match, from this side's point of view.
 *
 * The outcome chip is drawn from `winnerKey` and not from the result text, so a
 * meeting crex worded in a way `attributeResult` cannot read shows the sentence
 * without a W or an L beside it — rather than being filed as a loss.
 */
function ResultRow({ match, teamKey }: { match: HeadToHeadMatch; teamKey: string }) {
  const outcome = match.winnerKey ? (match.winnerKey === teamKey ? 'W' : 'L') : null;

  const body = (
    <>
      <span className={styles.resultMark} data-result={outcome ?? 'N'}>
        {outcome ?? '·'}
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTop}>{match.result}</span>
        <span className={styles.rowMeta}>
          <LocalTime iso={match.startTime} format="date" /> · {match.series}
          {match.venue !== 'TBD' && ` · ${match.venue}`}
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

/** One scheduled match. The opponent is whichever side is not this one. */
function FixtureRow({ match, teamKey }: { match: Match; teamKey: string }) {
  const opponent = match.homeTeam.id === teamKey ? match.awayTeam : match.homeTeam;

  const body = (
    <>
      <span className={styles.vs}>vs</span>
      <span className={styles.rowMain}>
        <span className={styles.rowTop}>{opponent.name}</span>
        <span className={styles.rowMeta}>
          <LocalTime iso={match.startTime} format="dayTime" /> · {match.series.name}
          {match.venue !== 'TBD' && ` · ${match.venue}`}
        </span>
      </span>
      <span className={styles.rowFormat}>{match.format}</span>
    </>
  );

  // Both kinds of id open: a crex match key where crex has allocated one, and
  // the fixture's preview id where it has not.
  return (
    <Link href={`/matches/${match.id}`} className={styles.row}>
      {body}
    </Link>
  );
}

/** Fixtures listed. Beyond this it is a schedule, and /fixtures is the schedule. */
const FIXTURES_SHOWN = 6;
/** Results listed. */
const RESULTS_SHOWN = 8;

/**
 * A section's count chip: the real total, and what is actually on screen when the
 * list is a slice of it. "8" above eight rows drawn from fourteen results is the
 * kind of number a reader reasonably trusts and should not.
 */
const shownOf = (shown: number, total: number): string =>
  shown < total ? `${shown} of ${total}` : String(total);

export default async function TeamPage({ params }: { params: { key: string } }) {
  const profile = await loadTeam(params.key);
  if (!profile) notFound();

  const { team, colors, rankings, upcoming, recent, form, squad, squadSeries } = profile;

  // The club's own colours, handed to CSS as data rather than as styling — the
  // same shape WinProbability uses for its split. Every rule that reads them
  // lives in the stylesheet; only the two values crex knows and SCSS cannot are
  // here. Both are optional: a side crex has no colours for falls back to the
  // app's own accent, declared in the module.
  const tint = {
    ...(colors.primary ? { '--team-primary': colors.primary } : {}),
    ...(colors.secondary ? { '--team-secondary': colors.secondary } : {}),
  } as React.CSSProperties;

  // Counted three ways, not two. `recent.length - won` would file a result this
  // could not attribute — "GAW Won (DLS Method)", which names no margin — as a
  // loss, and a record that quietly converts unknowns into defeats is the exact
  // failure the rest of this feature is built to avoid.
  const won = recent.filter((m) => m.winnerKey === team.id).length;
  const lost = recent.filter((m) => m.winnerKey && m.winnerKey !== team.id).length;
  const unread = recent.length - won - lost;

  return (
    <div className={styles.page}>
      <BackButton />

      {/* The signature element: the hero carries the side's OWN colours, so a
          CPL franchise's page looks like that franchise rather than like the
          site's mint accent for the fifth time. Everything below the hero stays
          on the app's palette — one bold element, disciplined around it. */}
      <header className={styles.hero} style={tint} data-tinted={colors.primary ? '' : undefined}>
        <div className={styles.heroWash} aria-hidden="true" />

        <div className={styles.heroMain}>
          <div className={styles.crestBox}>
            <RankingCrest name={team.name} shortName={team.shortName} logo={team.logo} size="lg" />
          </div>

          <div className={styles.heroText}>
            <p className={styles.eyebrow}>{team.shortName}</p>
            <h1 className={styles.heading}>{team.name}</h1>

            {form.length > 0 && (
              <div className={styles.heroForm}>
                <FormStrip form={form} />
                <span className={styles.heroRecord}>
                  {won}–{lost} from {recent.length}
                  {unread > 0 && ` · ${unread} unread`}
                </span>
              </div>
            )}
          </div>
        </div>

        {rankings.length > 0 && (
          <ul className={styles.rankStrip}>
            {rankings.map((r) => (
              <li key={`${r.gender}-${r.format}`} className={styles.rankChip}>
                <span className={styles.rankPos}>#{r.position}</span>
                <span className={styles.rankLabel}>
                  {r.format}
                  {r.gender === 'WOMEN' && <span className={styles.rankGender}>W</span>}
                </span>
                <span className={styles.rankRating}>{r.rating}</span>
              </li>
            ))}
          </ul>
        )}
      </header>

      {upcoming.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Fixtures
            <span className={styles.sectionCount}>
              {shownOf(Math.min(upcoming.length, FIXTURES_SHOWN), upcoming.length)}
            </span>
          </h2>
          <div className={styles.list}>
            {upcoming.slice(0, FIXTURES_SHOWN).map((m) => (
              <FixtureRow match={m} teamKey={team.id} key={m.id} />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Recent results
            <span className={styles.sectionCount}>
              {shownOf(Math.min(recent.length, RESULTS_SHOWN), recent.length)}
            </span>
          </h2>
          <div className={styles.list}>
            {recent.slice(0, RESULTS_SHOWN).map((m) => (
              <ResultRow match={m} teamKey={team.id} key={m.key} />
            ))}
          </div>
        </section>
      )}

      {squad.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Squad
            {squadSeries && (
              <Link href={`/series/${squadSeries.id}`} className={styles.sectionLink}>
                {squadSeries.name}
              </Link>
            )}
          </h2>
          <ul className={styles.squad}>
            {squad.map((p) => (
              <li key={p.id} className={styles.squadItem}>
                <Link href={`/players/${p.id}`} className={styles.squadName}>
                  {p.name}
                </Link>
                {(p.isCaptain || p.role === 'WK') && (
                  <span className={styles.squadRole}>
                    {p.isCaptain ? 'c' : ''}
                    {p.isCaptain && p.role === 'WK' ? ' · ' : ''}
                    {p.role === 'WK' ? 'wk' : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* A side crex names but has nothing scheduled or recorded for inside the
          window. Real, and common between tours — so it is a page that says so
          rather than a 404. */}
      {!upcoming.length && !recent.length && !squad.length && (
        <p className={styles.empty}>
          No fixtures, results or squad listed for {team.name} right now.
        </p>
      )}
    </div>
  );
}
