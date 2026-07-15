import { Router } from 'express';
import { Prisma } from '@prisma/client';
import type { MatchStatus, MatchFormat, TeamFormEntry, SquadPlayer, PlayerRole } from '../shared/types';
import { prisma } from '../lib/prisma';
import { cache } from '../middleware/cache';
import {
  fetchLiveMatches,
  fetchMatchScorecard,
  mapStatus,
  mapFormat,
  mapStartTime,
  mapScorecard,
  mergeScorecardDetail,
  apiConfigured,
  type CricApiMatch,
} from '../services/cricketApi';
import { quotaNearlyExhausted } from '../lib/usage';

const router = Router();

const STATUSES: MatchStatus[] = ['LIVE', 'UPCOMING', 'COMPLETED'];
const FORMATS: MatchFormat[] = ['TEST', 'ODI', 'T20'];

const INCLUDE = { homeTeam: true, awayTeam: true, series: true } as const;

// Shape a CricAPI match into our API response when it isn't yet in the DB.
function toShape(m: CricApiMatch) {
  const [h = 'TBD', a = 'TBD'] = m.teams ?? [];
  const info = (n: string) => m.teamInfo?.find((t) => t.name === n);
  const short = (n: string) => (info(n)?.shortname ?? n.slice(0, 3)).toUpperCase();
  return {
    id: m.id,
    externalId: m.id,
    homeTeam: { id: `${m.id}-h`, name: h, shortName: short(h), country: h, logo: info(h)?.img ?? null },
    awayTeam: { id: `${m.id}-a`, name: a, shortName: short(a), country: a, logo: info(a)?.img ?? null },
    series: { id: m.series_id ?? '', name: m.name?.split(',').slice(-1)[0]?.trim() ?? 'International' },
    format: mapFormat(m),
    status: mapStatus(m),
    venue: m.venue ?? 'TBD',
    startTime: mapStartTime(m).toISOString(),
    result: m.matchEnded ? m.status : null,
    scorecard: mapScorecard(m),
  };
}

// GET /api/matches — LIVE comes from CricAPI (freshest) with DB fallback;
// UPCOMING/COMPLETED served from the DB (synced every 5 min).
router.get('/', cache(60), async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const format = req.query.format ? String(req.query.format).toUpperCase() : undefined;

    if (status && !STATUSES.includes(status as MatchStatus)) {
      return res.status(400).json({ success: false, data: null, error: `Invalid status. Use: ${STATUSES.join(', ')}` });
    }
    if (format && !FORMATS.includes(format as MatchFormat)) {
      return res.status(400).json({ success: false, data: null, error: `Invalid format. Use: ${FORMATS.join(', ')}` });
    }

    const wantsLive = !status || status === 'LIVE';

    if (wantsLive && apiConfigured() && !(await quotaNearlyExhausted())) {
      try {
        const raw = (await fetchLiveMatches()).filter((m) => mapStatus(m) === 'LIVE');
        const ext = raw.map((m) => m.id);
        const dbMatches = await prisma.match.findMany({
          where: { externalId: { in: ext } },
          include: INCLUDE,
        });
        const byExt = new Map(dbMatches.map((d) => [d.externalId as string, d]));

        // Prefer the persisted row (stable ids for navigation); else the raw shape.
        let live = raw.map((m) => byExt.get(m.id) ?? toShape(m));
        if (format) live = live.filter((x) => x.format === format);

        if (status === 'LIVE') {
          return res.status(200).json({ success: true, source: 'cricapi', data: live });
        }

        const others = await prisma.match.findMany({
          where: { status: { in: ['UPCOMING', 'COMPLETED'] }, ...(format ? { format } : {}) },
          include: INCLUDE,
          orderBy: { startTime: 'desc' },
        });
        return res.status(200).json({ success: true, source: 'cricapi+db', data: [...live, ...others] });
      } catch (err) {
        console.warn(`[matches] CricAPI live fetch failed (${(err as Error).message}) — using DB`);
      }
    }

    // DB path (default, or fallback, or explicit UPCOMING/COMPLETED).
    const matches = await prisma.match.findMany({
      where: { ...(status ? { status } : {}), ...(format ? { format } : {}) },
      include: INCLUDE,
      orderBy: { startTime: 'desc' },
    });
    res.status(200).json({ success: true, source: 'db', data: matches });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load matches' });
  }
});

