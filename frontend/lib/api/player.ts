// /player/overview: a whole career in one call. A format is always a pair of
// codes (`st` competition + `ft`/`mt` format, see `playerFormatLabel`), and the
// bio is pasted Google Docs HTML (see `sanitizeBio`).
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

/** Basic info — the upstream's `a.bsi`. Only the fields the profile page reads. */
interface ApiPlayerBasic {
  /** Full name. */
  fn?: string;
  /** Date of birth, epoch ms. */
  dob?: number | null;
  /** Date of death. */
  dod?: number | null;
  /** Place of birth, free text. */
  pob?: string;
  /** Height, the upstream's wording: "5 ft 10 in". */
  h?: string;
  /** Nationality as an adjective — "Pakistani". */
  n?: string;
  /** Bio, as HTML. */
  p?: string;
  /** Every team they have played for, comma-separated. */
  tm?: string;
  /** Instagram handle. */
  iu?: string;
  /** Twitter handle, sometimes with the leading @. */
  tu?: string;
  /** Role: 0 keeper, 1 batter, 3 bowler, anything else all-rounder. */
  rl?: number;
  /** Batting hand, lowercase: "right handed". */
  bts?: string;
  /** Batting position: "opener", "middle order". */
  bp?: string;
  /** Bowling type: "right-arm offbreak". Literally "na" for a non-bowler. */
  bwl?: string;
  /** Bowling style: 1 pace, 2 spin, -1 unknown. */
  bs?: number;
  /** Popular shot. Almost always empty. */
  ps?: string;
  /** Gender: 0 men, 1 women. */
  g?: number;
}

/** One career row — batting or bowling, for one competition and format. */
interface ApiCareerRow<S> {
  /** Competition code. 1 is international; the rest are leagues. */
  st: number;
  /** Format code, read together with `st`. */
  ft: number;
  s: S;
}

/** A match referenced from a career row. Only the key is read. */
interface ApiCareerMatchRef {
  mf?: string;
}

interface ApiBattingStats {
  m?: number;
  i?: number;
  r?: number;
  /** Hundreds. */
  hd?: number;
  /** Fifties. */
  ff?: number;
  /** Highest score. */
  hs?: number;
  sr?: number;
  av?: number;
  /** Fours. */
  fr?: number;
  /** Sixes. */
  sx?: number;
  /** Ducks. The wire field is `du`; the upstream's own page reads `dk` and prints "--". Both are read. */
  du?: number;
  dk?: number;
  /** The innings the highest score was made in. */
  hsm?: ApiCareerMatchRef | null;
  /** Batting debut, as prose. */
  btd?: string;
  /** The debut match. Null on the leagues the upstream has not keyed. */
  btdm?: ApiCareerMatchRef | null;
}

interface ApiBowlingStats {
  m?: number;
  i?: number;
  w?: number;
  /** Best innings figures, "5/23"; "" when none. */
  bf?: string;
  /** Economy. */
  ec?: number;
  w3?: number;
  w5?: number;
  /** Bowling average. */
  bav?: number;
  /** Bowling strike rate. */
  bsr?: number;
  /** Bowling debut, as prose. */
  bod?: string;
  /** The debut match. */
  bodm?: ApiCareerMatchRef | null;
}

/** One of the last ten innings — the upstream's `c.btf` / `c.bof`. */
interface ApiFormRow {
  /** Batting: runs scored. Bowling: runs conceded. */
  r?: number;
  /** Batting: balls faced. Bowling: wickets taken. */
  b?: number;
  /** Batting only: 1 dismissed, 0 not out. */
  di?: number;
  /** Match key. */
  mf?: string;
  /** Competition code. */
  st?: number;
  /** Match-type code — the format half of the label on a form row. */
  mt?: number;
  /** Start time, epoch ms. */
  dt?: number;
  /** The opposition's team key. */
  vs?: string;
  t1f?: string;
  t2f?: string;
}

