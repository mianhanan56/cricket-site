// /player/matches: a player's innings, grouped by series then format, newest series first.
import type { PlayerDiscipline, PlayerSeriesPage, PlayerSeriesRecord } from '@/types';
import { ordinal } from '../text';
import { knockoutStage } from './codes';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, resolveKeys } from './names';
import { INTERNATIONAL_COMPETITIONS, playerFormatLabel } from './player';

/** One innings. Bowling rows put wickets in `w` and balls bowled in `b`. */
interface ApiPlayerInningsRow {
  mf?: string;
  /** Match number in the series, or a `^` knockout code. */
  mn?: string;
  /** The player's 1st or 2nd innings of the match. */
  i?: number;
  r?: number;
  b?: number;
  w?: number;
  /** 1 dismissed, 0 not out. */
  di?: number;
  vs?: string;
  d?: number;
  /** "Test", "ODI", "T20I"; "Match" in domestic cricket, absent in The Hundred. */
  fo?: string | null;
}

interface ApiPlayerSeriesRow {
  sf?: string;
  st?: string | number;
  /** The player's side. */
  pft?: string;
  sd?: number;
  ed?: number;
  d?: Array<{ f?: number; ir?: ApiPlayerInningsRow[] }>;
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
      s: rows.map((r) => r.sf ?? ''),
      t: rows.flatMap((r) => [r.pft ?? '', ...(r.d ?? []).flatMap((g) => (g.ir ?? []).map((i) => i.vs ?? ''))]),
    },
    opts
  );
  const team = (k: string | undefined) => {
    const entry = names.t.get(cleanKey(k));
    return entry?.sn ?? entry?.n ?? null;
  };

  const series: PlayerSeriesRecord[] = rows
    .filter((r) => cleanKey(r.sf))
    .map((r) => {
      const sid = cleanKey(r.sf);
      const meta = names.s.get(sid);
      const st = Number(r.st);
      return {
        id: sid,
        name: meta?.n ?? meta?.sn ?? sid,
        team: team(r.pft),
        start: r.sd ? new Date(r.sd).toISOString() : null,
        end: r.ed ? new Date(r.ed).toISOString() : null,
        formats: (r.d ?? [])
          .filter((g) => g.f && (query.format === 0 || g.f === query.format) && g.ir?.length)
          .map((g) => ({
            code: g.f as number,
            label: seriesFormatLabel(st, g.f as number),
            innings: (g.ir ?? [])
              .map((i) => ({
                matchId: cleanKey(i.mf) || null,
                matchLabel: seriesMatchLabel(i.mn, i.fo),
                inningsOfMatch: i.i ?? 1,
                opponent: team(i.vs),
                date: i.d ? new Date(i.d).toISOString() : null,
                runs: i.r ?? 0,
                balls: i.b ?? 0,
                notOut: query.discipline === 'batting' && i.di === 0,
                wickets: i.w ?? 0,
              }))
              // Oldest first, and a Test's first innings before its second.
              .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.inningsOfMatch - b.inningsOfMatch),
          })),
      };
    });

  return { series, more: rows.length >= PLAYER_SERIES_PAGE(query.page) };
}
