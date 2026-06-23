import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { cache } from '../middleware/cache';

const router = Router();

// GET /api/series → all series
router.get('/', cache(60), async (_req, res) => {
  try {
    const series = await prisma.series.findMany({ orderBy: { startDate: 'desc' } });
    res.json({ success: true, data: series });
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
