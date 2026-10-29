// /player/overview: a whole career in one call. A format is always a pair of
// codes (competition + format, see `playerFormatLabel`).
import type {
  PlayerBattingCareer,
  PlayerBowlingCareer,
  PlayerDebut,
  PlayerFormEntry,
  PlayerProfile,
  PlayerRanking,
  PlayerRoleLabel,
} from '@/types';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, playerImageUrl, resolveKeys, type NameCache } from './names';
import { getApiScorecard } from './scorecard';

/** Basic info. Only the fields the profile page reads. */
interface ApiPlayerInfo {
  fullName?: string;
  /** Epoch ms. */
  birthDate?: number | null;
  /** Free text. */
  birthPlace?: string;
  /** The upstream's wording: "5 ft 10 in". */
  height?: string;
  /** As an adjective — "Pakistani". */
  nationality?: string;
  /** Every team they have played for, comma-separated. */
  teams?: string;
  /** Instagram handle. */
  instagram?: string;
  /** Twitter handle, sometimes with the leading @. */
  twitter?: string;
  /** 0 keeper, 1 batter, 3 bowler, anything else all-rounder. */
  role?: number;
  /** Lowercase: "right handed". */
  battingHand?: string;
  /** "opener", "middle order". */
  battingPosition?: string;
  /** "right-arm offbreak". Literally "na" for a non-bowler. */
  bowlingType?: string;
  /** 1 pace, 2 spin, -1 unknown. */
  bowlingStyle?: number;
  /** Almost always empty. */
  popularShot?: string;
  /** 0 men, 1 women. */
  gender?: number;
}

/** One career row — batting or bowling, for one competition and format. */
interface ApiCareerRow<S> {
  /** Competition code. 1 is international; the rest are leagues. */
  competition: number;
  /** Format code, read together with `competition`. */
  format: number;
  stats: S;
}

interface ApiCareerMatchRef {
  matchKey?: string;
}

interface ApiBattingStats {
  matches?: number;
  innings?: number;
  runs?: number;
  hundreds?: number;
  fifties?: number;
  highScore?: number;
  strikeRate?: number;
  average?: number;
  fours?: number;
  sixes?: number;
  ducks?: number;
  /** The innings the highest score was made in. */
  highScoreMatch?: ApiCareerMatchRef | null;
  /** As prose. */
  debut?: string;
  /** Null on the leagues the upstream has not keyed. */
  debutMatch?: ApiCareerMatchRef | null;
}

interface ApiBowlingStats {
  matches?: number;
  innings?: number;
  wickets?: number;
  /** Best innings figures, "5/23"; "" when none. */
  bestFigures?: string;
  economy?: number;
  threeWickets?: number;
  fiveWickets?: number;
  average?: number;
  strikeRate?: number;
  /** As prose. */
  debut?: string;
  debutMatch?: ApiCareerMatchRef | null;
}

/** One of the last ten innings, batting or bowling. */
interface ApiFormRow {
  /** Batting: runs scored. Bowling: runs conceded. */
  runs?: number;
  /** Batting only: balls faced. */
  balls?: number;
  /** Bowling only. */
  wickets?: number;
  /** Batting only: 1 dismissed, 0 not out. */
  dismissed?: number;
  matchKey?: string;
  /** Competition code. */
  competition?: string | number;
  /** Match-type code — the format half of the label on a form row. */
  format?: number;
  /** Epoch ms. */
  startTime?: number;
  /** The opposition's team key. */
  opponentKey?: string;
  team1Key?: string;
  team2Key?: string;
}

interface ApiPlayerOverview {
  profile?: {
    info?: ApiPlayerInfo;
    career?: {
      batting?: ApiCareerRow<ApiBattingStats>[];
      bowling?: ApiCareerRow<ApiBowlingStats>[];
    };
  };
  /** ICC ranking positions. `discipline` is the ranking list's code, not a player role code. */
  rankings?: Array<{ format: number; position: number; discipline: number }>;
  recentForm?: { batting?: ApiFormRow[]; bowling?: ApiFormRow[] };
  /** Teams under contract. `competition` arrives as a string here. */
  contracts?: Array<{ teamKey?: string; competition?: string | number }>;
  /** One entry per competition × format the player has figures in. */
  formatsPlayed?: Array<{ format?: number }>;
}

