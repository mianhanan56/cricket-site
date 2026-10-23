'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  PlayerDiscipline,
  PlayerRoleLabel,
  PlayerSeriesFormatRecord,
  PlayerSeriesInnings,
  PlayerSeriesPage,
} from '@/types';
import { getApiPlayerSeriesPage } from '@/lib/api';
import { SERVER_ZONE, formatInZone } from '@/lib/datetime';
import { oversFrom } from '@/lib/overs';
import {
  battingSummary,
  bowlingSummary,
  defaultSeries,
  extendLists,
  firstLists,
  isMultiInnings,
  isSeriesFormatKey,
  limitingDiscipline,
  listsCovering,
  mergeLists,
  seriesFormatCode,
  seriesFormatOptions,
  type PageFetcher,
  type PlayerSeries,
  type SeriesFormatKey,
  type SeriesLists,
} from '@/lib/playerSeries';
import Segmented from '../ui/Segmented';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Icon from '../ui/Icon';
import SeriesPicker, { type SeriesOption } from './SeriesPicker';
import { FormBars, FormCardSkeleton, FormRow, MoreToggle, StatTiles, tierOf, type FormColumn } from './FormCard';
import { useFormDiscipline } from './FormTabs';
import form from './FormCard.module.scss';
import styles from './SeriesPerformance.module.scss';

// One request per page for the life of the tab, however often a format is revisited.
const pages = new Map<string, Promise<PlayerSeriesPage>>();

function pageFetcher(playerId: string, format: SeriesFormatKey): PageFetcher {
  return (discipline, page) => {
    const key = `${playerId}|${format}|${discipline}|${page}`;
    let request = pages.get(key);
    if (!request) {
      request = getApiPlayerSeriesPage(playerId, {
        format: seriesFormatCode(format),
        discipline,
        page,
      });
      request.catch(() => pages.delete(key));
      pages.set(key, request);
    }
    return request;
  };
}

/** Older pages read to find a series named in the URL. */
const URL_SEARCH_PAGES = 8;

// Calendar months in a fixed zone, so the server render and hydration agree.
const monthYear = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: SERVER_ZONE,
  }).format(new Date(iso));

function optionMeta(s: PlayerSeries): string {
  const months = s.start && s.end ? [monthYear(s.start), monthYear(s.end)] : [];
  const span = months.length ? (months[0] === months[1] ? months[0] : `${months[0]} – ${months[1]}`) : '';
  const formats = [...new Set([...s.batting, ...s.bowling].map((f) => f.label))].join(', ');
  return [s.team, span, formats].filter(Boolean).join(' · ');
}

function writeUrl(format: SeriesFormatKey, series: string | null) {
  const url = new URL(window.location.href);
  if (format === 'all') url.searchParams.delete('format');
  else url.searchParams.set('format', format);
  if (series) url.searchParams.set('series', series);
  else url.searchParams.delete('series');
  window.history.replaceState(null, '', url);
}

// ---------------------------------------------------------------- Pieces

const rate = (n: number | null) => (n === null ? '—' : n.toFixed(2));
const lead = (inn: PlayerSeriesInnings, d: PlayerDiscipline) => (d === 'batting' ? inn.runs : inn.wickets);
const figure = (inn: PlayerSeriesInnings, d: PlayerDiscipline) =>
  d === 'batting' ? `${inn.runs}${inn.notOut ? '*' : ''}` : `${inn.wickets}-${inn.runs}`;

function workload(inn: PlayerSeriesInnings, d: PlayerDiscipline, format: PlayerSeriesFormatRecord): string {
  if (d === 'batting') return `(${inn.balls})`;
  return format.code === 5 ? `${inn.balls} b` : `${oversFrom(inn.balls)} ov`;
}

function spoken(inn: PlayerSeriesInnings, d: PlayerDiscipline, format: PlayerSeriesFormatRecord): string {
  if (d === 'batting') return `${inn.runs}${inn.notOut ? ' not out' : ''} off ${inn.balls}`;
  return `${inn.wickets} for ${inn.runs}${format.code === 5 ? ` off ${inn.balls} balls` : ` in ${oversFrom(inn.balls)} overs`}`;
}

function inningsName(inn: PlayerSeriesInnings, format: PlayerSeriesFormatRecord): string {
  if (!isMultiInnings(format)) return inn.matchLabel;
  return `${inn.matchLabel} · ${inn.inningsOfMatch === 2 ? '2nd' : '1st'} inns`;
}

