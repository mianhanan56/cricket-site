import type { Fixture } from './api';

// The fixtures page hands ~500 rows to the client; each team and series is sent once, not per row.
type PackedRow = Omit<Fixture, 'homeTeam' | 'awayTeam' | 'series'> & { h: number; a: number; s: number };

export interface PackedFixtures {
  teams: Fixture['homeTeam'][];
  series: Fixture['series'][];
  rows: PackedRow[];
}

export function packFixtures(fixtures: Fixture[]): PackedFixtures {
  const teams: Fixture['homeTeam'][] = [];
  const series: Fixture['series'][] = [];
  // Keyed by the whole value, not the id: a placeholder side ("Winner SF1") can share an id with another.
  const slots = new Map<string, number>();
  const slot = <T,>(list: T[], value: T, kind: string): number => {
    const key = `${kind}${JSON.stringify(value)}`;
    let i = slots.get(key);
    if (i === undefined) {
      i = list.push(value) - 1;
      slots.set(key, i);
    }
    return i;
  };

  const rows = fixtures.map(({ homeTeam, awayTeam, series: s, ...rest }) => ({
    ...rest,
    h: slot(teams, homeTeam, 't'),
    a: slot(teams, awayTeam, 't'),
    s: slot(series, s, 's'),
  }));
  return { teams, series, rows };
}

export function unpackFixtures({ teams, series, rows }: PackedFixtures): Fixture[] {
  return rows.map(({ h, a, s, ...rest }) => ({ ...rest, homeTeam: teams[h], awayTeam: teams[a], series: series[s] }));
}
