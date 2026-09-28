'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Match } from '@/types';
import { useCrexMatches } from '@/hooks/useCrexMatches';
import { followCount, isFollowedMatch, toggleFollow, useFollows } from '@/lib/follows';
import { addAutomation, describeAutomation, useAutomations, type Automation } from '@/lib/automations';
import { loadRemoteIndex, type RemoteIndex } from '@/lib/searchIndex';
import { PageHeader, SectionHead } from '@/components/ui/Section';
import MatchTile from '@/components/match/MatchTile';
import TeamBadge from '@/components/ui/TeamBadge';
import FollowButton from '@/components/follow/FollowButton';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { BoardSkeleton } from '@/components/home/HomeSkeleton';
import Icon from '@/components/ui/Icon';
import styles from './my.module.scss';

const RANK: Record<Match['status'], number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };

const TEAM_ALERTS: Array<Pick<Automation, 'trigger' | 'scope'>> = [
  { trigger: 'MATCH_START', scope: { kind: 'FOLLOWED' } },
  { trigger: 'WICKET', scope: { kind: 'FOLLOWED' } },
  { trigger: 'CLOSE_CHASE', scope: { kind: 'FOLLOWED' } },
  { trigger: 'RESULT', scope: { kind: 'FOLLOWED' } },
];

export default function MyCricketView() {
  const follows = useFollows();
  const automations = useAutomations();
  const { matches, isLoading } = useCrexMatches({ intervalMs: 15_000 });
  const [index, setIndex] = useState<RemoteIndex | null>(null);
  useEffect(() => {
    loadRemoteIndex().then(setIndex);
  }, []);

  const total = followCount(follows);

  const mine = useMemo(
    () =>
      matches
        .filter((m) => isFollowedMatch(follows, m))
        .sort(
          (a, b) =>
            RANK[a.status] - RANK[b.status] ||
            (a.status === 'UPCOMING'
              ? +new Date(a.startTime) - +new Date(b.startTime)
              : +new Date(b.startTime) - +new Date(a.startTime))
        ),
    [matches, follows]
  );

  // Sides worth offering: the ranked internationals first, then whoever is in the feed.
  const suggestions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; shortName: string; logo: string | null }>();
    for (const t of index?.teams ?? []) seen.set(t.id, t);
    for (const m of matches) for (const t of [m.homeTeam, m.awayTeam]) if (t.id && !seen.has(t.id)) seen.set(t.id, { id: t.id, name: t.name, shortName: t.shortName, logo: t.logo ?? null });
    return [...seen.values()].filter((t) => !follows.teams.some((f) => f.id === t.id)).slice(0, total ? 12 : 24);
  }, [index, matches, follows.teams, total]);

  const missingAlerts = TEAM_ALERTS.filter(
    (t) => !automations.some((a) => a.trigger === t.trigger && a.scope.kind === 'FOLLOWED')
  );

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="My Cricket"
        title="Your cricket"
        aside={
          total > 0 ? (
            <div className={styles.counts}>
              <span>
                <strong>{follows.teams.length}</strong> teams
              </span>
              <span>
                <strong>{follows.players.length}</strong> players
              </span>
              <span>
                <strong>{follows.series.length}</strong> series
              </span>
            </div>
          ) : undefined
        }
      />

      {total > 0 && (
        <section className={styles.section}>
          <SectionHead title="Your matches" count={mine.length} />
          {isLoading && !matches.length ? (
            <BoardSkeleton />
          ) : mine.length ? (
            <div className={styles.grid}>
              {mine.slice(0, 9).map((m) => (
                <MatchTile key={m.id} match={m} />
              ))}
            </div>
          ) : (
            <EmptyState compact icon="calendar" title="Nothing from your teams in the feed right now" action={{ label: 'All fixtures', href: '/fixtures' }} />
          )}
        </section>
      )}

      {total > 0 && (
        <div className={styles.columns}>
          <section>
            <SectionHead title="Teams" count={follows.teams.length} level={3} />
            {follows.teams.length ? (
              <ul className={styles.list}>
                {follows.teams.map((t) => (
                  <li key={t.id} className={styles.row}>
                    <Link href={`/teams/${t.id}`} className={styles.rowLink}>
                      <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="sm" />
                      <span className={styles.rowName}>{t.name}</span>
                    </Link>
                    <FollowButton kind="teams" compact entity={t} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.quiet}>Follow a team from its page or below.</p>
            )}
          </section>
          <section>
            <SectionHead title="Players" count={follows.players.length} level={3} action={{ href: '/players', label: 'Find players' }} />
            {follows.players.length ? (
              <ul className={styles.list}>
                {follows.players.map((p) => (
                  <li key={p.id} className={styles.row}>
                    <Link href={`/players/${p.id}`} className={styles.rowLink}>
                      <span className={styles.initial}>{p.name.slice(0, 1)}</span>
                      <span className={styles.rowName}>{p.name}</span>
                    </Link>
                    <FollowButton kind="players" compact entity={p} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.quiet}>Star a player on their profile to keep them here.</p>
            )}
          </section>
          <section>
            <SectionHead title="Series" count={follows.series.length} level={3} action={{ href: '/series', label: 'Browse series' }} />
            {follows.series.length ? (
              <ul className={styles.list}>
                {follows.series.map((s) => (
                  <li key={s.id} className={styles.row}>
                    <Link href={`/series/${s.id}`} className={styles.rowLink}>
                      <Icon name="trophy" size={18} />
                      <span className={styles.rowName}>{s.name}</span>
                    </Link>
                    <FollowButton kind="series" compact entity={s} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.quiet}>Star a competition on its page to follow it.</p>
            )}
          </section>
        </div>
      )}

      {total > 0 && missingAlerts.length > 0 && (
        <section className={styles.section}>
          <SectionHead title="Alerts for your teams" level={3} action={{ href: '/automations', label: 'All alerts' }} />
          <ul className={styles.alerts}>
            {missingAlerts.map((t) => (
              <li key={t.trigger}>
                <button type="button" className={styles.alert} onClick={() => addAutomation({ ...t, action: { inApp: true, system: false } })}>
                  <Icon name="bolt" size={16} />
                  {describeAutomation(t)}
                  <Icon name="plus" size={16} className={styles.alertPlus} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <SectionHead title={total ? 'Add teams' : 'Pick your teams'} level={total ? 3 : 2} />
        {suggestions.length ? (
          <ul className={styles.picker}>
            {suggestions.map((t) => (
              <li key={t.id}>
                <button type="button" className={styles.pick} onClick={() => toggleFollow('teams', t)} aria-label={`Follow ${t.name}`}>
                  <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="md" />
                  <span className={styles.pickName}>{t.name}</span>
                  <Icon name="plus" size={16} className={styles.pickPlus} />
                </button>
              </li>
            ))}
          </ul>
        ) : isLoading && !matches.length ? (
          <ul className={styles.picker} aria-busy="true" aria-label="Loading teams">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i}>
                <Skeleton className={styles.pick} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.quiet}>You follow every team playing right now.</p>
        )}
      </section>
    </div>
  );
}
