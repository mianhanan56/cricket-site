// Rankings source, with a floor under it.
//
// These come from the upstream live now. Getting there took a detour worth recording:
// oc/ranking/getRanking rejects every field name you would guess, because
// `category` selects player-vs-team and `play` is the discipline — so the
// natural `category: 'batting'` yields "category.toLowerCase is not a function"
// or a silent empty body. The real shape came out of the upstream's own rankings chunk.
// Rankings briefly lived in Cloudflare KV while that looked unreachable.
//
// Two things this module has to deal with:
//
//   1. **It is one list per combination.** The upstream has no "give me everything"
//      call, so fifteen lists are fetched in parallel (not eighteen — the ICC
//      publishes no Women's Test rankings). They are edge-cached for an hour by
//      the Worker and wrapped in the page's 1h ISR, so this costs one burst an
//      hour, server-side, however many visitors there are.
//   2. **Rows carry keys, not names.** `playerKey` and `teamKey` resolve through
//      /mapping, in one call for every key across all fifteen lists rather than
//      one call per list.
//
// A failure at any point falls back to the bundled snapshot. That path used to
// render eighteen empty tables — `.catch(() => [])` per combination — which is
// the worst failure mode available: a page that looks fine and is wrong.

import type {
  RankingEntry,
  RankingFormat,
  RankingGender,
  RankingRole,
  TeamRankingEntry,
} from '@/types';
import type {
  RankingsCategory as Category,
  RankingsFormat as Format,
  RankingsGender as Gender,
} from './tabs';
import { FALLBACK_RANKINGS, type RankingsPayload } from '@/data/rankings';
import {
  getApiMapping,
  getApiRankingList,
  getApiTeamRankingList,
  getApiTeamRankings,
  teamLogoUrl,
  type ApiMapping,
  type ApiRankingRow,
  type ApiTeamRankingRow,
} from './api';

/**
 * Every ranking list, indexed the way the view reads them: format × gender ×
 * discipline. Owned here rather than by the component that renders it — this is
 * the module that builds the shape. Women's Test isn't published by the ICC, so
 * that slice is simply empty.
 */
export type RankingsData = Record<Format, Record<Gender, Record<Category, RankingEntry[]>>>;

/** Teams have no discipline axis: a side is ranked as a side. */
export type TeamRankingsData = Record<Format, Record<Gender, TeamRankingEntry[]>>;

// Stored vocabulary (uppercase, matching the old DB enums) -> view vocabulary.
const FORMATS: Record<RankingFormat, Format> = { TEST: 'test', ODI: 'odi', T20I: 't20i' };
const GENDERS: Record<RankingGender, Gender> = { MEN: 'men', WOMEN: 'women' };
const ROLES: Record<RankingRole, Category> = {
  BATTING: 'batting',
  BOWLING: 'bowling',
  ALLROUNDER: 'all-rounder',
};

// The upstream's vocabulary for the same three axes. Note t20, not t20i.
const API_FORMAT = { test: 'test', odi: 'odi', t20i: 't20' } as const;
const API_PLAY = { batting: 'batting', bowling: 'bowling', 'all-rounder': 'allrounder' } as const;

/** The reverse of API_FORMAT — the team response is keyed by the upstream's names. */
const FROM_API_FORMAT = { test: 'test', odi: 'odi', t20: 't20i' } as const;

/** Every slice present and empty, so the view can index without optional chains. */
function emptyData(): RankingsData {
  const data = {} as RankingsData;
  for (const format of Object.values(FORMATS)) {
    data[format] = {} as RankingsData[Format];
    for (const gender of Object.values(GENDERS)) {
      data[format][gender] = { batting: [], bowling: [], 'all-rounder': [] };
    }
  }
  return data;
}

/** Flatten the bundled snapshot into the view's shape. `position` is the 1-based index within its list. */
function toRankingsData(payload: RankingsPayload): RankingsData {
  const data = emptyData();

  for (const [rawFormat, genders] of Object.entries(payload.rankings ?? {})) {
    const format = FORMATS[rawFormat as RankingFormat];
    if (!format || !genders) continue;

    for (const [rawGender, roles] of Object.entries(genders)) {
      const gender = GENDERS[rawGender as RankingGender];
      if (!gender || !roles) continue;

      for (const [rawRole, rows] of Object.entries(roles)) {
        const category = ROLES[rawRole as RankingRole];
        if (!category || !rows) continue;

        data[format][gender][category] = rows.map(
          (row, i): RankingEntry => ({
            id: `${rawFormat}-${rawGender}-${rawRole}-${i + 1}`,
            playerName: row.playerName,
            country: row.country,
            format: rawFormat as RankingFormat,
            role: rawRole as RankingRole,
            gender: rawGender as RankingGender,
            rating: row.rating,
            position: i + 1,
          })
        );
      }
    }
  }

  return data;
}

