import { getRankings } from '@/lib/rankings';
import { rankedDirectory } from '@/lib/directory';
import { PageHeader } from '@/components/ui/Section';
import EmptyState from '@/components/ui/EmptyState';
import PlayersDirectory, { type DirectoryRow } from '@/components/player/PlayersDirectory';
import styles from './players.module.scss';

export const revalidate = 3600;

export const metadata = {
  title: 'Players — ICC Ranked Batters, Bowlers & All-rounders',
  description: 'Every player on a current ICC ranking list, by discipline, with their best position and rating.',
};

export default async function PlayersPage() {
  const { players, teams } = rankedDirectory(await getRankings());
  const crestByName = new Map(teams.map((t) => [t.name, t]));

  const rows: DirectoryRow[] = players.map((p) => {
    const team = crestByName.get(p.country);
    return {
      id: p.id,
      name: p.name,
      country: p.country,
      gender: p.gender,
      role: p.best.role,
      position: p.best.position,
      format: p.best.format,
      rating: p.best.rating,
      roles: p.roles,
      crest: team ? { shortName: team.shortName, logo: team.logo } : null,
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