/** A column per match, both innings of a Test side by side. */
function columnsOf(format: PlayerSeriesFormatRecord, d: PlayerDiscipline): FormColumn[] {
  const matches: PlayerSeriesInnings[][] = [];
  for (const inn of format.innings) {
    const last = matches[matches.length - 1];
    if (last && inn.matchId && last[0].matchId === inn.matchId && last.length < 2) last.push(inn);
    else matches.push([inn]);
  }
  // A tour plays one side throughout, so its matches are told apart by name; a tournament by opponent.
  const byOpponent = new Set(format.innings.map((i) => i.opponent)).size > 1;
  return matches.map((innings, n) => {
    const [first] = innings;
    const name = [first.matchLabel, first.opponent && `vs ${first.opponent}`].filter(Boolean).join(' ');
    return {
      key: `${first.matchId ?? 'm'}-${n}`,
      bars: innings.map((i) => ({ lead: lead(i, d), label: figure(i, d) })),
      caption: byOpponent ? (first.opponent ?? first.matchLabel) : first.matchLabel,
      title: `${name}: ${innings.map((i) => spoken(i, d, format)).join(', ')}`,
      href: first.matchId ? `/matches/${first.matchId}` : null,
    };
  });
}

function FormatRecord({ format, discipline }: { format: PlayerSeriesFormatRecord; discipline: PlayerDiscipline }) {
  if (discipline === 'batting') {
    const s = battingSummary(format.innings);
    return (
      <>
        <StatTiles
          stats={[
            ['Runs', s.runs],
            ['Average', rate(s.average)],
            ['Strike rate', rate(s.strikeRate)],
            ['Highest', s.highest],
          ]}
        />
        <FormBars columns={columnsOf(format, 'batting')} discipline="batting" average={s.average} />
      </>
    );
  }
  const s = bowlingSummary(format.innings, format.code);
  return (
    <>
      <StatTiles
        stats={[
          ['Wickets', s.wickets],
          ['Economy', rate(s.economy)],
          ['Average', rate(s.average)],
          ['Best', s.best ?? '—'],
        ]}
      />
      <FormBars columns={columnsOf(format, 'bowling')} discipline="bowling" />
    </>
  );
}

