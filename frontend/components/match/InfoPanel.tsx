import Link from 'next/link';
import type {
  HeadToHead,
  Match,
  MatchConditions,
  MatchEvent,
  MatchSquads,
  PlayerRole,
  SquadPlayer,
  Team,
  TeamFormEntry,
  VenueStats,
} from '@/types';
import LocalTime from '../ui/LocalTime';
import Skeleton, { staggerRows } from '../ui/Skeleton';
import TeamBadge from '../ui/TeamBadge';
import HeadToHeadBlock from './HeadToHead';
import PlayerLink from './PlayerLink';
import { ordinal } from '@/lib/text';
import mc from './matchCenter.module.scss';
import styles from './InfoPanel.module.scss';

const ROLE_LABELS: Record<PlayerRole, string> = {
  BATSMAN: 'Batter',
  BOWLER: 'Bowler',
  ALL_ROUNDER: 'All-rounder',
  WK: 'Keeper',
};

// Batter stays neutral — colouring the majority of the list would say nothing.
const ROLE_CLASS: Record<PlayerRole, string> = {
  BATSMAN: styles.roleBatter,
  BOWLER: styles.roleBowler,
  ALL_ROUNDER: styles.roleAllRounder,
  WK: styles.roleKeeper,
};

const SQUAD_SK_WIDTHS = ['60', '80', '50', '70', '60', '90', '70', '50', '80', '60', '70'] as const;

function FormStrip({ team, form }: { team: Team; form: TeamFormEntry[] }) {
  return (
    <div className={styles.formRow}>
      <span className={styles.formTeam}>
        <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="xs" />
        {team.name}
      </span>
      <span className={styles.formChips}>
        {form.length ? (
          form.map((f) => (
            <span key={f.matchId} className={`${styles.formChip} ${styles[`form${f.result}`]}`} title={`vs ${f.opponent}`}>
              {f.result}
            </span>
          ))
        ) : (
          <span className={styles.muted}>No recent matches</span>
        )}
      </span>
    </div>
  );
}