/** Every team slice present and empty, so the view can index without guards. */
function emptyTeamData(): TeamRankingsData {
  const data = {} as TeamRankingsData;
  for (const format of Object.values(FORMATS)) {
    data[format] = { men: [], women: [] };
  }
  return data;
}

/** Flatten the bundled team snapshot into the view's shape. */
function toTeamRankingsData(payload: RankingsPayload): TeamRankingsData {
  const data = emptyTeamData();

  for (const [rawFormat, genders] of Object.entries(payload.teams ?? {})) {
    const format = FORMATS[rawFormat as RankingFormat];
    if (!format || !genders) continue;

    for (const [rawGender, rows] of Object.entries(genders)) {
      const gender = GENDERS[rawGender as RankingGender];
      if (!gender || !rows) continue;

      data[format][gender] = rows.map(
        (row, i): TeamRankingEntry => ({
          id: `${rawFormat}-${rawGender}-${row.teamKey || i}`,
          teamKey: row.teamKey,
          teamName: row.teamName,
          shortName: row.shortName,
          logo: teamLogoUrl(row.teamKey),
          format: rawFormat as RankingFormat,
          gender: rawGender as RankingGender,
          points: row.points,
          rating: row.rating,
          matches: row.matches,
          position: i + 1,
        })
      );
    }
  }

  return data;
}

/** How many rows each list is trimmed to. The upstream returns ~100; the page shows 10. */
const TOP_N = 10;

/** Test lists are kept whole: they only hold the twelve Test nations, and the teams directory is built from them. */
const teamRowsShown = <T,>(apiFormat: string, rows: T[]): T[] => (apiFormat === 'test' ? rows : rows.slice(0, TOP_N));

interface Combo {
  format: Format;
  gender: Gender;
  category: Category;
}

/** The fifteen lists the ICC actually publishes. */
function combos(): Combo[] {
  const out: Combo[] = [];
  for (const format of ['test', 'odi', 't20i'] as Format[]) {
    for (const gender of ['men', 'women'] as Gender[]) {
      // No Women's Test rankings — women play almost no Tests.
      if (gender === 'women' && format === 'test') continue;
      for (const category of ['batting', 'bowling', 'all-rounder'] as Category[]) {
        out.push({ format, gender, category });
      }
    }
  }
  return out;
}

export interface Rankings {
  data: RankingsData;
  /** Team rankings — one list per format × gender. */
  teams: TeamRankingsData;
  /** Publication date per gender — only set when serving the bundled snapshot. */
  asOf: RankingsPayload['asOf'];
  /** Which copy this came from. `bundled` means the upstream was unreachable. */
  source: 'api' | 'bundled';
}

/** Reverse lookups, for stamping RankingEntry with the uppercase enums. */
const RAW_FORMAT = { test: 'TEST', odi: 'ODI', t20i: 'T20I' } as const;
const RAW_GENDER = { men: 'MEN', women: 'WOMEN' } as const;
const RAW_ROLE = { batting: 'BATTING', bowling: 'BOWLING', 'all-rounder': 'ALLROUNDER' } as const;

/**
 * Fetch every ranking list from the upstream, falling back to the bundled snapshot.
 *
 * Never throws and never returns empty: a rankings page showing slightly old
 * numbers beats one showing nothing, and the caption carries the snapshot date
 * whenever the fallback is in play, so staleness stays visible.
 */
