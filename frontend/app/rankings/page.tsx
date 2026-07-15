import type { RankingEntry } from '@crex/shared';
import { getRankings } from '../../lib/api';
import RankingsView, {
  type RankingsData,
  type Format,
  type Gender,
  type Category,
} from '../../components/rankings/RankingsView';

export const metadata = {
  title: 'ICC Rankings',
  description:
    'Current ICC player rankings — Test, ODI and T20I, for batting, bowling and all-rounder, men and women.',
};

const FORMATS: Format[] = ['test', 'odi', 't20i'];
const GENDERS: Gender[] = ['men', 'women'];
const CATEGORIES: Category[] = ['batting', 'bowling', 'all-rounder'];

// Fetch a single combination, degrading to an empty list so one failing (or
// non-existent, e.g. women's Test) category never blanks the whole page.
const safe = (type: string, gender: string, format: string) =>
  getRankings(type, gender, format).catch(() => [] as RankingEntry[]);

export default async function RankingsPage() {
  const combos = FORMATS.flatMap((f) =>
    GENDERS.flatMap((g) => CATEGORIES.map((c) => ({ f, g, c })))
  );

  const results = await Promise.all(
    combos.map(({ f, g, c }) => safe(c, g, f).then((rows) => ({ f, g, c, rows })))
  );

  // Build data[format][gender][category].
  const data = {} as RankingsData;
  for (const f of FORMATS) {
    data[f] = {} as RankingsData[Format];
    for (const g of GENDERS) data[f][g] = {} as RankingsData[Format][Gender];
  }
  for (const { f, g, c, rows } of results) data[f][g][c] = rows;

  return <RankingsView data={data} />;
}
