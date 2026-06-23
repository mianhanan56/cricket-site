import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { cache } from '../middleware/cache';

const router = Router();

// GET /api/search?q= → global search across players, teams, series, news
router.get('/', cache(60), async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      return res
        .status(400)
        .json({ success: false, data: null, error: 'Query must be at least 2 characters' });
    }

    const contains = { contains: q, mode: 'insensitive' as const };

    const [players, teams, series, news] = await Promise.all([
      prisma.player.findMany({ where: { name: contains }, take: 5 }),
      prisma.team.findMany({ where: { name: contains }, take: 5 }),
      prisma.series.findMany({ where: { name: contains }, take: 5 }),
      prisma.newsArticle.findMany({ where: { title: contains }, take: 5 }),
    ]);

    res.json({ success: true, data: { players, teams, series, news } });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Search failed' });
  }
});

export default router;