/** The whole profile payload. `t` (social embeds) is deliberately not typed. */
interface ApiPlayerOverview {
  a?: {
    bsi?: ApiPlayerBasic;
    sts?: {
      bt?: ApiCareerRow<ApiBattingStats>[];
      bl?: ApiCareerRow<ApiBowlingStats>[];
    };
  };
  /** ICC ranking positions. `type` is the discipline, `ft` the format. */
  b?: Array<{ ft: number; pos: number; type: number }>;
  c?: { btf?: ApiFormRow[]; bof?: ApiFormRow[] };
  /** Teams under contract. `st` arrives as a string here, unlike everywhere else. */
  d?: Array<{ tf?: string; st?: string | number; ft?: number }>;
  /** Competitions × formats the player has figures in. */
  h?: Array<{ st?: number; ft?: number }>;
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

/** Structure only. No links — the upstream's bios link back into their own site. */
const BIO_TAGS = new Set([
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'strong',
  'b',
  'em',
  'i',
  'ul',
  'ol',
  'li',
  'blockquote',
]);

/**
 * The upstream's bio HTML reduced to text and `BIO_TAGS`, every attribute dropped: it is
 * Google Docs paste, with inline fonts and hard-coded black.
 */
export function sanitizeBio(html: string | undefined): string | null {
  if (!html) return null;

  const clean = html
    // Script and style bodies go with their tags, or their contents would print as text.
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(\/?)([a-z0-9]+)\b[^>]*>/gi, (_match, slash: string, name: string) => {
      const tag = name.toLowerCase();
      return BIO_TAGS.has(tag) ? `<${slash}${tag}>` : '';
    })
    // The upstream leaves empty paragraphs behind between sections.
    .replace(/<p>(\s|&nbsp;)*<\/p>/gi, '')
    .trim();

