import { Router } from 'express';
import type { MatchStatus, MatchFormat } from '@crex/shared';
import { prisma } from '../lib/prisma';
import { cache } from '../middleware/cache';
import {
  fetchLiveMatches,
  mapStatus,
  mapFormat,
  mapStartTime,
  mapScorecard,
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

    if (wantsLive && process.env.CRICAPI_KEY && !(await quotaNearlyExhausted())) {
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

// GET /api/matches/:id — single match with full scorecard (live cache = 10s)
router.get('/:id', cache(10), async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id }, include: INCLUDE });
    if (!match) {
      return res.status(404).json({ success: false, data: null, error: 'Match not found' });
    }
    res.status(200).json({ success: true, data: match });
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
