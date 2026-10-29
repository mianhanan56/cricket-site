// /match/info: squads, officials, forecast, broadcasters and the ground's record, in one response.
import type { MatchConditions, MatchOfficials, MatchWeather, PlayerRole, SquadPlayer, VenueStats } from '@/types';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, resolveKeys, type NameCache } from './names';

export interface ApiMatchInfo {
  /** Team keys, in the order `squads` lists the sides: "S-U". */
  teamKeys?: string;
  /**
   * Both squads: sides split on "/" in `teamKeys`' order, players on "-", fields on ".".
   * "EX.166.1.…" is player key, caps in the format, role (1 bat, 2 bowl, 3 all-rounder).
   * Once a side's XI is named, that side lists only the players left out of it.
   */
  squads?: string;
  /** The confirmed XIs, packed like `squads`. */
  playingElevens?: string;
  /** Captain and keeper of each side in turn: "<t1 capt>/<t1 wk>/<t2 capt>/<t2 wk>". */
  captainAndKeeperKeys?: string;
  /** "/"-separated: two on-field, the third umpire, then the referee. */
  umpireKeys?: string;
  /** What lets `getApiArchivedMatch` find an aged-out match in its schedule. */
  seriesKey?: string;
  venueKey?: string;
  /** Scheduled start, ISO. */
  scheduledStart?: string;
  /** When play is next due, epoch ms — the next day's start on a multi-day match. */
  nextPlayTime?: number;
  /** Comma-separated: "Sony Sports TEN Network, Sony LIV". */
  broadcasters?: string;
  /** The forecast at the ground. */
  weather?: {
    /** "29.2˚C". */
    temperature?: string;
    minTemperature?: string;
    maxTemperature?: string;
    /** "Mostly cloudy". */
    condition?: string;
    /** Unsigned: "75". */
    humidity?: string;
    /** "96 %". */
    rainChance?: string;
    /** "Windspeed: 13 km/h". */
    windSpeed?: string;
  };
  /** The venue in this format. Figures arrive as strings; `highest`/`lowest` are prose. */
  venueRecord?: {
    /** "Men's TEST". */
    label?: string;
    matches?: string;
    firstInningsAverage?: string;
    secondInningsAverage?: string;
    thirdInningsAverage?: string;
    fourthInningsAverage?: string;
    highest?: string;
    lowest?: string;
    wonBattingFirst?: string;
    wonBowlingFirst?: string;
  };
}

/** `squads`' role field. Anything unrecognised stays unknown rather than becoming a batter. */
const SQUAD_ROLES: Record<string, PlayerRole> = {
  '1': 'BATSMAN',
  '2': 'BOWLER',
  '3': 'ALL_ROUNDER',
};

const SQUAD_KEY_INDEX = 0;
const SQUAD_ROLE_INDEX = 2;

/** Number in a string field, or null on the blanks the upstream uses for "no figure". */
function infoNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** The upstream sends "" for a field it has nothing for. */
const infoText = (raw: string | undefined): string | null => (raw?.trim() ? raw.trim() : null);

