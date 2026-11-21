import { pageMeta } from '@/lib/seo';
import { getRankings } from '@/lib/rankings';
import { rankedDirectory } from '@/lib/directory';
import { rankingsByPlayer, type DirectoryRow } from '@/lib/playersDirectory';
import { PageHeader } from '@/components/ui/Section';
import EmptyState from '@/components/ui/EmptyState';
import PlayersDirectory from '@/components/player/PlayersDirectory';
import styles from './players.module.scss';

export const revalidate = 3600;

export const metadata = pageMeta({
  title: 'Players — ICC Ranked Batters, Bowlers & All-rounders',
  description: 'Every player on a current ICC ranking list, by discipline and format, with position and rating.',
  path: '/players',
});

// Static: filters are read from the URL in the browser (PlayersDirectory).
export default async function PlayersPage() {
  const rankings = await getRankings();
  const { players, teams } = rankedDirectory(rankings);
  const entries = rankingsByPlayer(rankings.data);
  const crestByName = new Map(teams.map((t) => [t.name, t]));

  const rows: DirectoryRow[] = players.map((p) => {
    const team = crestByName.get(p.country);
    return {
      id: p.id,
      name: p.name,
      country: p.country,
      gender: p.gender,
      crest: team ? { shortName: team.shortName, logo: team.logo } : null,
      rankings: entries.get(p.id) ?? [],
    };
  });

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Players" title="Ranked players" />
      {rows.length ? (
        <PlayersDirectory rows={rows} />
      ) : (
        <EmptyState
          icon="player"
          title="Rankings are unavailable right now"
          action={{ label: 'Open rankings', href: '/rankings' }}
        />
      )}
    </div>
  );
}
