'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Match } from '@/types';
import { isFollowedMatch, useFollows } from '@/lib/follows';
import MatchTile from '../match/MatchTile';
import TeamBadge from '../ui/TeamBadge';
import Icon from '../ui/Icon';
import { SectionHead } from '../ui/Section';
import styles from './MyCricketBand.module.scss';

const RANK: Record<Match['status'], number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };

export default function MyCricketBand({ matches }: { matches: Match[] }) {
  const follows = useFollows();
  const any = follows.teams.length + follows.series.length + follows.players.length > 0;

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
        )
        .slice(0, 4),
    [matches, follows]
  );

  if (!any) {
    return (
      <aside className={styles.prompt}>
        <span className={styles.promptIcon} aria-hidden="true">
          <Icon name="star" size={18} />
        </span>
        <p className={styles.promptText}>
          <strong>Make it yours.</strong> Follow teams, players and series and they lead the page.
        </p>
        <Link href="/my" className={styles.promptAction}>
          Choose teams
        </Link>
      </aside>
    );
  }

  return (
    <section className={styles.band} aria-labelledby="mine-title">
      <SectionHead title="Your cricket" id="mine-title" action={{ href: '/my', label: 'My Cricket' }}>
        <ul className={styles.chips}>
          {follows.teams.slice(0, 6).map((t) => (
            <li key={t.id}>
              <Link href={`/teams/${t.id}`} className={styles.chip}>
                <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="xs" />
                {t.shortName}
              </Link>
            </li>
          ))}
        </ul>
      </SectionHead>
      {mine.length ? (
        <div className={styles.grid}>
          {mine.map((m) => (
            <MatchTile key={m.id} match={m} />
          ))}
        </div>
      ) : (
        <p className={styles.quiet}>Nothing from your teams in the feed right now.</p>
      )}
    </section>
  );
}
