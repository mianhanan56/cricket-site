import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Player, Match } from '@crex/shared';
import { getPlayer, getMatches } from '../../../lib/api';
import PlayerStatsTabs from '../../../components/player/PlayerStatsTabs';
import styles from './player.module.scss';

const ROLE_LABEL: Record<string, string> = {
  BATSMAN: 'Batsman',
  BOWLER: 'Bowler',
  ALL_ROUNDER: 'All-rounder',
  WK: 'Wicket-keeper',
};

// Minimal country → flag emoji map (extend as needed).
const FLAGS: Record<string, string> = {
  India: '🇮🇳',
  Australia: '🇦🇺',
  Pakistan: '🇵🇰',
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'New Zealand': '🇳🇿',
  'South Africa': '🇿🇦',
};

export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const p = await getPlayer(params.id);
    return {
      title: `${p.name} — Profile & Stats`,
      description: `${p.name} (${p.country}) career batting and bowling statistics.`,
    };
  } catch {
    return { title: 'Player' };
  }
}

export default async function PlayerPage({ params }: { params: { id: string } }) {
  let player: Player;
  try {
    player = await getPlayer(params.id);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  // Recent matches involving the player's country (no direct player↔match link
  // in the schema, so we approximate by team country).
  let recent: Match[] = [];
  try {
    const all = await getMatches();
    recent = all
      .filter((m) => m.homeTeam.country === player.country || m.awayTeam.country === player.country)
      .slice(0, 5);
  } catch {
    /* best-effort */
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.avatar}>
          {player.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.photo} alt={player.name} />
          ) : (
            <span>{player.name.charAt(0)}</span>
          )}
        </div>
        <div className={styles.heroInfo}>
          <span className={styles.flag}>{FLAGS[player.country] ?? '🏏'} {player.country}</span>
          <h1 className={styles.name}>{player.name}</h1>
          <div className={styles.badges}>
            <span className={styles.roleBadge}>{ROLE_LABEL[player.role] ?? player.role}</span>
            {player.battingStyle && <span className={styles.styleBadge}>{player.battingStyle}</span>}
            {player.bowlingStyle && <span className={styles.styleBadge}>{player.bowlingStyle}</span>}
          </div>
        </div>
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Career Stats</h2>
        <PlayerStatsTabs stats={player.stats ?? {}} />
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Recent Matches</h2>
        {recent.length ? (
          <ul className={styles.matchList}>
            {recent.map((m) => (
              <li key={m.id}>
                <Link href={`/matches/${m.id}`} className={styles.matchItem}>
                  <span className={styles.matchTeams}>
                    {m.homeTeam.shortName} vs {m.awayTeam.shortName}
                  </span>
                  <span className={styles.matchMeta}>
                    {m.format} · {m.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No recent matches.</p>
        )}
      </section>
    </div>
  );
}