/** Everything but the squads. Each block is null when the upstream has nothing, so the UI drops it. */
function decodeConditions(info: ApiMatchInfo | null, umpireKeys: string[], names: NameCache): MatchConditions {
  const w = info?.weather;
  const weather: MatchWeather | null = w
    ? {
        temperature: infoText(w.temperature),
        min: infoText(w.minTemperature),
        max: infoText(w.maxTemperature),
        condition: infoText(w.condition),
        humidity: infoText(w.humidity),
        rainChance: infoText(w.rainChance),
        wind: infoText(w.windSpeed),
      }
    : null;

  // Positional: a shorter list means officials not yet announced, not a reordering.
  const named = umpireKeys.map((key) => names.u.get(key)?.name ?? null);
  const officials: MatchOfficials | null = named.some(Boolean)
    ? {
        onField: named.slice(0, 2).filter((n): n is string => Boolean(n)),
        thirdUmpire: named[2] ?? null,
        referee: named[3] ?? null,
      }
    : null;

  const v = info?.venueRecord;
  const record: VenueStats | null = v
    ? {
        label: infoText(v.label),
        matches: infoNumber(v.matches),
        averages: [v.firstInningsAverage, v.secondInningsAverage, v.thirdInningsAverage, v.fourthInningsAverage].map(
          infoNumber
        ),
        highest: infoText(v.highest),
        lowest: infoText(v.lowest),
        wonBattingFirst: infoNumber(v.wonBattingFirst),
        wonBowlingFirst: infoNumber(v.wonBowlingFirst),
      }
    : null;
  // The upstream sends the block with only its label ("Others All Seasons") for a ground it has no record of.
  const venue =
    record &&
    (record.matches || record.averages.some((a) => a) || record.highest || record.lowest || record.wonBattingFirst || record.wonBowlingFirst)
      ? record
      : null;

  return {
    weather,
    officials,
    broadcast: (info?.broadcasters ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
    venue,
    nextPlay:
      typeof info?.nextPlayTime === 'number' && info.nextPlayTime > 0 ? new Date(info.nextPlayTime).toISOString() : null,
  };
}

export interface ApiMatchInfoResult {
  squads: Record<string, SquadPlayer[]>;
  /** Squad players left out of a named XI, keyed by team key. Empty until an XI is named. */
  bench: Record<string, SquadPlayer[]>;
  conditions: MatchConditions;
}

/** `playingElevens`/`squads` split into sides, each a list of players' fields. */
function packedSides(raw: string | undefined): string[][][] {
  return (raw ?? '').split('/').map((side) =>
    side
      .split('-')
      .filter(Boolean)
      .map((entry) => entry.split('.'))
      .filter((fields) => fields[SQUAD_KEY_INDEX])
  );
}

/** Squads (keyed by team key) and conditions from one `/match/info` call. */
export async function getApiMatchInfo(
  matchKey: string,
  opts: FetchOpts = {}
): Promise<ApiMatchInfoResult> {
  const info = await apiGet<ApiMatchInfo>(
    `/match/info?key=${encodeURIComponent(matchKey)}`,
    { revalidate: 300, ...opts }
  );

  const teamKeys = (info?.teamKeys ?? '').split('-').map(cleanKey);
  const xis = packedSides(info?.playingElevens);
  const squads = packedSides(info?.squads);

  // Once a side's XI is named, `squads` keeps only the players left out of it.
  const sides = teamKeys.map((_, i) => {
    const xi = xis[i] ?? [];
    const squad = squads[i] ?? [];
    if (!xi.length) return { players: squad, bench: [] as string[][] };
    const picked = new Set(xi.map((fields) => cleanKey(fields[SQUAD_KEY_INDEX])));
    return { players: xi, bench: squad.filter((fields) => !picked.has(cleanKey(fields[SQUAD_KEY_INDEX]))) };
  });
  const umpireKeys = (info?.umpireKeys ?? '').split('/').map(cleanKey).filter(Boolean);

  const names = await resolveKeys(
    {
      u: umpireKeys,
      p: sides.flatMap((side) => [...side.players, ...side.bench].map((fields) => fields[SQUAD_KEY_INDEX])),
    },
    opts
  );
  const conditions = decodeConditions(info, umpireKeys, names);

  const roleMarks = (info?.captainAndKeeperKeys ?? '').split('/').map(cleanKey);

  const out: Record<string, SquadPlayer[]> = {};
  const bench: Record<string, SquadPlayer[]> = {};
  sides.forEach((side, i) => {
    const teamKey = teamKeys[i];
    // An id the upstream does not know answers with a bare `null`, not a 404.
    if (!teamKey || !side.players.length) return;

    const captain = roleMarks[i * 2];
    const keeper = roleMarks[i * 2 + 1];
    const toPlayer = (fields: string[]): SquadPlayer => {
      const key = cleanKey(fields[SQUAD_KEY_INDEX]);
      const role = SQUAD_ROLES[fields[SQUAD_ROLE_INDEX]] ?? null;
      return {
        id: key,
        name: names.p.get(key)?.name ?? key,
        // `squads` lists a keeper as a batter; only `captainAndKeeperKeys` says otherwise.
        role: key === keeper ? 'WK' : role,
        isCaptain: key === captain,
      };
    };

    out[teamKey] = side.players.map(toPlayer);
    if (side.bench.length) bench[teamKey] = side.bench.map(toPlayer);
  });

  return { squads: out, bench, conditions };
}
