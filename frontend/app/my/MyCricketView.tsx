'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Match, TeamCrest } from '@/types';
import { useApiMatches } from '@/hooks/useApiMatches';
import { followCount, isFollowedMatch, toggleFollow, useFollows, type Follows } from '@/lib/follows';
import { loadRemoteIndex, type RemoteIndex } from '@/lib/searchIndex';
import { PageHeader, SectionHead } from '@/components/ui/Section';
import MatchTile from '@/components/match/MatchTile';
import TeamBadge from '@/components/ui/TeamBadge';
import FollowButton from '@/components/follow/FollowButton';
import FollowAlertsPanel from '@/components/follow/FollowAlertsPanel';
import { askOnFollow } from '@/components/automations/useNotificationPermission';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { BoardSkeleton } from '@/components/home/HomeSkeleton';
import Icon from '@/components/ui/Icon';
import styles from './my.module.scss';

const RANK: Record<Match['status'], number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };
const PICKER_ID = 'add-teams';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>{title}</h3>
      <ul className={styles.rows}>{children}</ul>
    </div>
  );
}

/** Everything followed in one card, grouped by kind; empty kinds stay out of the way. */
function FollowingPanel({ follows }: { follows: Follows }) {
  return (
    <section className={styles.following} aria-labelledby="following">
      <h2 className={styles.panelTitle} id="following">
        Following
        <span className={styles.panelCount}>{followCount(follows)}</span>
      </h2>

      {follows.teams.length > 0 && (
        <Group title="Teams">
          {follows.teams.map((t) => (
            <li key={t.id} className={styles.row}>
              <Link href={`/teams/${t.id}`} className={styles.rowLink}>
                <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="sm" />
                <span className={styles.rowName}>{t.name}</span>
              </Link>
              <FollowButton kind="teams" compact entity={t} />
            </li>
          ))}
        </Group>
      )}
      {follows.series.length > 0 && (
        <Group title="Series">
          {follows.series.map((s) => (
            <li key={s.id} className={styles.row}>
              <Link href={`/series/${s.id}`} className={styles.rowLink}>
                <span className={styles.mark} aria-hidden="true">
                  <Icon name="trophy" size={15} />
                </span>
                <span className={styles.rowName}>{s.name}</span>
              </Link>
              <FollowButton kind="series" compact entity={s} />
            </li>
          ))}
        </Group>
      )}
      {follows.players.length > 0 && (
        <Group title="Players">
          {follows.players.map((p) => (
            <li key={p.id} className={styles.row}>
              <Link href={`/players/${p.id}`} className={styles.rowLink}>
                <span className={styles.mark} aria-hidden="true">
                  {p.name.slice(0, 1)}
                </span>
                <span className={styles.rowName}>{p.name}</span>
              </Link>
              <FollowButton kind="players" compact entity={p} />
            </li>
          ))}
        </Group>
      )}

      <div className={styles.add}>
        <a href={`#${PICKER_ID}`} className={styles.addBtn}>
          <Icon name="plus" size={15} />
          Teams
        </a>
        <Link href="/players" className={styles.addBtn}>
          <Icon name="plus" size={15} />
          Players
        </Link>
        <Link href="/series" className={styles.addBtn}>
          <Icon name="plus" size={15} />
          Series
        </Link>
      </div>
    </section>
  );
}

export default function MyCricketView() {
  const follows = useFollows();
  const { matches, isLoading } = useApiMatches({ intervalMs: 15_000 });
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
    const seen = new Map<string, TeamCrest>();
    for (const t of index?.teams ?? []) seen.set(t.id, t);
    for (const m of matches) for (const t of [m.homeTeam, m.awayTeam]) if (t.id && !seen.has(t.id)) seen.set(t.id, { id: t.id, name: t.name, shortName: t.shortName, logo: t.logo ?? null });
    return [...seen.values()].filter((t) => !follows.teams.some((f) => f.id === t.id)).slice(0, total ? 12 : 24);
  }, [index, matches, follows.teams, total]);

  const follow = (t: TeamCrest) => {
    toggleFollow('teams', t);
    askOnFollow();
  };

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="My Cricket" title="Your cricket" />

      {total > 0 && (
        <div className={styles.layout}>
          <section className={styles.main} aria-labelledby="your-matches">
            <SectionHead title="Your matches" id="your-matches" count={mine.length} />
            {isLoading && !matches.length ? (
              <BoardSkeleton />
            ) : mine.length ? (
              <div className={styles.grid}>
                {mine.slice(0, 8).map((m) => (
                  <MatchTile key={m.id} match={m} />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon="calendar"
                title="No matches from what you follow right now"
                action={{ label: 'All fixtures', href: '/fixtures' }}
              />
            )}
          </section>

          <aside className={styles.side}>
            <FollowingPanel follows={follows} />
            <FollowAlertsPanel />
          </aside>
        </div>
      )}

      <section className={styles.picker} id={PICKER_ID} aria-labelledby="pick-teams" data-alone={!total || undefined}>
        <SectionHead title={total ? 'Add teams' : 'Pick your teams'} id="pick-teams" level={total ? 3 : 2} />
        {suggestions.length ? (
          <ul className={styles.picks}>
            {suggestions.map((t) => (
              <li key={t.id}>
                <button type="button" className={styles.pick} onClick={() => follow(t)} aria-label={`Follow ${t.name}`}>
                  <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="md" />
                  <span className={styles.pickName}>{t.name}</span>
                  <Icon name="plus" size={16} className={styles.pickPlus} />
                </button>
              </li>
            ))}
          </ul>
        ) : isLoading && !matches.length ? (
          <ul className={styles.picks} aria-busy="true" aria-label="Loading teams">
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
