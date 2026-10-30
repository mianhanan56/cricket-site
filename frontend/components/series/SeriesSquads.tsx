import Link from 'next/link';
import { getApiTeamSquad } from '@/lib/api';
import { squadGroups } from '@/lib/squadGroups';
import { ON_INTENT } from '@/lib/intentPrefetch';
import type { Team } from '@/types';
import TeamBadge from '../ui/TeamBadge';
import EmptyState from '../ui/EmptyState';
import Skeleton, { staggerRows } from '../ui/Skeleton';
import styles from './SeriesSquads.module.scss';

function Picker({ seriesId, teams, selected }: { seriesId: string; teams: Team[]; selected: string }) {
  return (
    <nav className={styles.picker} aria-label="Sides">
      {teams.map((t) => (
        <Link
          key={t.id}
          href={`/series/${seriesId}?tab=squads&team=${t.id}`}
          scroll={false}
          className={`${styles.side} ${t.id === selected ? styles.on : ''}`}
          aria-current={t.id === selected ? 'page' : undefined}
        >
          <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="xs" />
          <span className={styles.sideName}>{t.shortName}</span>
        </Link>
      ))}
    </nav>
  );
}

export function SquadsSkeleton() {
  return (
    <div className={styles.panel} role="status" aria-busy="true" aria-label="Loading squad">
      <div className={styles.group}>
        <ul className={`${styles.players} ${staggerRows}`}>
          {Array.from({ length: 12 }, (_, i) => (
            <li key={i} className={styles.player}>
              <Skeleton variant="body" width={i % 3 ? '70' : '50'} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** One side's squad for the series at a time; the picker swaps sides through the URL. */
export default async function SeriesSquads({
  seriesId,
  teams,
  selected,
}: {
  seriesId: string;
  /** Every side the series lists a squad for. */
  teams: Team[];
  selected: string;
}) {
  const team = teams.find((t) => t.id === selected) ?? teams[0];
  const squad = await getApiTeamSquad(seriesId, team.id).catch(() => []);
  const groups = squadGroups(squad);

  return (
    <div className={styles.wrap}>
      {teams.length > 1 && <Picker seriesId={seriesId} teams={teams} selected={team.id} />}

      {groups.length ? (
        <div className={styles.panel}>
          <header className={styles.head}>
            <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="sm" />
            <Link {...ON_INTENT} href={`/teams/${team.id}`} className={styles.teamName}>
              {team.name}
            </Link>
            <span className={styles.count}>{squad.length} players</span>
          </header>
          {groups.map((g) => (
            <div key={g.role} className={styles.group}>
              <h3 className={styles.groupTitle}>
                {g.label}
                <span className={styles.groupCount}>{g.players.length}</span>
              </h3>
              <ul className={styles.players}>
                {g.players.map((p) => (
                  <li key={p.id}>
                    <Link {...ON_INTENT} href={`/players/${p.id}`} className={styles.player}>
                      <span className={styles.playerName}>{p.name}</span>
                      {p.isCaptain && (
                        <abbr className={styles.tag} title="Captain">
                          C
                        </abbr>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="teams" title={`No squad listed for ${team.name}`} />
      )}
    </div>
  );
}
