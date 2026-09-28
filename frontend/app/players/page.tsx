import { getRankings } from '@/lib/rankings';
import { rankedDirectory } from '@/lib/directory';
import { rankingsByPlayer, type DirectoryRow } from '@/lib/playersDirectory';
import { pickParam } from '@/lib/queryParams';
import {
  PLAYERS_FORMAT_KEYS,
  PLAYERS_ROLE_KEYS,
  RANKINGS_GENDER_KEYS,
  type PlayersFormatKey,
  type PlayersRoleKey,
  type RankingsGender,
} from '@/lib/tabs';
import { PageHeader } from '@/components/ui/Section';
import EmptyState from '@/components/ui/EmptyState';
import PlayersDirectory from '@/components/player/PlayersDirectory';
import styles from './players.module.scss';

export const revalidate = 3600;

export const metadata = {
  title: 'Players — ICC Ranked Batters, Bowlers & All-rounders',
  description: 'Every player on a current ICC ranking list, by discipline and format, with position and rating.',
};

export default async function PlayersPage({
  searchParams,
}: {
  // Read here rather than with useSearchParams() so the filtered list stays in the HTML.
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const gender = pickParam<RankingsGender>(searchParams?.gender, RANKINGS_GENDER_KEYS, 'men');
  const role = pickParam<PlayersRoleKey>(searchParams?.role, PLAYERS_ROLE_KEYS, 'all');
  const requested = pickParam<PlayersFormatKey>(searchParams?.format, PLAYERS_FORMAT_KEYS, 'all');
  // The ICC publishes no Women's Test rankings.
  const format: PlayersFormatKey = gender === 'women' && requested === 'test' ? 'all' : requested;

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
        <PlayersDirectory rows={rows} initial={{ gender, role, format }} />
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
