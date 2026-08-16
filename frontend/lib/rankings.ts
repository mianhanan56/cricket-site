// Rankings source, with a floor under it.
//
// These come from crex live now. Getting there took a detour worth recording:
// oc/ranking/getRanking rejects every field name you would guess, because
// `category` selects player-vs-team and `play` is the discipline — so the
// natural `category: 'batting'` yields "category.toLowerCase is not a function"
// or a silent empty body. The real shape came out of crex's own rankings chunk.
// Rankings briefly lived in Cloudflare KV while that looked unreachable.
//
// Two things this module has to deal with:
//
//   1. **It is one list per combination.** crex has no "give me everything"
//      call, so fifteen lists are fetched in parallel (not eighteen — the ICC
//      publishes no Women's Test rankings). They are edge-cached for an hour by
//      the Worker and wrapped in the page's 1h ISR, so this costs one burst an
//      hour, server-side, however many visitors there are.
//   2. **Rows are keyed, not named.** `pf` is a player f_key and `tf` a team's.
//      Both resolve through /mapping, in one call for every key across all
//      fifteen lists rather than one call per list.
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
  getCrexMapping,
  getCrexRankingList,
  getCrexTeamRankings,
  teamLogoUrl,
  type CrexMapping,
  type CrexRankingRow,
  type CrexTeamRankingRow,
} from './crex';

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

// crex's vocabulary for the same three axes. Note t20, not t20i.
const CREX_FORMAT = { test: 'test', odi: 'odi', t20i: 't20' } as const;
const CREX_PLAY = { batting: 'batting', bowling: 'bowling', 'all-rounder': 'allrounder' } as const;

/** The reverse of CREX_FORMAT — the team response is keyed by crex's names. */
const FROM_CREX_FORMAT = { test: 'test', odi: 'odi', t20: 't20i' } as const;

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

/**
 * Flatten the bundled snapshot into the view's shape.
 *
 * `position` is the 1-based index within its list and `points` mirrors `rating`
 * — both were columns in the old Ranking table, and both were always derived.
 */
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
            points: row.rating,
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

/** How many rows each list is trimmed to. crex returns ~100; the page shows 10. */
const TOP_N = 10;

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
  /** Which copy this came from. `bundled` means crex was unreachable. */
  source: 'crex' | 'bundled';
}

/** Reverse lookups, for stamping RankingEntry with the uppercase enums. */
const RAW_FORMAT = { test: 'TEST', odi: 'ODI', t20i: 'T20I' } as const;
const RAW_GENDER = { men: 'MEN', women: 'WOMEN' } as const;
const RAW_ROLE = { batting: 'BATTING', bowling: 'BOWLING', 'all-rounder': 'ALLROUNDER' } as const;

/**
 * Fetch every ranking list from crex, falling back to the bundled snapshot.
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

    const [lists, teamLists] = await Promise.all([
      Promise.all(
        wanted.map((c) =>
          getCrexRankingList({
            type: CREX_FORMAT[c.format],
            gender: c.gender,
            play: CREX_PLAY[c.category],
          }).catch(() => null)
        )
      ),
      // Two calls, not six: one response carries all three formats.
      Promise.all(
        (['men', 'women'] as Gender[]).map((g) =>
          getCrexTeamRankings(g)
            .then((r) => [g, r] as const)
            .catch(() => [g, null] as const)
        )
      ),
    ]);

    // If crex is down we want the snapshot, not a half-populated page. A single
    // missing list is tolerable; nothing at all is not.
    if (lists.every((l) => !l?.length)) return bundled();

    // One /mapping call for every key across all seventeen lists — the fifteen
    // player ones plus the six team slices, which name a dozen or so of the same
    // sides and so mostly ride along for free.
    const playerKeys = new Set<string>();
    const teamKeys = new Set<string>();
    for (const list of lists) {
      for (const row of (list ?? []).slice(0, TOP_N)) {
        if (row.pf) playerKeys.add(row.pf);
        if (row.tf) teamKeys.add(row.tf);
      }
    }
    for (const [, byFormat] of teamLists) {
      for (const rows of Object.values(byFormat ?? {})) {
        for (const row of (rows ?? []).slice(0, TOP_N)) {
          if (row.tf) teamKeys.add(row.tf);
        }
      }
    }

    const mapping: CrexMapping = await getCrexMapping({
      p: [...playerKeys],
      t: [...teamKeys],
    }).catch(() => ({}) as CrexMapping);

    const players = new Map((mapping.p ?? []).map((e) => [e.f_key, e.n]));
    // Whole entry, not just the name: a team row renders the short name on the
    // crest fallback, so `sn` has to survive the lookup too.
    const teamEntries = new Map((mapping.t ?? []).map((e) => [e.f_key, e]));

    const data = emptyData();
    let filled = 0;

    wanted.forEach((c, i) => {
      const rows = (lists[i] ?? []).slice(0, TOP_N);
      if (!rows.length) return;

      data[c.format][c.gender][c.category] = rows.map((row: CrexRankingRow, idx) => ({
        id: `${c.format}-${c.gender}-${c.category}-${row.pf || idx}`,
        // An unresolved key is better shown as itself than as a blank row —
        // it makes a /mapping gap visible instead of silently truncating.
        playerName: players.get(row.pf) ?? row.pf,
        country: teamEntries.get(row.tf)?.n ?? '',
        format: RAW_FORMAT[c.format],
        role: RAW_ROLE[c.category],
        gender: RAW_GENDER[c.gender],
        points: row.r,
        rating: row.r,
        // crex sends `pos`, already 1-based; fall back to array order.
        position: row.pos ?? idx + 1,
        previousPosition: row.pr,
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
      for (const [crexFormat, rows] of Object.entries(byFormat ?? {})) {
        const format = FROM_CREX_FORMAT[crexFormat as keyof typeof FROM_CREX_FORMAT];
        if (!format || !rows?.length) continue;

        teamData[format][gender] = rows
          .slice(0, TOP_N)
          .map((row: CrexTeamRankingRow, idx): TeamRankingEntry => {
            const entry = teamEntries.get(row.tf);
            return {
              id: `${format}-${gender}-${row.tf || idx}`,
              teamKey: row.tf,
              // An unresolved key shows as itself, same as the player lists —
              // it makes a /mapping gap visible instead of blanking the row.
              teamName: entry?.n ?? row.tf,
              shortName: entry?.sn ?? row.tf,
              logo: teamLogoUrl(row.tf),
              format: RAW_FORMAT[format],
              gender: RAW_GENDER[gender],
              points: row.p,
              rating: row.r,
              matches: row.m,
              // rankingFront sends no position — the list is already ordered.
              position: idx + 1,
            };
          });
        teamsFilled++;
      }
    }

    // No `asOf`: crex does not date its rankings, and it does not need to —
    // this is live. The caption only claims a date for the bundled snapshot.
    return {
      data,
      teams: teamsFilled ? teamData : toTeamRankingsData(FALLBACK_RANKINGS),
      asOf: {},
      source: 'crex',
    };
  } catch {
    return bundled();
  }
}
