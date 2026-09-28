import { getRankings } from '../../lib/rankings';
import { rankedDirectory } from '../../lib/directory';
import TeamsDirectory from './TeamsDirectory';

export const metadata = {
  title: 'Teams',
  description: 'Every ICC-ranked men’s and women’s side — fixtures, results, form and squads.',
};

export const revalidate = 3600;

export default async function TeamsPage() {
  const { teams } = rankedDirectory(await getRankings());
  return (
    <TeamsDirectory
      men={teams.filter((t) => t.gender === 'MEN')}
      women={teams.filter((t) => t.gender === 'WOMEN')}
    />
  );
}
