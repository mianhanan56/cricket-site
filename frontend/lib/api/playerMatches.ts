// /player/matches: a player's innings, grouped by series then format, newest series first.
import type { PlayerDiscipline, PlayerSeriesPage, PlayerSeriesRecord } from '@/types';
import { ordinal } from '../text';
import { knockoutStage } from './codes';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, resolveKeys } from './names';
import { INTERNATIONAL_COMPETITIONS, playerFormatLabel } from './player';

/** One innings. */
interface ApiPlayerInningsRow {
  matchKey?: string;
  /** Match number in the series, or a `^` knockout code. */
  matchNumber?: string;
  /** The player's 1st or 2nd innings of the match. */
  inningsOfMatch?: number;
  runs?: number;
  /** Balls faced, or bowled on a bowling row. */
  balls?: number;
  wickets?: number;
  /** 1 dismissed, 0 not out. */
  dismissed?: number;
  opponentKey?: string;
  /** Epoch ms. */
  startTime?: number;
  /** "Test", "ODI", "T20I"; "Match" in domestic cricket, absent in The Hundred. */
  formatName?: string | null;
}

interface ApiPlayerSeriesRow {
  seriesKey?: string;
  competition?: string | number;
  /** The player's side. */
  teamKey?: string;
  /** Epoch ms. */
  startDate?: number;
  endDate?: number;
  formats?: Array<{ format?: number; innings?: ApiPlayerInningsRow[] }>;
}

/** The upstream sends six series on the first page and three on every later one. */
const PLAYER_SERIES_PAGE = (page: number) => (page === 0 ? 6 : 3);

/** "3rd Test", "22nd Match" where the upstream names no format (domestic, The Hundred), "Final". */
export function seriesMatchLabel(mn: string | undefined, format: string | null | undefined): string {
  const code = (mn ?? '').trim();
  if (code.startsWith('^')) return knockoutStage(code) ?? 'Knockout';
  const n = Number.parseInt(code, 10);
  const noun = format?.trim() || 'Match';
  if (n === 0) return `Only ${noun}`;
  return Number.isFinite(n) && n > 0 ? `${ordinal(n)} ${noun}` : noun;
}

/**
 * A format group's label. Domestic cricket is named by its shape, since the County
 * Championship (`st=27, ft=3`) would otherwise read as a Test.
 */
function seriesFormatLabel(st: number, ft: number): string {
  if (INTERNATIONAL_COMPETITIONS.has(st)) return playerFormatLabel(st, ft) ?? 'Match';
  return ({ 1: 'List A', 2: 'T20', 3: 'First class', 4: 'T10', 5: '100B' } as Record<number, string>)[ft] ?? 'Match';
}

/** One page of a player's series record for one discipline. `format` is the upstream's `ft` (0 for all). */
export async function getApiPlayerSeriesPage(
  key: string,
  query: { format: number; discipline: PlayerDiscipline; page: number },
  opts: FetchOpts = {}
): Promise<PlayerSeriesPage> {
  const id = cleanKey(key);
  const qs = new URLSearchParams({
    key: id,
    ft: String(query.format),
    bb: query.discipline === 'batting' ? '1' : '0',
    page: String(query.page),
  });
  const raw = await apiGet<ApiPlayerSeriesRow[]>(`/player/matches?${qs}`, { revalidate: 3600, ...opts });
  const rows = Array.isArray(raw) ? raw : [];

  const names = await resolveKeys(
    {
      s: rows.map((r) => r.seriesKey ?? ''),
      t: rows.flatMap((r) => [
        r.teamKey ?? '',
        ...(r.formats ?? []).flatMap((g) => (g.innings ?? []).map((i) => i.opponentKey ?? '')),
      ]),
    },
    opts
  );
  const team = (k: string | undefined) => {
    const entry = names.t.get(cleanKey(k));
    return entry?.shortName ?? entry?.name ?? null;
  };

  const series: PlayerSeriesRecord[] = rows
    .filter((r) => cleanKey(r.seriesKey))
    .map((r) => {
      const sid = cleanKey(r.seriesKey);
      const meta = names.s.get(sid);
      const st = Number(r.competition);
      return {
        id: sid,
        name: meta?.name ?? meta?.shortName ?? sid,
        team: team(r.teamKey),
        start: r.startDate ? new Date(r.startDate).toISOString() : null,
        end: r.endDate ? new Date(r.endDate).toISOString() : null,
        formats: (r.formats ?? [])
          .filter((g) => g.format && (query.format === 0 || g.format === query.format) && g.innings?.length)
          .map((g) => ({
            code: g.format as number,
            label: seriesFormatLabel(st, g.format as number),
            innings: (g.innings ?? [])
              .map((i) => ({
                matchId: cleanKey(i.matchKey) || null,
                matchLabel: seriesMatchLabel(i.matchNumber, i.formatName),
                inningsOfMatch: i.inningsOfMatch ?? 1,
                opponent: team(i.opponentKey),
                date: i.startTime ? new Date(i.startTime).toISOString() : null,
                runs: i.runs ?? 0,
                balls: i.balls ?? 0,
                notOut: query.discipline === 'batting' && i.dismissed === 0,
                wickets: i.wickets ?? 0,
              }))
              // Oldest first, and a Test's first innings before its second.
              .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.inningsOfMatch - b.inningsOfMatch),
          })),
      };
    });

  return { series, more: rows.length >= PLAYER_SERIES_PAGE(query.page) };
}
