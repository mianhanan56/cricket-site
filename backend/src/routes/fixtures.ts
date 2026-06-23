import { Router } from 'express';
import type { MatchFormat } from '../shared/types';
import { prisma } from '../lib/prisma';
import { cache } from '../middleware/cache';

const router = Router();

const FORMATS: MatchFormat[] = ['TEST', 'ODI', 'T20'];

// GET /api/fixtures — upcoming matches (filters: ?format=T20|ODI|TEST&date=YYYY-MM-DD&team=)
router.get('/', cache(60), async (req, res) => {
  try {
    const { date, team } = req.query;
    const format = req.query.format ? String(req.query.format).toUpperCase() : undefined;

    if (format && !FORMATS.includes(format as MatchFormat)) {
      return res
        .status(400)
        .json({ success: false, data: null, error: `Invalid format. Use one of: ${FORMATS.join(', ')}` });
    }

    const where: Record<string, unknown> = { status: 'UPCOMING' };
    if (format) where.format = format;
    if (date) {
      const day = new Date(String(date));
      if (Number.isNaN(day.getTime())) {
        return res
          .status(400)
          .json({ success: false, data: null, error: 'Invalid date. Use YYYY-MM-DD' });
      }
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      where.startTime = { gte: day, lt: next };
    }
    if (team) {
      where.OR = [{ homeTeamId: String(team) }, { awayTeamId: String(team) }];
    }

    const fixtures = await prisma.match.findMany({
      where,
      include: { homeTeam: true, awayTeam: true, series: true },
      orderBy: { startTime: 'asc' },
    });
    res.status(200).json({ success: true, data: fixtures });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load fixtures' });
  }
});

export default router;