function SquadColumnSkeleton({ team }: { team: Team }) {
  return (
    <div className={styles.squadCol} role="status" aria-busy="true" aria-label={`Loading ${team.name} squad`}>
      <header className={styles.squadHead}>
        <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="sm" />
        <h3 className={styles.squadTeam}>{team.name}</h3>
      </header>
      <ul className={`${styles.squadList} ${staggerRows}`}>
        {SQUAD_SK_WIDTHS.map((width, i) => (
          <li key={i} className={styles.squadPlayer}>
            <Skeleton variant="body" width={width} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SquadColumn({ team, players }: { team: Team; players: SquadPlayer[] }) {
  if (!players.length) return null;
  return (
    <div className={styles.squadCol}>
      <header className={styles.squadHead}>
        <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="sm" />
        <h3 className={styles.squadTeam}>{team.name}</h3>
        <span className={styles.squadCount}>{players.length}</span>
      </header>
      <ul className={styles.squadList}>
        {players.map((p) => (
          <li key={p.id} className={styles.squadPlayer}>
            <span className={styles.squadName}>
              <PlayerLink id={p.id} name={p.name} />
              {p.isCaptain && (
                <abbr className={styles.captain} title="Captain">
                  C
                </abbr>
              )}
            </span>
            {p.role && <span className={`${styles.role} ${ROLE_CLASS[p.role]}`}>{ROLE_LABELS[p.role]}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// On a multi-day ground the shape of the averages is the fact — "344 first, 159 fourth" is a pitch that turns.
function VenueRecord({ stats }: { stats: VenueStats }) {
  const averages = stats.averages
    .map((avg, i) => ({ label: `${ordinal(i + 1)} inn`, avg }))
    .filter((a): a is { label: string; avg: number } => a.avg !== null && a.avg > 0);
  const top = Math.max(1, ...averages.map((a) => a.avg));

  return (
    <div className={styles.venue}>
      {averages.length > 0 && (
        <dl className={styles.avgs}>
          {averages.map((a) => (
            <div key={a.label} className={styles.avg}>
              <dt>{a.label}</dt>
              <dd>{a.avg}</dd>
              <svg className={styles.avgBar} viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
                <rect x="0" y="0" width={(a.avg / top) * 100} height="4" />
              </svg>
            </div>
          ))}
        </dl>
      )}
      <dl className={mc.details}>
        {stats.matches !== null && (
          <div className={mc.detailRow}>
            <dt>Matches</dt>
            <dd>{stats.matches}</dd>
          </div>
        )}
        {(stats.wonBattingFirst !== null || stats.wonBowlingFirst !== null) && (
          <div className={mc.detailRow}>
            <dt>Won bat / bowl first</dt>
            <dd>
              {stats.wonBattingFirst ?? '—'} / {stats.wonBowlingFirst ?? '—'}
            </dd>
          </div>
        )}
        {stats.highest && (
          <div className={mc.detailRow}>
            <dt>Highest total</dt>
            <dd>{stats.highest}</dd>
          </div>
        )}
        {stats.lowest && (
          <div className={mc.detailRow}>
            <dt>Lowest total</dt>
            <dd>{stats.lowest}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export default function InfoPanel({
  match,
  events,
  squads,
  squadsPending,
  conditions,
  headToHead,
}: {
  match: Match;
  events: MatchEvent[];
  squads: MatchSquads | null;
  squadsPending?: boolean;
  conditions?: MatchConditions | null;
  headToHead?: HeadToHead | null;
}) {
  const details: Array<[string, React.ReactNode]> = [
    ['Date', <LocalTime key="date" iso={match.startTime} format="dayDate" />],
    ['Time', <LocalTime key="time" iso={match.startTime} format="time" />],
    [
      'Venue',
      match.venueId ? (
        <Link href={`/venues/${match.venueId}`} className={mc.detailLink}>
          {match.venue}
        </Link>
      ) : (
        match.venue
      ),
    ],
    ['Format', match.format],
    ...(match.matchNumber ? ([['Match', `${ordinal(match.matchNumber)} of the series`]] as Array<[string, React.ReactNode]>) : []),
    [
      'Series',
      match.series.id ? (
        <Link href={`/series/${match.series.id}`} className={mc.detailLink}>
          {match.series.name}
        </Link>
      ) : (
        match.series.name
      ),
    ],
  ];

  // The feed's toss event survives; the status-code note covers the gap before the first ball.
  const toss = events.find((e) => e.kind === 'TOSS')?.text ?? (match.note?.kind === 'TOSS' ? match.note.label : null);
  if (toss) details.push(['Toss', toss]);

  // "Playing XI" only when both sides actually field eleven.
  const squadsTitle =
    match.status !== 'UPCOMING' && squads && squads.home.length === 11 && squads.away.length === 11 ? 'Playing XI' : 'Squads';

  const officials = conditions?.officials;
  const weather = conditions?.weather;
  const venueStats = conditions?.venue;
  const broadcast = conditions?.broadcast ?? [];

  return (
    <div className={mc.panel}>
      <div className={styles.twoCol}>
        <section className={mc.block}>
          <h2 className={mc.blockTitle}>Match details</h2>
          <dl className={mc.details}>
            {details.map(([label, value]) => (
              <div key={label} className={mc.detailRow}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {weather && (weather.temperature || weather.condition) && (
          <section className={mc.block}>
            <h2 className={mc.blockTitle}>Conditions</h2>
            <div className={`${mc.surface} ${styles.weather}`}>
              {weather.temperature && (
                <p className={styles.weatherNow}>
                  <span className={styles.temp}>{weather.temperature}</span>
                  {weather.condition && <span className={styles.cond}>{weather.condition}</span>}
                </p>
              )}
              <dl className={styles.weatherGrid}>
                {(
                  [
                    ['Rain', weather.rainChance],
                    ['Humidity', weather.humidity ? `${weather.humidity} %` : null],
                    ['Wind', weather.wind?.replace(/^Windspeed:\s*/i, '') ?? null],
                    ['Range', weather.min && weather.max ? `${weather.min} – ${weather.max}` : null],
                  ] as Array<[string, string | null]>
                )
                  .filter(([, v]) => Boolean(v))
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </section>
        )}
      </div>

      {headToHead && (
        <section className={mc.block}>
          <h2 className={mc.blockTitle}>Head to head</h2>
          <HeadToHeadBlock record={headToHead} />
        </section>
      )}

      {match.teamForm && (
        <section className={mc.block}>
          <h2 className={mc.blockTitle}>Form</h2>
          <div className={mc.surface}>
            <FormStrip team={match.homeTeam} form={match.teamForm.home} />
            <FormStrip team={match.awayTeam} form={match.teamForm.away} />
          </div>
        </section>
      )}

      {(squads || squadsPending) && (
        <section className={mc.block}>
          <h2 className={mc.blockTitle}>{squadsTitle}</h2>
          <div className={styles.squads}>
            {squads ? (
              <>
                <SquadColumn team={match.homeTeam} players={squads.home} />
                <SquadColumn team={match.awayTeam} players={squads.away} />
              </>
            ) : (
              <>
                <SquadColumnSkeleton team={match.homeTeam} />
                <SquadColumnSkeleton team={match.awayTeam} />
              </>
            )}
          </div>
        </section>
      )}

      <div className={styles.twoCol}>
        {officials && (
          <section className={mc.block}>
            <h2 className={mc.blockTitle}>Officials</h2>
            <dl className={mc.details}>
              {officials.onField.length > 0 && (
                <div className={mc.detailRow}>
                  <dt>Umpires</dt>
                  <dd>{officials.onField.join(' · ')}</dd>
                </div>
              )}
              {officials.thirdUmpire && (
                <div className={mc.detailRow}>
                  <dt>Third umpire</dt>
                  <dd>{officials.thirdUmpire}</dd>
                </div>
              )}
              {officials.referee && (
                <div className={mc.detailRow}>
                  <dt>Referee</dt>
                  <dd>{officials.referee}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {broadcast.length > 0 && (
          <section className={mc.block}>
            <h2 className={mc.blockTitle}>Where to watch</h2>
            <ul className={styles.broadcast}>
              {broadcast.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {venueStats && (
        <section className={mc.block}>
          <h2 className={mc.blockTitle}>At this ground{venueStats.label ? ` · ${venueStats.label}` : ''}</h2>
          <VenueRecord stats={venueStats} />
        </section>
      )}
    </div>
  );
}