/**
 * Senior international competition codes: 1 (Test, ODI and T20I share it) and 100
 * (the ODI World Cup). Under-19 is left out: the upstream uses one code for every age level.
 */
export const INTERNATIONAL_COMPETITIONS = new Set([1, 100]);

/** Competitions whose matches the upstream also counts in another row: 100 is a slice of ODI (1). */
const SUBSET_COMPETITIONS = new Set([100]);

/** The upstream's competition labels, from their profile chunk. 1 reads T20I and 18 is The Hundred, as theirs do. */
const PLAYER_COMPETITIONS: Record<number, string> = {
  1: 'T20I',
  2: 'First class',
  3: 'List A',
  4: 'T20',
  5: 'IPL',
  6: 'BBL',
  7: 'CPL',
  8: 'NPL',
  9: 'BPL',
  10: 'Abu Dhabi T10',
  11: 'PSL',
  12: 'QPL',
  14: 'VPL',
  15: 'D. T10',
  16: 'TNPL',
  17: 'KPL',
  18: '100B',
  19: 'Under 19',
  20: 'T20-Blast',
  21: 'The 6IXTY',
  100: 'WC ODI',
};

/**
 * The label for a (competition, format) pair — neither code means anything alone
 * (`st=1, ft=3` is a Test, `st=2, ft=3` List A). A transcription of the upstream's
 * `seriesFormatDecision`, branch order included. Null for a pair the upstream can't name.
 */
export function playerFormatLabel(st: number, ft: number): string | null {
  if (ft === 1 && st !== 3 && st !== 100) return 'ODI';
  if (ft === 2 && (st === 2 || st === 3 || st === 10)) return 'T20';
  if (ft === 3 && st !== 2) return 'Test';
  if (ft === 4 && st !== 10 && st !== 12 && st !== 14 && st !== 15 && st !== 16) return 'T10';
  if (ft === 5) return '100B';
  return PLAYER_COMPETITIONS[st] ?? null;
}

/** The upstream's role codes. 2 only ever appears on a ranking row, 3 only on a player. */
function playerRole(code: number | undefined): PlayerRoleLabel {
  if (code === 1) return 'Batter';
  if (code === 3) return 'Bowler';
  if (code === 0) return 'Wicket-keeper';
  return 'All Rounder';
}

/** The discipline a ranking list is for. Its codes are not the player's. */
function rankingDiscipline(code: number): PlayerRanking['discipline'] {
  if (code === 1) return 'Batter';
  if (code === 2) return 'Bowler';
  return 'All Rounder';
}

/** Whole years since a date of birth. */
function ageFrom(dob: number | null | undefined): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** "right handed · opener" from fields that may be empty, or the upstream's literal "na" / "-1". */
function joinTrait(...parts: Array<string | undefined>): string | null {
  const kept = parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p && p.toLowerCase() !== 'na' && p !== '-1');
  return kept.length ? kept.join(' · ') : null;
}

/** Bowling style, spelled out. -1 is the upstream's "not recorded". */
function bowlingStyle(code: number | undefined): string | undefined {
  if (code === 1) return 'pacer';
  if (code === 2) return 'spinner';
  return undefined;
}

/** One form entry: batting is runs off balls; bowling is wickets for runs. */
function toFormEntry(
  row: ApiFormRow,
  discipline: 'batting' | 'bowling',
  names: NameCache
): PlayerFormEntry {
  const runs = row.runs ?? 0;
  // The player's own side is whichever team is not the opponent.
  const opponent = cleanKey(row.opponentKey);
  const own = cleanKey(row.team1Key) === opponent ? cleanKey(row.team2Key) : cleanKey(row.team1Key);
  const label = (key: string) => names.t.get(key)?.shortName ?? names.t.get(key)?.name ?? key;

  return {
    figures: discipline === 'batting' ? `${runs} (${row.balls ?? 0})` : `${row.wickets ?? 0}-${runs}`,
    notOut: discipline === 'batting' && row.dismissed === 0,
    fixture: `${label(own)} vs ${label(opponent)}`,
    format: playerFormatLabel(Number(row.competition), Number(row.format)),
    matchId: cleanKey(row.matchKey) || null,
    date: row.startTime ? new Date(row.startTime).toISOString() : null,
  };
}

