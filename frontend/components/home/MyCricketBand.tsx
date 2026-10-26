'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Match } from '@/types';
import { followCount, followedMatches, useFollows } from '@/lib/follows';
import MatchTile from '../match/MatchTile';
import TeamBadge from '../ui/TeamBadge';
import Icon from '../ui/Icon';
import { SectionHead } from '../ui/Section';
import styles from './MyCricketBand.module.scss';

/** Shown until the reader follows something; then the band takes over. */
export function FollowPrompt() {
  const follows = useFollows();
  if (followCount(follows) > 0) return null;

  return (
    <aside className={styles.prompt} aria-labelledby="follow-title">
      <span className={styles.promptIcon} aria-hidden="true">
        <Icon name="star" size={22} />
      </span>
      <div className={styles.promptText}>
        <h2 id="follow-title" className={styles.promptTitle}>
          Make it yours
        </h2>
        <p>Follow teams, players and series and they lead the page.</p>
      </div>
      <Link href="/my" className={styles.promptAction}>
        Choose teams
        <Icon name="arrowRight" size={17} />
      </Link>
    </aside>
  );
}

export default function MyCricketBand({ matches }: { matches: Match[] }) {
  const follows = useFollows();
  const any = followCount(follows) > 0;

  const mine = useMemo(() => followedMatches(follows, matches).slice(0, 4), [matches, follows]);

  if (!any) return null;

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
