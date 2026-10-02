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
import { getCrexPlayerSeriesPage } from '@/lib/crex';
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
import styles from './SeriesPerformance.module.scss';

// One request per page for the life of the tab, however often a format is revisited.
const pages = new Map<string, Promise<PlayerSeriesPage>>();

function pageFetcher(playerId: string, format: SeriesFormatKey): PageFetcher {
  return (discipline, page) => {
    const key = `${playerId}|${format}|${discipline}|${page}`;
    let request = pages.get(key);
    if (!request) {
      request = getCrexPlayerSeriesPage(playerId, {
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

// Calendar dates in a fixed zone, so the server render and hydration agree.
const fmtDate = (iso: string | null) => (iso ? formatInZone(iso, 'date', SERVER_ZONE) : '');
const monthYear = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: SERVER_ZONE,
  }).format(new Date(iso));

function dateRange(start: string | null, end: string | null): string {
  if (!start || !end) return fmtDate(start ?? end);
  const [a, b] = [fmtDate(start), fmtDate(end)];
  if (a === b) return a;
  const sameYear = a.slice(-4) === b.slice(-4);
  return `${sameYear ? formatInZone(start, 'dateShort', SERVER_ZONE) : a} – ${b}`;
}

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

const tierOf = (lead: number, discipline: PlayerDiscipline) => {
  const [notable, landmark] = discipline === 'batting' ? [50, 100] : [3, 5];
  return lead >= landmark ? 'landmark' : lead >= notable ? 'notable' : 'plain';
};

// ---------------------------------------------------------------- Pieces

const RIBBON_W = 1000;
const RIBBON_GAP = 8;
const RIBBON_MIN = 6;

/** The total, built from its innings: one segment each, sized by what it added. */
function Ribbon({ innings, discipline }: { innings: PlayerSeriesInnings[]; discipline: PlayerDiscipline }) {
  const value = (i: PlayerSeriesInnings) => (discipline === 'batting' ? i.runs : i.wickets);
  const total = innings.reduce((sum, i) => sum + value(i), 0);
  const room = RIBBON_W - RIBBON_GAP * (innings.length - 1) - RIBBON_MIN * innings.length;
  if (room <= 0) return null;

  let x = 0;
  return (
    <svg className={styles.ribbon} viewBox={`0 0 ${RIBBON_W} 10`} preserveAspectRatio="none" aria-hidden="true">
      {innings.map((inn, i) => {
        const width = RIBBON_MIN + (total > 0 ? (value(inn) / total) * room : room / innings.length);
        const rect = (
          <rect
            key={i}
            x={x}
            y="0"
            width={width}
            height="10"
            rx="2"
            className={styles[tierOf(value(inn), discipline)]}
          />
        );
        x += width + RIBBON_GAP;
        return rect;
      })}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const rate = (n: number | null) => (n === null ? '—' : n.toFixed(2));

function inningsName(inn: PlayerSeriesInnings, format: PlayerSeriesFormatRecord): string {
  if (!isMultiInnings(format)) return inn.matchLabel;
  return `${inn.matchLabel} · ${inn.inningsOfMatch === 2 ? '2nd' : '1st'} inns`;
}

function InningsList({ format, discipline }: { format: PlayerSeriesFormatRecord; discipline: PlayerDiscipline }) {
  const hundred = format.code === 5;
  return (
    <ol className={styles.rows} aria-label={`${discipline === 'batting' ? 'Batting' : 'Bowling'} innings`}>
      {format.innings.map((inn, i) => {
        const lead = discipline === 'batting' ? inn.runs : inn.wickets;
        const body = (
          <>
            <span className={styles.fig}>
              <span className={styles.figMain} data-tier={tierOf(lead, discipline)}>
                {discipline === 'batting' ? `${inn.runs}${inn.notOut ? '*' : ''}` : `${inn.wickets}-${inn.runs}`}
              </span>
              <span className={styles.figSub}>
                {discipline === 'batting'
                  ? `(${inn.balls})`
                  : hundred
                    ? `${inn.balls} b`
                    : `${oversFrom(inn.balls)} ov`}
              </span>
            </span>
            <span className={styles.match}>{inningsName(inn, format)}</span>
            <span className={styles.meta}>
              {[inn.opponent && `vs ${inn.opponent}`, inn.date && formatInZone(inn.date, 'dateShort', SERVER_ZONE)]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        );
        return (
          <li key={`${inn.matchId}-${inn.inningsOfMatch}-${i}`}>
            {inn.matchId ? (
              <Link href={`/matches/${inn.matchId}`} className={styles.row}>
                {body}
                <Icon name="chevronRight" size={16} className={styles.chev} />
              </Link>
            ) : (
              <div className={styles.row}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function BattingBlock({ format, showFormat }: { format: PlayerSeriesFormatRecord; showFormat: boolean }) {
  const s = battingSummary(format.innings);
  return (
    <section className={styles.block} aria-label={`Batting${showFormat ? `, ${format.label}` : ''}`}>
      <BlockHead title="Batting" format={showFormat ? format.label : null} />
      <p className={styles.headline}>
        <span className={styles.total}>{s.runs}</span>
        <span className={styles.unit}>{s.runs === 1 ? 'run' : 'runs'}</span>
        <span className={styles.context}>
          {s.innings} inns · {s.matches} {s.matches === 1 ? 'match' : 'matches'}
        </span>
      </p>
      <Ribbon innings={format.innings} discipline="batting" />
      <dl className={styles.stats}>
        <Stat label="Avg" value={rate(s.average)} />
        <Stat label="SR" value={rate(s.strikeRate)} />
        <Stat label="HS" value={s.highest} />
        <Stat label="50s" value={s.fifties} />
        <Stat label="100s" value={s.hundreds} />
        <Stat label="Not out" value={s.notOuts} />
      </dl>
      <InningsList format={format} discipline="batting" />
    </section>
  );
}

function BowlingBlock({ format, showFormat }: { format: PlayerSeriesFormatRecord; showFormat: boolean }) {
  const s = bowlingSummary(format.innings, format.code);
  return (
    <section className={styles.block} aria-label={`Bowling${showFormat ? `, ${format.label}` : ''}`}>
      <BlockHead title="Bowling" format={showFormat ? format.label : null} />
      <p className={styles.headline}>
        <span className={styles.total}>{s.wickets}</span>
        <span className={styles.unit}>{s.wickets === 1 ? 'wicket' : 'wickets'}</span>
        <span className={styles.context}>
          {s.innings} inns · {s.workload.value} {s.workload.unit}
        </span>
      </p>
      <Ribbon innings={format.innings} discipline="bowling" />
      <dl className={styles.stats}>
        <Stat label="Runs" value={s.runs} />
        <Stat label="Econ" value={rate(s.economy)} />
        <Stat label="Avg" value={rate(s.average)} />
        <Stat label="Best" value={s.best ?? '—'} />
        <Stat label="4W" value={s.fourFors} />
        <Stat label="5W" value={s.fiveFors} />
      </dl>
      <InningsList format={format} discipline="bowling" />
    </section>
  );
}

function BlockHead({ title, format }: { title: string; format: string | null }) {
  return (
    <h3 className={styles.blockTitle}>
      {title}
      {format && <span className={styles.formatChip}>{format}</span>}
    </h3>
  );
}

function SeriesRecord({ series, role }: { series: PlayerSeries; role: PlayerRoleLabel }) {
  const order: PlayerDiscipline[] = role === 'Bowler' ? ['bowling', 'batting'] : ['batting', 'bowling'];
  const codes = [...new Set([...series.batting, ...series.bowling].map((f) => f.code))];
  const labelOf = (code: number) => [...series.batting, ...series.bowling].find((f) => f.code === code)?.label ?? '';
  const showFormat = codes.length > 1;

  return (
    <>
      {codes.map((code) => {
        const found = order.map((d) => [d, series[d].find((f) => f.code === code)] as const);
        return found.map(([discipline, format], i) => {
          if (!format) {
            // Only the player's own discipline earns a "nothing here" line; a batter not bowling is normal.
            return i === 0 ? (
              <p key={`${code}-${discipline}`} className={styles.none}>
                No {discipline} data available for this series
                {showFormat ? ` (${labelOf(code)})` : ''}.
              </p>
            ) : null;
          }
          return discipline === 'batting' ? (
            <BattingBlock key={`${code}-bat`} format={format} showFormat={showFormat} />
          ) : (
            <BowlingBlock key={`${code}-bowl`} format={format} showFormat={showFormat} />
          );
        });
      })}
    </>
  );
}

function RecordSkeleton() {
  return (
    <div className={styles.panel} aria-busy="true" aria-label="Loading series performance">
      <div className={styles.block}>
        <Skeleton variant="title" width="30" />
        <Skeleton variant="display" width="40" />
        <Skeleton variant="text" width="100" />
        <Skeleton variant="body" width="70" />
      </div>
    </div>
  );
}

/** The section as it streams in: the picker's box and one record. */
export function SeriesPerformanceSkeleton() {
  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <Skeleton className={styles.pickerSkeleton} />
      </div>
      <RecordSkeleton />
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
        <article className={styles.panel} aria-busy={busy || undefined} data-busy={busy || undefined}>
          <header className={styles.panelHead}>
            <p className={styles.panelMeta}>
              {shown.team && <span className={styles.team}>{shown.team}</span>}
              <span>{dateRange(shown.start, shown.end)}</span>
            </p>
            <Link href={`/series/${shown.id}`} className={styles.seriesLink}>
              Open series
              <Icon name="arrowRight" size={16} />
            </Link>
          </header>
          <SeriesRecord series={shown} role={role} />
        </article>
      ) : busy ? (
        <RecordSkeleton />
      ) : (
        <EmptyState compact title="No series performance available yet." />
      )}
    </div>
  );
}
