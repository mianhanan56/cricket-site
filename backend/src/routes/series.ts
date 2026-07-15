import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { cache } from '../middleware/cache';

const router = Router();

// GET /api/series → all series (most recently active first) with a match count
// and a status derived from their matches (LIVE > UPCOMING > COMPLETED).
//
// The stored series startDate/endDate are set to the sync moment (unreliable)
// and some CricAPI names collapse to a bare year, so we normalize both from the
// series' actual matches at read time. Series with no matches are omitted.
router.get('/', cache(60), async (_req, res) => {
  try {
    const rows = await prisma.series.findMany({
      include: {
        matches: {
          select: {
            status: true,
            startTime: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    });

    const data = rows
      .filter((s) => s.matches.length > 0)
      .map(({ matches, ...s }) => {
        const statuses = matches.map((m) => m.status);
        const status = statuses.includes('LIVE')
          ? 'LIVE'
          : statuses.includes('UPCOMING')
            ? 'UPCOMING'
            : 'COMPLETED';

        // Real date range from the matches, not the placeholder series dates.
        const times = matches.map((m) => m.startTime.getTime());
        const startDate = new Date(Math.min(...times));
        const endDate = new Date(Math.max(...times));

        // Recover a usable name when the stored one is just a year: a bilateral
        // series becomes "A vs B", otherwise "<format> Series <year>".
        let name = s.name?.trim() || '';
        if (/^\d{4}$/.test(name)) {
          const teams = [...new Set(matches.flatMap((m) => [m.homeTeam.name, m.awayTeam.name]))];
          name = teams.length === 2 ? `${teams[0]} vs ${teams[1]}` : `${s.format} Series ${name}`;
        }

        return { ...s, name, startDate, endDate, status, matchCount: matches.length };
      })
      .sort((a, b) => b.endDate.getTime() - a.endDate.getTime());

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load series' });
  }
});

// GET /api/series/:id → series detail + matches (+ points table when present)
router.get('/:id', cache(60), async (req, res) => {
  try {
    const series = await prisma.series.findUnique({
      where: { id: req.params.id },
      include: {
        matches: {
          include: { homeTeam: true, awayTeam: true },
          orderBy: { startTime: 'asc' },
        },
      },
    });
    if (!series) {
      return res.status(404).json({ success: false, data: null, error: 'Series not found' });
    }
    res.json({ success: true, data: series });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load series' });
  }
});

export default router;