export async function getRankings(): Promise<Rankings> {
  const bundled = (): Rankings => ({
    data: toRankingsData(FALLBACK_RANKINGS),
    teams: toTeamRankingsData(FALLBACK_RANKINGS),
    asOf: FALLBACK_RANKINGS.asOf,
    source: 'bundled',
  });

  try {
    const wanted = combos();

    const [lists, frontLists, menTest] = await Promise.all([
      Promise.all(
        wanted.map((c) =>
          getApiRankingList({
            type: API_FORMAT[c.format],
            gender: c.gender,
            play: API_PLAY[c.category],
          }).catch(() => null)
        )
      ),
      // Two calls, not six: one response carries all three formats.
      Promise.all(
        (['men', 'women'] as Gender[]).map((g) =>
          getApiTeamRankings(g)
            .then((r) => [g, r] as const)
            .catch(() => [g, null] as const)
        )
      ),
      // rankingFront stops at ten, which drops a Test nation.
      getApiTeamRankingList({ type: 'test', gender: 'men' }).catch(() => null),
    ]);
    const teamLists = frontLists.map(([g, r]) =>
      g === 'men' && r && menTest?.length ? ([g, { ...r, test: menTest }] as const) : ([g, r] as const)
    );

    // If the upstream is down we want the snapshot, not a half-populated page. A single
    // missing list is tolerable; nothing at all is not.
    if (lists.every((l) => !l?.length)) return bundled();

    // One /mapping call for every key across all seventeen lists — the fifteen
    // player ones plus the six team slices, which name a dozen or so of the same
    // sides and so mostly ride along for free.
    const playerKeys = new Set<string>();
    const teamKeys = new Set<string>();
    for (const list of lists) {
      for (const row of (list ?? []).slice(0, TOP_N)) {
        if (row.playerKey) playerKeys.add(row.playerKey);
        if (row.teamKey) teamKeys.add(row.teamKey);
      }
    }
    for (const [, byFormat] of teamLists) {
      for (const [apiFormat, rows] of Object.entries(byFormat ?? {})) {
        for (const row of teamRowsShown(apiFormat, rows ?? [])) {
          if (row.teamKey) teamKeys.add(row.teamKey);
        }
      }
    }

    const mapping: ApiMapping = await getApiMapping({
      p: [...playerKeys],
      t: [...teamKeys],
    }).catch(() => ({}) as ApiMapping);

    const players = new Map((mapping.players ?? []).map((e) => [e.key, e.name]));
    // Whole entry, not just the name: a team row renders the short name on the
    // crest fallback, so `shortName` has to survive the lookup too.
    const teamEntries = new Map((mapping.teams ?? []).map((e) => [e.key, e]));

    const data = emptyData();
    let filled = 0;

    wanted.forEach((c, i) => {
      const rows = (lists[i] ?? []).slice(0, TOP_N);
      if (!rows.length) return;

      data[c.format][c.gender][c.category] = rows.map((row: ApiRankingRow, idx) => ({
        id: `${c.format}-${c.gender}-${c.category}-${row.playerKey || idx}`,
        playerKey: row.playerKey || undefined,
        // An unresolved key is better shown as itself than as a blank row —
        // it makes a /mapping gap visible instead of silently truncating.
        playerName: players.get(row.playerKey) ?? row.playerKey,
        country: teamEntries.get(row.teamKey)?.name ?? '',
        format: RAW_FORMAT[c.format],
        role: RAW_ROLE[c.category],
        gender: RAW_GENDER[c.gender],
        rating: row.rating,
        // Already 1-based; fall back to array order.
        position: row.position ?? idx + 1,
        previousPosition: row.previousPosition,
      }));
      filled++;
    });

    if (!filled) return bundled();

    // Teams are built separately, and fall back separately: player lists coming
    // through while the team call fails is a real outcome (they are different
    // upstream endpoints), and it should cost the snapshot for teams only.
    const teamData = emptyTeamData();
    let teamsFilled = 0;

    for (const [gender, byFormat] of teamLists) {
      for (const [apiFormat, rows] of Object.entries(byFormat ?? {})) {
        const format = FROM_API_FORMAT[apiFormat as keyof typeof FROM_API_FORMAT];
        if (!format || !rows?.length) continue;

        teamData[format][gender] = teamRowsShown(apiFormat, rows)
          .map((row: ApiTeamRankingRow, idx): TeamRankingEntry => {
            const entry = teamEntries.get(row.teamKey);
            return {
              id: `${format}-${gender}-${row.teamKey || idx}`,
              teamKey: row.teamKey,
              // An unresolved key shows as itself, same as the player lists —
              // it makes a /mapping gap visible instead of blanking the row.
              teamName: entry?.name ?? row.teamKey,
              shortName: entry?.shortName ?? row.teamKey,
              logo: teamLogoUrl(row.teamKey),
              format: RAW_FORMAT[format],
              gender: RAW_GENDER[gender],
              points: row.points,
              rating: row.rating,
              matches: row.matches,
              // rankingFront sends no position — the list is already ordered.
              position: idx + 1,
            };
          });
        teamsFilled++;
      }
    }

    // No `asOf`: the upstream does not date its rankings, and it does not need to —
    // this is live. The caption only claims a date for the bundled snapshot.
    return {
      data,
      teams: teamsFilled ? teamData : toTeamRankingsData(FALLBACK_RANKINGS),
      asOf: {},
      source: 'api',
    };
  } catch {
    return bundled();
  }
}
