'use client';

import { useMemo, useState } from 'react';
import type { PlayerFormEntry } from '@/types';
import { formatInZone, SERVER_ZONE } from '@/lib/datetime';
import Segmented from '../ui/Segmented';
import { FormBars, FormRow, MoreToggle, StatTiles, tierOf, type Discipline, type FormColumn } from './FormCard';
import { useFormDiscipline } from './FormTabs';
import styles from './FormCard.module.scss';

interface Innings {
  entry: PlayerFormEntry;
  /** Runs batting, wickets bowling — what the bar measures. */
  lead: number;
  /** Balls faced batting, runs conceded bowling. */
  second: number | null;
  label: string;
  opponent: string;
}

// The upstream writes "22 (34)" batting and "3-41" bowling, the player's side first in "ENG vs PAK".
function read(entry: PlayerFormEntry, discipline: Discipline): Innings {
  const m = discipline === 'batting' ? /^(\d+)\s*\((\d+)\)/.exec(entry.figures) : /^(\d+)-(\d+)/.exec(entry.figures);
  const lead = m ? Number(m[1]) : Number.parseInt(entry.figures, 10) || 0;
  return {
    entry,
    lead,
    second: m ? Number(m[2]) : null,
    label: discipline === 'batting' ? `${lead}${entry.notOut ? '*' : ''}` : (m ? `${m[1]}-${m[2]}` : entry.figures),
    opponent: entry.fixture.split(/\s+vs?\s+/i)[1] ?? entry.fixture,
  };
}

function summary(list: Innings[], discipline: Discipline): Array<[string, string]> {
  const sum = (pick: (i: Innings) => number) => list.reduce((n, i) => n + pick(i), 0);
  if (discipline === 'batting') {
    const runs = sum((i) => i.lead);
    const outs = list.filter((i) => !i.entry.notOut).length;
    const balls = sum((i) => i.second ?? 0);
    const best = [...list].sort((a, b) => b.lead - a.lead || Number(b.entry.notOut) - Number(a.entry.notOut))[0];
    return [
      ['Runs', String(runs)],
      ['Average', outs ? (runs / outs).toFixed(2) : '—'],
      ['Strike rate', balls ? ((runs / balls) * 100).toFixed(1) : '—'],
      ['Best', best ? best.label : '—'],
    ];
  }
  const wickets = sum((i) => i.lead);
  const conceded = sum((i) => i.second ?? 0);
  const best = [...list].sort((a, b) => b.lead - a.lead || (a.second ?? 0) - (b.second ?? 0))[0];
  return [
    ['Wickets', String(wickets)],
    ['Average', wickets ? (conceded / wickets).toFixed(2) : '—'],
    ['Best', best ? best.label : '—'],
    ['3+ wickets', String(list.filter((i) => i.lead >= 3).length)],
  ];
}

function column(i: Innings, n: number): FormColumn {
  const { entry } = i;
  return {
    key: `${entry.matchId}-${n}`,
    bars: [{ lead: i.lead, label: i.label }],
    caption: i.opponent,
    title: `${entry.figures}${entry.notOut ? ' not out' : ''}, ${entry.fixture}${entry.format ? `, ${entry.format}` : ''}`,
    href: entry.matchId ? `/matches/${entry.matchId}` : null,
  };
}

/** The last innings with bat or ball: the numbers, the shape, and the matches on request. */
export default function RecentForm({
  batting,
  bowling,
  lead,
}: {
  batting: PlayerFormEntry[];
  bowling: PlayerFormEntry[];
  lead: Discipline;
}) {
  const offered: Discipline[] = [batting.length ? 'batting' : null, bowling.length ? 'bowling' : null].filter(
    (d): d is Discipline => d !== null
  );
  const [chosen, choose] = useFormDiscipline(lead);
  const picked = offered.includes(chosen) ? chosen : offered[0];
  const [open, setOpen] = useState(false);

  const entries = picked === 'batting' ? batting : bowling;
  // The upstream sends newest first; the chart reads left to right in time.
  const chrono = useMemo(() => [...entries].reverse().map((e) => read(e, picked)), [entries, picked]);
  const stats = useMemo(() => summary(chrono, picked), [chrono, picked]);
  const average = picked === 'batting' ? Number.parseFloat(stats[1][1]) : NaN;

  if (!offered.length) return null;

  return (
    <div className={styles.card}>
      {offered.length > 1 && (
        <div className={styles.switch}>
          <Segmented
            label="Discipline"
            value={picked}
            options={[
              { value: 'batting', label: 'Batting', count: batting.length },
              { value: 'bowling', label: 'Bowling', count: bowling.length },
            ]}
            onChange={(d) => {
              choose(d);
              setOpen(false);
            }}
          />
        </div>
      )}

      <StatTiles stats={stats} />

      <FormBars
        columns={chrono.map(column)}
        discipline={picked}
        average={Number.isFinite(average) ? average : null}
      />

      <MoreToggle open={open} count={entries.length} onToggle={() => setOpen((o) => !o)} />

      {open && (
        <ol className={styles.list}>
          {entries.map((e, n) => (
            <FormRow
              key={`${e.matchId}-${n}`}
              href={e.matchId ? `/matches/${e.matchId}` : null}
              fig={`${e.figures}${e.notOut ? '*' : ''}`}
              tier={tierOf(read(e, picked).lead, picked)}
              title={e.fixture}
              sub={e.date ? formatInZone(e.date, 'date', SERVER_ZONE) : ''}
              aside={e.format && <span className={styles.format}>{e.format}</span>}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
