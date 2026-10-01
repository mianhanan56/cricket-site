import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { HeadToHeadMatch, PlayerRole, SquadPlayer, TeamProfile, TeamRankingPosition } from '@/types';
import { getCrexTeamProfile } from '../../../lib/crex';
import TeamBadge from '../../../components/ui/TeamBadge';
import LocalTime from '../../../components/ui/LocalTime';
import BackButton from '../../../components/ui/BackButton';
import EmptyState from '../../../components/ui/EmptyState';
import { SectionHead } from '../../../components/ui/Section';
import TeamUpcoming from './TeamUpcoming';
import TeamResults from './TeamResults';
import FollowButton from '../../../components/follow/FollowButton';
import styles from './team.module.scss';
import { venueText } from '@/lib/venue';

// Per-fetch freshness rather than page-level `revalidate`: ISR would cache the
// notFound() path too, serving an unknown key as a soft 404.
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
const FIXTURES_SHOWN = 6;
const RESULTS_SHOWN = 8;

const rankingsHref = (r: TeamRankingPosition) =>
  `/rankings?group=teams&format=${r.format.toLowerCase()}&gender=${r.gender.toLowerCase()}`;


/** The club's own colours as an SVG wash — attributes, not inline style. */
function ColourWash({ primary, secondary }: { primary: string | null; secondary: string | null }) {
  if (!primary && !secondary) return null;
  return (
    <svg className={styles.wash} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {primary && (
          <radialGradient id="team-wash-p" cx="0.08" cy="0" r="0.75">
            <stop offset="0" stopColor={primary} stopOpacity="0.34" />
            <stop offset="1" stopColor={primary} stopOpacity="0" />
          </radialGradient>
        )}
        {secondary && (
          <radialGradient id="team-wash-s" cx="0.96" cy="1" r="0.6">
            <stop offset="0" stopColor={secondary} stopOpacity="0.22" />
            <stop offset="1" stopColor={secondary} stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      {primary && <rect width="100" height="100" fill="url(#team-wash-p)" />}
      {secondary && <rect width="100" height="100" fill="url(#team-wash-s)" />}
    </svg>
  );
}

function FormStrip({ form }: { form: Array<'W' | 'L' | 'N'> }) {
  return (
    <span className={styles.form}>
      <span className={styles.srOnly}>
        Last {form.length}, most recent first: {form.map((f) => FORM_WORD[f]).join(', ')}
      </span>
      {form.map((f, i) => (
        <span className={styles.token} data-result={f} key={i} aria-hidden="true">
          {f}
        </span>
      ))}
    </span>
  );
}

/** Splits "IND Won by 6 wickets" so the winner carries the weight; anything else prints whole. */
function ResultText({ text }: { text: string }) {
  const m = /^(.+?)\s+(won\b.*)$/i.exec(text);
  if (!m) return <span className={styles.resultText}>{text}</span>;
  return (
    <span className={styles.resultText}>
      <strong className={styles.winner}>{m[1]}</strong> {m[2]}
    </span>
  );
}

// Outcome from `winnerKey`, never the sentence, so unattributable wording gets a
// neutral mark instead of being filed as a loss.
function ResultRow({ match, teamKey }: { match: HeadToHeadMatch; teamKey: string }) {
  const outcome = match.winnerKey ? (match.winnerKey === teamKey ? 'W' : 'L') : 'N';
  const opponent = match.sides?.find((s) => s.id !== teamKey);
  const body = (
    <>
      <span className={styles.token} data-result={outcome} data-size="lg">
        <span aria-hidden="true">{outcome === 'N' ? '·' : outcome}</span>
        <span className={styles.srOnly}>{outcome === 'W' ? 'Won' : outcome === 'L' ? 'Lost' : 'No decision'}</span>
      </span>
      <span className={styles.resultMain}>
        <ResultText text={match.result} />
        <span className={styles.resultMeta}>
          {opponent && <span className={styles.opponent}>v {opponent.shortName}</span>}
          <LocalTime iso={match.startTime} format="date" />
          <span className={styles.fmt}>{match.format}</span>
          <span className={styles.series}>{match.series}</span>
          <span className={styles.venue}>{venueText(match.venue)}</span>
        </span>
      </span>
    </>
  );

  return (
    <li data-outcome={outcome}>
      {match.id ? (
        <Link href={`/matches/${match.id}`} className={styles.resultRow}>
          {body}
        </Link>
      ) : (
        <div className={styles.resultRow}>{body}</div>
      )}
    </li>
  );
}

const ROLE_ORDER: PlayerRole[] = ['BATSMAN', 'WK', 'ALL_ROUNDER', 'BOWLER'];
const ROLE_LABEL: Record<PlayerRole, string> = {
  BATSMAN: 'Batters',
  WK: 'Wicket-keepers',
  ALL_ROUNDER: 'All-rounders',
  BOWLER: 'Bowlers',
};

// A player no source names a discipline for is listed, not filed under a guessed role.
function squadGroups(squad: SquadPlayer[]) {
  return [...ROLE_ORDER, null].map((role) => ({
    role: role ?? 'OTHER',
    label: role ? ROLE_LABEL[role] : 'Squad',
    players: squad
      .filter((p) => p.role === role)
      .sort((a, b) => Number(!!b.isCaptain) - Number(!!a.isCaptain)),
  })).filter((g) => g.players.length);
}

export default async function TeamPage({ params }: { params: { key: string } }) {
  const profile = await loadTeam(params.key);
  if (!profile) notFound();

  const { team, colors, rankings, upcoming, recent, form, squad, squadSeries } = profile;

  // Counted over the strip itself, so the caption describes the pills beside it; N is neither.
  const won = form.filter((f) => f === 'W').length;
  const lost = form.filter((f) => f === 'L').length;
  const hasStrip = rankings.length > 0 || form.length > 0;
  const groups = squadGroups(squad);

  return (
    <div className={styles.page}>
      <div className={styles.back}>
        <BackButton />
      </div>

      <header className={styles.hero}>
        <ColourWash primary={colors.primary} secondary={colors.secondary} />

        <div className={styles.heroMain}>
          <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="xl" className={styles.crest} />
          <div className={styles.heroText}>
            <span className={styles.eyebrow}>{team.shortName}</span>
            <h1 className={styles.title}>{team.name}</h1>
          </div>
          <div className={styles.heroAction}>
            <FollowButton
              kind="teams"
              entity={{ id: team.id, name: team.name, shortName: team.shortName, logo: team.logo }}
            />
          </div>
        </div>

        {hasStrip && (
          <div className={styles.strip}>
            {rankings.map((r) => (
              <Link key={`${r.gender}-${r.format}`} href={rankingsHref(r)} className={styles.cell}>
                <span className={styles.cellLabel}>
                  ICC {r.format}
                  {r.gender === 'WOMEN' && ' · Women'}
                </span>
                <span className={styles.cellValue}>#{r.position}</span>
                <span className={styles.cellSub}>Rating {r.rating}</span>
              </Link>
            ))}
            {form.length > 0 && (
              <div className={`${styles.cell} ${styles.formCell}`}>
                <span className={styles.cellLabel}>Form</span>
                <FormStrip form={form} />
                <span className={styles.cellSub}>
                  {won}–{lost} in last {form.length}
                </span>
              </div>
            )}
          </div>
        )}
      </header>

      {(upcoming.length > 0 || recent.length > 0) && (
        <div className={styles.columns}>
          {upcoming.length > 0 && (
            <TeamUpcoming matches={upcoming} initial={FIXTURES_SHOWN} />
          )}

          {recent.length > 0 && (
            <TeamResults
              rows={recent.map((m) => (
                <ResultRow match={m} teamKey={team.id} key={m.key} />
              ))}
              initial={RESULTS_SHOWN}
            />
          )}
        </div>
      )}

      {groups.length > 0 && (
        <section className={styles.section} aria-labelledby="team-squad">
          <SectionHead
            id="team-squad"
            title="Squad"
            count={squad.length}
            action={squadSeries ? { href: `/series/${squadSeries.id}`, label: squadSeries.name } : undefined}
          />
          <div className={styles.squad}>
            {groups.map((g) => (
              <div key={g.role} className={styles.group}>
                <h3 className={styles.groupTitle}>
                  {g.label}
                  <span className={styles.groupCount}>{g.players.length}</span>
                </h3>
                <ul className={styles.players}>
                  {g.players.map((p) => (
                    <li key={p.id}>
                      <Link href={`/players/${p.id}`} className={styles.player}>
                        <span className={styles.playerName}>{p.name}</span>
                        {p.isCaptain && (
                          <span className={styles.tag} title="Captain">
                            C
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {!upcoming.length && !recent.length && !squad.length && (
        <EmptyState
          icon="calendar"
          title={`Nothing scheduled for ${team.name} right now`}
          action={{ label: 'Browse teams', href: '/teams' }}
          secondary={{ label: 'All fixtures', href: '/fixtures' }}
        />
      )}
    </div>
  );
}