function SeriesRecord({
  series,
  discipline,
  onDiscipline,
  busy,
}: {
  series: PlayerSeries;
  discipline: PlayerDiscipline;
  onDiscipline: (d: PlayerDiscipline) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const offered = (['batting', 'bowling'] as const).filter((d) => series[d].length > 0);
  const shown = offered.includes(discipline) ? discipline : offered[0];
  const formats = shown ? series[shown] : [];
  const innings = formats.flatMap((f) => f.innings.map((inn) => ({ inn, format: f })));
  const count = (d: PlayerDiscipline) => series[d].reduce((n, f) => n + f.innings.length, 0);
  const showFormat = formats.length > 1;

  return (
    <article className={`${form.card} ${styles.record}`} aria-busy={busy || undefined} data-busy={busy || undefined}>
      {offered.length > 1 && (
        <div className={form.switch}>
          <Segmented
            label="Discipline"
            value={shown}
            options={offered.map((d) => ({ value: d, label: d === 'batting' ? 'Batting' : 'Bowling', count: count(d) }))}
            onChange={(d) => {
              onDiscipline(d);
              setOpen(false);
            }}
          />
        </div>
      )}

      {formats.map((f) =>
        showFormat ? (
          <section key={f.code} className={styles.formatBlock} aria-labelledby={`series-${series.id}-${f.code}`}>
            <h3 id={`series-${series.id}-${f.code}`} className={styles.formatTitle}>
              {f.label}
            </h3>
            <FormatRecord format={f} discipline={shown} />
          </section>
        ) : (
          <FormatRecord key={f.code} format={f} discipline={shown} />
        )
      )}

      <div className={styles.recordFoot}>
        {innings.length > 0 && <MoreToggle open={open} count={innings.length} onToggle={() => setOpen((o) => !o)} />}
        <Link href={`/series/${series.id}`} className={styles.seriesLink}>
          Open series
          <Icon name="arrowRight" size={16} />
        </Link>
      </div>

      {open && (
        <ol className={form.list}>
          {innings.map(({ inn, format }, n) => (
            <FormRow
              key={`${inn.matchId}-${inn.inningsOfMatch}-${n}`}
              href={inn.matchId ? `/matches/${inn.matchId}` : null}
              fig={figure(inn, shown)}
              tier={tierOf(lead(inn, shown), shown)}
              title={inningsName(inn, format)}
              sub={[inn.opponent && `vs ${inn.opponent}`, inn.date && formatInZone(inn.date, 'dateShort', SERVER_ZONE)]
                .filter(Boolean)
                .join(' · ')}
              aside={<span className={form.aside}>{workload(inn, shown, format)}</span>}
            />
          ))}
        </ol>
      )}
    </article>
  );
}

/** The section as it streams in: the picker's box and one record. */
export function SeriesPerformanceSkeleton() {
  return (
    <div className={styles.wrap} aria-busy="true" aria-label="Loading series performance">
      <div className={styles.controls}>
        <Skeleton className={styles.pickerSkeleton} />
      </div>
      <FormCardSkeleton />
    </div>
  );
}

// ---------------------------------------------------------------- Section

export interface SeriesPerformanceProps {
  playerId: string;
  role: PlayerRoleLabel;
  formatCodes: number[];
  initialFormat: SeriesFormatKey;
  initialLists: SeriesLists;
  /** The series named in the URL when it was found, else the default. */
  initialSeries: string | null;
}

export default function SeriesPerformance({
  playerId,
  role,
  formatCodes,
  initialFormat,
  initialLists,
  initialSeries,
}: SeriesPerformanceProps) {
  const [format, setFormat] = useState<SeriesFormatKey>(initialFormat);
  const [lists, setLists] = useState<Partial<Record<SeriesFormatKey, SeriesLists>>>({ [initialFormat]: initialLists });
  const [selected, setSelected] = useState<Partial<Record<SeriesFormatKey, string | null>>>({
    [initialFormat]: initialSeries,
  });
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>('ready');
  const [loadingMore, setLoadingMore] = useState(false);
  const [discipline, setDiscipline] = useFormDiscipline(role === 'Bowler' ? 'bowling' : 'batting');
  const request = useRef(0);

  const formatOptions = useMemo(() => seriesFormatOptions(formatCodes), [formatCodes]);
  const current = lists[format];
  const series = useMemo(() => (current ? mergeLists(current) : []), [current]);
  const selectedId = selected[format] ?? null;
  const shown = series.find((s) => s.id === selectedId) ?? null;

  const options = useMemo<SeriesOption[]>(
    () => series.map((s) => ({ id: s.id, name: s.name, meta: optionMeta(s) })),
    [series]
  );

  const busy = status === 'loading';

  // `search` reads older pages for `want` — only for a series named in the URL.
  const loadFormat = async (next: SeriesFormatKey, want: string | null, search: boolean) => {
    const ticket = ++request.current;
    setStatus('loading');
    try {
      const fetchPage = pageFetcher(playerId, next);
      let loaded = lists[next] ?? (await firstLists(fetchPage));
      if (want && search) loaded = await listsCovering(loaded, want, fetchPage, URL_SEARCH_PAGES);
      if (ticket !== request.current) return;
      const merged = mergeLists(loaded);
      const pick = merged.find((s) => s.id === want)?.id ?? defaultSeries(merged)?.id ?? null;
      setLists((prev) => ({ ...prev, [next]: loaded }));
      setSelected((prev) => ({ ...prev, [next]: pick }));
      setStatus('ready');
      writeUrl(next, pick);
    } catch {
      if (ticket === request.current) setStatus('error');
    }
  };

  const changeFormat = (next: SeriesFormatKey) => {
    if (next === format && status !== 'error') return;
    setFormat(next);
    // Keep the series in view when the new format has it.
    void loadFormat(next, selected[next] ?? selectedId, false);
  };

  const changeSeries = (id: string) => {
    setSelected((prev) => ({ ...prev, [format]: id }));
    writeUrl(format, id);
  };

  const loadMore = async () => {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    try {
      const extended = await extendLists(current, pageFetcher(playerId, format));
      setLists((prev) => ({ ...prev, [format]: extended }));
    } catch {
      // The button stays, so the reader can try again.
    } finally {
      setLoadingMore(false);
    }
  };

  // Back/forward restores a URL this component wrote; follow it rather than the props the router replayed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlFormat = params.get('format') ?? 'all';
    const urlSeries = params.get('series');
    const offered = urlFormat === 'all' || formatOptions.some((f) => f.value === urlFormat);
    if (!isSeriesFormatKey(urlFormat) || !offered) return;
    if (urlFormat !== initialFormat || (urlSeries && urlSeries !== initialSeries)) {
      setFormat(urlFormat);
      void loadFormat(urlFormat, urlSeries, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        {(options.length > 0 || busy) && (
          <SeriesPicker
            options={options}
            value={shown?.id ?? null}
            onChange={changeSeries}
            hasMore={current ? limitingDiscipline(current) !== null : false}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
          />
        )}
        {formatOptions.length > 0 && (
          <Segmented
            label="Format"
            size="sm"
            value={format}
            options={formatOptions.map((f) => ({
              value: f.value,
              label: f.label,
            }))}
            onChange={changeFormat}
            className={styles.formats}
          />
        )}
      </div>

      {status === 'error' ? (
        <ErrorState
          compact
          title="Series could not be loaded"
          body="Check your connection and try again."
          onRetry={() => changeFormat(format)}
        />
      ) : shown ? (
        <SeriesRecord
          key={`${format}|${shown.id}`}
          series={shown}
          discipline={discipline}
          onDiscipline={setDiscipline}
          busy={busy}
        />
      ) : busy ? (
        <FormCardSkeleton />
      ) : (
        <EmptyState compact title="No series performance available yet." />
      )}
    </div>
  );
}