// Last 5 completed results for a team, most recent first. W/L is derived from
// the result string ("India won by 6 wickets"); anything else counts as D/NR.
async function recentForm(teamId: string, names: string[], excludeId: string): Promise<TeamFormEntry[]> {
  const recent = await prisma.match.findMany({
    where: {
      status: 'COMPLETED',
      id: { not: excludeId },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: 'desc' },
    take: 5,
  });
  // Whole-word match so short codes can't false-positive ("IND" in "Indies").
  const needles = names.map(
    (n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  );
  return recent.map((m) => {
    const opponent = m.homeTeamId === teamId ? m.awayTeam.shortName : m.homeTeam.shortName;
    const r = m.result ?? '';
    let result: TeamFormEntry['result'] = 'D';
    if (/won/i.test(r)) result = needles.some((n) => n.test(r)) ? 'W' : 'L';
    return { matchId: m.id, result, opponent };
  });
}

// Probable XI: players from the team's country, batters first.
const ROLE_ORDER: Record<string, number> = { BATSMAN: 0, WK: 1, ALL_ROUNDER: 2, BOWLER: 3 };

async function squadFor(country: string): Promise<SquadPlayer[]> {
  const players = await prisma.player.findMany({ where: { country }, take: 30 });
  return players
    .sort(
      (a, b) =>
        (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name)
    )
    .slice(0, 11)
    .map((p) => ({ id: p.id, name: p.name, role: p.role as PlayerRole }));
}

type ScorecardJson = { innings?: Array<Record<string, unknown>>; [k: string]: unknown } | null;

// Ball-by-ball batting/bowling isn't captured by the 30-min sync (it only
// stores innings totals), so lazily fetch CricAPI's `match_scorecard` the first
// time a match detail is viewed and persist it. Completed matches never change,
// so this costs one upstream call per match, ever. Live matches re-fetch to
// stay fresh. Returns the (possibly enriched) scorecard JSON.
async function ensureScorecardLines(match: {
  id: string;
  externalId: string | null;
  status: string;
  scorecard: unknown;
}): Promise<ScorecardJson> {
  const sc = (match.scorecard as ScorecardJson) ?? { innings: [] };
  if (!match.externalId || !apiConfigured()) return sc;

  const innings = sc?.innings ?? [];
  const hasLines = innings.some(
    (i) => Array.isArray((i as { batting?: unknown[] }).batting) && (i as { batting: unknown[] }).batting.length > 0
  );
  const isLive = match.status === 'LIVE';
  // Already enriched and not live → nothing to do; don't spend quota.
  if (hasLines && !isLive) return sc;
  if (await quotaNearlyExhausted()) return sc;

  try {
    const detail = await fetchMatchScorecard(match.externalId);
    const cards = detail.scorecard ?? [];
    if (!cards.length) return sc;

    const merged = mergeScorecardDetail(sc ?? { innings: [] }, cards);
    await prisma.match.update({
      where: { id: match.id },
      data: { scorecard: merged as Prisma.InputJsonValue },
    });
    return merged;
  } catch (err) {
    console.warn(`[matches] scorecard enrich failed for ${match.id}: ${(err as Error).message}`);
    return sc;
  }
}

// GET /api/matches/:id — single match with full scorecard, plus team form and
// squads computed from the DB. Fetches ball-by-ball lines from CricAPI once and
// caches them in the DB. Live cache = 10s.
router.get('/:id', cache(10), async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id }, include: INCLUDE });
    if (!match) {
      return res.status(404).json({ success: false, data: null, error: 'Match not found' });
    }
    const scorecard = await ensureScorecardLines(match);
    const [homeForm, awayForm, homeSquad, awaySquad] = await Promise.all([
      recentForm(match.homeTeamId, [match.homeTeam.name, match.homeTeam.shortName], match.id),
      recentForm(match.awayTeamId, [match.awayTeam.name, match.awayTeam.shortName], match.id),
      squadFor(match.homeTeam.country),
      squadFor(match.awayTeam.country),
    ]);
    res.status(200).json({
      success: true,
      data: {
        ...match,
        scorecard,
        teamForm: { home: homeForm, away: awayForm },
        squads: { home: homeSquad, away: awaySquad },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load match' });
  }
});

// GET /api/matches/:id/commentary — ball by ball
router.get('/:id/commentary', cache(10), async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      select: { scorecard: true },
    });
    if (!match) {
      return res.status(404).json({ success: false, data: null, error: 'Match not found' });
    }
    const scorecard = (match.scorecard as Record<string, unknown> | null) ?? {};
    res.status(200).json({ success: true, data: scorecard.commentary ?? [] });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load commentary' });
  }
});

export default router;