/**
 * Everything the upstream knows about one player, or null for a key it does not know (the
 * route 404s on that). `fullName` beats the mapping's name: it is the fuller spelling.
 */
export async function getApiPlayerProfile(
  key: string,
  opts: FetchOpts = {}
): Promise<PlayerProfile | null> {
  const id = cleanKey(key);
  if (!id) return null;

  const raw = await apiGet<ApiPlayerOverview>(`/player/overview?key=${encodeURIComponent(id)}`, {
    revalidate: 3600,
    ...opts,
  });

  const basic = raw.profile?.info;
  // The upstream answers an unknown key with a well-formed envelope and nothing in it.
  if (!basic?.fullName) return null;

  const batting = raw.profile?.career?.batting ?? [];
  const bowling = raw.profile?.career?.bowling ?? [];
  const recentBatting = raw.recentForm?.batting ?? [];
  const recentBowling = raw.recentForm?.bowling ?? [];
  const contracts = raw.contracts ?? [];

  const names = await resolveKeys(
    {
      t: [
        ...[...recentBatting, ...recentBowling].flatMap((r) => [
          r.team1Key ?? '',
          r.team2Key ?? '',
          r.opponentKey ?? '',
        ]),
        ...contracts.map((c) => c.teamKey ?? ''),
      ].filter(Boolean),
      p: [id],
    },
    opts
  );

  // The national side, for the crest: a player has one contract row per format under st=1.
  const national = contracts.find((c) => Number(c.competition) === 1)?.teamKey;
  const countryKey = cleanKey(national) || null;

  // One debut per format; both disciplines' rows carry it, and batting's wording comes first.
  const debuts: PlayerDebut[] = [];
  for (const row of [...batting, ...bowling]) {
    const format = playerFormatLabel(row.competition, row.format);
    const fixture = (row.stats.debut ?? '').trim();
    if (!format || !fixture || debuts.some((d) => d.format === format)) continue;
    debuts.push({
      format,
      fixture,
      matchId: cleanKey(row.stats.debutMatch?.matchKey) || null,
    });
  }

  return {
    id,
    name: basic.fullName.trim() || names.p.get(id)?.name || id,
    image: playerImageUrl(id),
    role: playerRole(basic.role),
    gender: basic.gender === 1 ? 'Female' : 'Male',
    dateOfBirth: basic.birthDate ? new Date(basic.birthDate).toISOString() : null,
    age: ageFrom(basic.birthDate),
    birthPlace: basic.birthPlace?.trim() || null,
    height: basic.height?.trim() || null,
    nationality: basic.nationality?.trim() || null,
    bats: joinTrait(basic.battingHand, basic.battingPosition),
    bowls: joinTrait(basic.bowlingType, bowlingStyle(basic.bowlingStyle)),
    popularShot: basic.popularShot?.trim() || null,
    // The upstream repeats a franchise it signed the player to more than once.
    teams: [
      ...new Set(
        (basic.teams ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      ),
    ],
    countryKey,
    countryShortName: countryKey
      ? names.t.get(countryKey)?.shortName ?? names.t.get(countryKey)?.name ?? null
      : null,
    instagram: basic.instagram?.trim() || null,
    twitter: basic.twitter?.replace(/^@/, '').trim() || null,
    // A ranking's format is labelled with the international code, not the row's own.
    rankings: (raw.rankings ?? [])
      .map((r) => ({
        format: playerFormatLabel(1, r.format) ?? '',
        position: r.position,
        discipline: rankingDiscipline(r.discipline),
      }))
      .filter((r) => r.format && r.position > 0),
    batting: batting
      .map((row) => {
        const format = playerFormatLabel(row.competition, row.format);
        if (!format) return null;
        const s = row.stats ?? {};
        return {
          format,
          international: INTERNATIONAL_COMPETITIONS.has(row.competition),
          partOf: SUBSET_COMPETITIONS.has(row.competition) ? playerFormatLabel(1, row.format) : null,
          matches: s.matches ?? 0,
          innings: s.innings ?? 0,
          runs: s.runs ?? 0,
          hundreds: s.hundreds ?? 0,
          fifties: s.fifties ?? 0,
          highScore: s.highScore ?? 0,
          strikeRate: s.strikeRate ?? 0,
          average: s.average ?? 0,
          fours: s.fours ?? 0,
          sixes: s.sixes ?? 0,
          ducks: s.ducks ?? null,
          highScoreMatchId: cleanKey(s.highScoreMatch?.matchKey) || null,
        } satisfies PlayerBattingCareer;
      })
      .filter((r): r is PlayerBattingCareer => r !== null),
    bowling: bowling
      .map((row) => {
        const format = playerFormatLabel(row.competition, row.format);
        if (!format) return null;
        const s = row.stats ?? {};
        return {
          format,
          international: INTERNATIONAL_COMPETITIONS.has(row.competition),
          partOf: SUBSET_COMPETITIONS.has(row.competition) ? playerFormatLabel(1, row.format) : null,
          matches: s.matches ?? 0,
          innings: s.innings ?? 0,
          wickets: s.wickets ?? 0,
          economy: s.economy ?? 0,
          average: s.average ?? 0,
          // "0-0" is the upstream's placeholder for a bowler with no figures at all.
          best: s.bestFigures && s.bestFigures !== '0-0' && s.bestFigures !== '0/0' ? s.bestFigures : null,
          threeWickets: s.threeWickets ?? 0,
          fiveWickets: s.fiveWickets ?? 0,
          strikeRate: s.strikeRate ?? 0,
        } satisfies PlayerBowlingCareer;
      })
      .filter((r): r is PlayerBowlingCareer => r !== null),
    recentBatting: recentBatting.map((r) => toFormEntry(r, 'batting', names)),
    recentBowling: recentBowling.map((r) => toFormEntry(r, 'bowling', names)),
    debuts,
    formatCodes: [...new Set((raw.formatsPlayed ?? []).map((c) => Number(c.format)).filter((ft) => ft > 0))],
  };
}

/** How far back a form entry may still be a match in progress (a Test runs five days). */
const FORM_LIVE_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;

/**
 * Recent form with the latest matches re-read off their scorecards. The upstream's profile is cached
 * for an hour and can still hold an innings as it stood mid-match ("52 (57)*" after the batter
 * was out for 77).
 */
export async function withFreshForm(profile: PlayerProfile, opts: FetchOpts = {}): Promise<PlayerProfile> {
  const now = Date.now();
  const recent = new Set(
    [...profile.recentBatting, ...profile.recentBowling]
      .filter((e) => e.matchId && e.date && now - +new Date(e.date) < FORM_LIVE_WINDOW_MS)
      .map((e) => e.matchId as string)
  );
  if (!recent.size) return profile;

  const cards = new Map(
    await Promise.all(
      [...recent].map(
        async (key) => [key, await getApiScorecard(key, { revalidate: 15, ...opts }).catch(() => null)] as const
      )
    )
  );

  // Entries are newest first, so a Test's two innings map onto the card's last innings first.
  const refresh = (entries: PlayerFormEntry[], discipline: 'batting' | 'bowling'): PlayerFormEntry[] => {
    const used = new Map<string, number>();
    return entries.map((entry) => {
      const card = entry.matchId ? cards.get(entry.matchId) : null;
      if (!card) return entry;
      const lines =
        discipline === 'batting'
          ? card.flatMap((inn) => inn.batting?.filter((l) => l.playerId === profile.id) ?? [])
          : card.flatMap((inn) => inn.bowling?.filter((l) => l.playerId === profile.id) ?? []);
      const n = used.get(entry.matchId as string) ?? 0;
      used.set(entry.matchId as string, n + 1);
      const line = lines[lines.length - 1 - n];
      if (!line) return entry;
      if ('balls' in line) {
        return { ...entry, figures: `${line.runs} (${line.balls})`, notOut: !line.out };
      }
      return { ...entry, figures: `${line.wickets}-${line.runs}` };
    });
  };

  return {
    ...profile,
    recentBatting: refresh(profile.recentBatting, 'batting'),
    recentBowling: refresh(profile.recentBowling, 'bowling'),
  };
}