  return clean.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() ? clean : null;
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

/** One form entry: batting is runs off balls; bowling is wickets (the upstream's `b`) for runs. */
function toFormEntry(
  row: ApiFormRow,
  discipline: 'batting' | 'bowling',
  names: NameCache
): PlayerFormEntry {
  const runs = row.r ?? 0;
  const balls = row.b ?? 0;
  // `vs` is the opposition, so the player's own side is the other team key.
  const opponent = cleanKey(row.vs);
  const own = cleanKey(row.t1f) === opponent ? cleanKey(row.t2f) : cleanKey(row.t1f);
  const label = (key: string) => names.t.get(key)?.sn ?? names.t.get(key)?.n ?? key;

  return {
    figures: discipline === 'batting' ? `${runs} (${balls})` : `${balls}-${runs}`,
    notOut: discipline === 'batting' && row.di === 0,
    fixture: `${label(own)} vs ${label(opponent)}`,
    format: playerFormatLabel(Number(row.st), Number(row.mt)),
    matchId: cleanKey(row.mf) || null,
    date: row.dt ? new Date(row.dt).toISOString() : null,
  };
}

/**
 * Everything the upstream knows about one player, or null for a key it does not know (the
 * route 404s on that). `a.bsi.fn` beats the mapping's name: it is the fuller spelling.
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

  const basic = raw.a?.bsi;
  // The upstream answers an unknown key with a well-formed envelope and nothing in it.
  if (!basic?.fn) return null;

  const batting = raw.a?.sts?.bt ?? [];
  const bowling = raw.a?.sts?.bl ?? [];
  const recentBatting = raw.c?.btf ?? [];
  const recentBowling = raw.c?.bof ?? [];
  const contracts = raw.d ?? [];

  const names = await resolveKeys(
    {
      t: [
        ...[...recentBatting, ...recentBowling].flatMap((r) => [r.t1f ?? '', r.t2f ?? '', r.vs ?? '']),
        ...contracts.map((c) => c.tf ?? ''),
      ].filter(Boolean),
      p: [id],
    },
    opts
  );

  // The national side, for the crest: a player has one contract row per format under st=1.
  const national = contracts.find((c) => Number(c.st) === 1)?.tf;
  const countryKey = cleanKey(national) || null;

  // One debut per format; both disciplines' rows carry it, and batting's wording comes first.
  const debuts: PlayerDebut[] = [];
  for (const row of [...batting, ...bowling]) {
    const format = playerFormatLabel(row.st, row.ft);
    const stats = row.s as ApiBattingStats & ApiBowlingStats;
    const fixture = (stats.btd ?? stats.bod ?? '').trim();
    if (!format || !fixture || debuts.some((d) => d.format === format)) continue;
    debuts.push({
      format,
      fixture,
      matchId: cleanKey(stats.btdm?.mf ?? stats.bodm?.mf) || null,
    });
  }

  return {
    id,
    name: basic.fn.trim() || names.p.get(id)?.n || id,
    image: playerImageUrl(id),
    role: playerRole(basic.rl),
    gender: basic.g === 1 ? 'Female' : 'Male',
    dateOfBirth: basic.dob ? new Date(basic.dob).toISOString() : null,
    age: ageFrom(basic.dob),
    birthPlace: basic.pob?.trim() || null,
    height: basic.h?.trim() || null,
    nationality: basic.n?.trim() || null,
    bats: joinTrait(basic.bts, basic.bp),
    bowls: joinTrait(basic.bwl, bowlingStyle(basic.bs)),
    popularShot: basic.ps?.trim() || null,
    // The upstream repeats a franchise it signed the player to more than once.
    teams: [
      ...new Set(
        (basic.tm ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      ),
    ],
    countryKey,
    countryShortName: countryKey
      ? names.t.get(countryKey)?.sn ?? names.t.get(countryKey)?.n ?? null
      : null,
    bio: sanitizeBio(basic.p),
    instagram: basic.iu?.trim() || null,
    twitter: basic.tu?.replace(/^@/, '').trim() || null,
    // A ranking's format is labelled with the international code, not the row's own.
    rankings: (raw.b ?? [])
      .map((r) => ({
        format: playerFormatLabel(1, r.ft) ?? '',
        position: r.pos,
        discipline: rankingDiscipline(r.type),
      }))
      .filter((r) => r.format && r.position > 0),
    batting: batting
      .map((row) => {
        const format = playerFormatLabel(row.st, row.ft);
        if (!format) return null;
        const s = row.s ?? {};
        return {
          format,
          international: INTERNATIONAL_COMPETITIONS.has(row.st),
          partOf: SUBSET_COMPETITIONS.has(row.st) ? playerFormatLabel(1, row.ft) : null,
          matches: s.m ?? 0,
          innings: s.i ?? 0,
          runs: s.r ?? 0,
          hundreds: s.hd ?? 0,
          fifties: s.ff ?? 0,
          highScore: s.hs ?? 0,
          strikeRate: s.sr ?? 0,
          average: s.av ?? 0,
          fours: s.fr ?? 0,
          sixes: s.sx ?? 0,
          ducks: s.du ?? s.dk ?? null,
          highScoreMatchId: cleanKey(s.hsm?.mf) || null,
        } satisfies PlayerBattingCareer;
      })
      .filter((r): r is PlayerBattingCareer => r !== null),
    bowling: bowling
      .map((row) => {
        const format = playerFormatLabel(row.st, row.ft);
        if (!format) return null;
        const s = row.s ?? {};
        return {
          format,
          international: INTERNATIONAL_COMPETITIONS.has(row.st),
          partOf: SUBSET_COMPETITIONS.has(row.st) ? playerFormatLabel(1, row.ft) : null,
          matches: s.m ?? 0,
          innings: s.i ?? 0,
          wickets: s.w ?? 0,
          economy: s.ec ?? 0,
          average: s.bav ?? 0,
          // "0-0" is the upstream's placeholder for a bowler with no figures at all.
          best: s.bf && s.bf !== '0-0' && s.bf !== '0/0' ? s.bf : null,
          threeWickets: s.w3 ?? 0,
          fiveWickets: s.w5 ?? 0,
          strikeRate: s.bsr ?? 0,
        } satisfies PlayerBowlingCareer;
      })
      .filter((r): r is PlayerBowlingCareer => r !== null),
    recentBatting: recentBatting.map((r) => toFormEntry(r, 'batting', names)),
    recentBowling: recentBowling.map((r) => toFormEntry(r, 'bowling', names)),
    debuts,
    formatCodes: [...new Set((raw.h ?? []).map((c) => Number(c.ft)).filter((ft) => ft > 0))],
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
