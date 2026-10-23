// /match/info: squads, officials, forecast, broadcasters and the ground's record, in one response.
import type { MatchConditions, MatchOfficials, MatchWeather, PlayerRole, SquadPlayer, VenueStats } from '@/types';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, resolveKeys, type NameCache } from './names';

export interface ApiMatchInfo {
  /** The confirmed XIs, packed like `tb`. Preferred when longer: once play starts the upstream prunes `tb`. */
  tp?: string;
  /** Broadcasters, comma-separated: "Sony Sports TEN Network, Sony LIV". */
  b?: string;
  /** Umpire keys, "/"-separated: two on-field, the third umpire, then the referee. */
  u?: string;
  /** The forecast at the ground. */
  wU?: {
    /** Current temperature, "29.2˚C". */
    crT?: string;
    mnT?: string;
    mxT?: string;
    /** "Mostly cloudy". */
    wC?: string;
    /** Humidity, unsigned: "75". */
    hum?: string;
    /** Chance of rain, "96 %". */
    rP?: string;
    /** "Windspeed: 13 km/h". */
    wS?: string;
  };
  /**
   * The venue in this format: `a1`–`a4` average innings totals, `h`/`l` highest and
   * lowest (prose), `tm` matches, `x`/`y` won batting/bowling first, `t` the label.
   */
  vsp?: {
    a1?: string;
    a2?: string;
    a3?: string;
    a4?: string;
    h?: string;
    l?: string;
    t?: string;
    tm?: string;
    x?: string;
    y?: string;
  };
  /**
   * Both squads: sides split on "/" in `t`'s order, players on "-", fields on ".".
   * "EX.166.1.…" is player key, caps in the format, role (1 bat, 2 bowl, 3 all-rounder).
   */
  tb?: string;
  /** Captain and keeper of each side in turn: "<t1 capt>/<t1 wk>/<t2 capt>/<t2 wk>". */
  x?: string;
  /** Team keys, in the order `tb` lists them: "S-U". */
  t?: string;
  /** Series key — what lets `getApiArchivedMatch` find an aged-out match in its schedule. */
  s?: string;
  /** Venue key. */
  v?: string;
  /** Scheduled start, ISO. */
  dt?: string;
  /** Format label, the upstream's wording: "Test", "First Class", "One Day". */
  fo?: string;
  /** When play is next due, epoch ms — the next day's start on a multi-day match. */
  nt?: number;
}

/** `tb`'s role field. Anything unrecognised stays unknown rather than becoming a batter. */
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
  const w = info?.wU;
  const weather: MatchWeather | null = w
    ? {
        temperature: infoText(w.crT),
        min: infoText(w.mnT),
        max: infoText(w.mxT),
        condition: infoText(w.wC),
        humidity: infoText(w.hum),
        rainChance: infoText(w.rP),
        wind: infoText(w.wS),
      }
    : null;

  // Positional: a shorter list means officials not yet announced, not a reordering.
  const named = umpireKeys.map((key) => names.u.get(key)?.n ?? null);
  const officials: MatchOfficials | null = named.some(Boolean)
    ? {
        onField: named.slice(0, 2).filter((n): n is string => Boolean(n)),
        thirdUmpire: named[2] ?? null,
        referee: named[3] ?? null,
      }
    : null;

  const v = info?.vsp;
  const record: VenueStats | null = v
    ? {
        label: infoText(v.t),
        matches: infoNumber(v.tm),
        averages: [v.a1, v.a2, v.a3, v.a4].map(infoNumber),
        highest: infoText(v.h),
        lowest: infoText(v.l),
        wonBattingFirst: infoNumber(v.x),
        wonBowlingFirst: infoNumber(v.y),
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
    broadcast: (info?.b ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
    venue,
    nextPlay: typeof info?.nt === 'number' && info.nt > 0 ? new Date(info.nt).toISOString() : null,
  };
}

export interface ApiMatchInfoResult {
  squads: Record<string, SquadPlayer[]>;
  conditions: MatchConditions;
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

  // Whichever of the XI (`tp`) and the squad (`tb`) names more players is the better list.
  const listed = (raw: string | undefined) =>
    (raw ?? '').split('/').filter(Boolean);
  const fromXI = listed(info?.tp);
  const fromSquad = listed(info?.tb);
  const sides =
    fromXI.reduce((n, side) => n + side.split('-').length, 0) >=
    fromSquad.reduce((n, side) => n + side.split('-').length, 0)
      ? fromXI
      : fromSquad;
  const teamKeys = (info?.t ?? '').split('-').map(cleanKey);

  const players = sides.map((side) =>
    side
      .split('-')
      .filter(Boolean)
      .map((entry) => entry.split('.'))
      .filter((fields) => fields[SQUAD_KEY_INDEX])
  );
  const umpireKeys = (info?.u ?? '').split('/').map(cleanKey).filter(Boolean);

  const names = await resolveKeys(
    { u: umpireKeys, p: players.flat().map((fields) => fields[SQUAD_KEY_INDEX]) },
    opts
  );
  const conditions = decodeConditions(info, umpireKeys, names);

  // An id the upstream does not know answers with a bare `null`, not a 404.
  if (!sides.length || !teamKeys.length) return { squads: {}, conditions };

  const roleMarks = (info?.x ?? '').split('/').map(cleanKey);

  const out: Record<string, SquadPlayer[]> = {};
  players.forEach((side, i) => {
    const teamKey = teamKeys[i];
    if (!teamKey) return;

    const captain = roleMarks[i * 2];
    const keeper = roleMarks[i * 2 + 1];

    out[teamKey] = side.map((fields) => {
      const key = cleanKey(fields[SQUAD_KEY_INDEX]);
      const role = SQUAD_ROLES[fields[SQUAD_ROLE_INDEX]] ?? null;

      return {
        id: key,
        name: names.p.get(key)?.n ?? key,
        // `tb` lists a keeper as a batter; only `x` says otherwise.
        role: key === keeper ? 'WK' : role,
        isCaptain: key === captain,
      };
    });
  });

  return { squads: out, conditions };
}
