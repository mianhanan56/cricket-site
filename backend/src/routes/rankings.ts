import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { cache } from '../middleware/cache';

const router = Router();

// type (path) -> Ranking.role
const TYPE_TO_ROLE: Record<string, string> = {
  batting: 'BATTING',
  bowling: 'BOWLING',
  allrounder: 'ALLROUNDER',
  'all-rounder': 'ALLROUNDER',
};
const VALID_GENDERS: Record<string, string> = { men: 'MEN', women: 'WOMEN' };

// GET /api/rankings/:type — ICC rankings from the DB (?gender=men|women)
router.get('/:type', cache(60), async (req, res) => {
  try {
    const type = String(req.params.type).toLowerCase();
    const genderQ = String(req.query.gender ?? 'men').toLowerCase();

    const role = TYPE_TO_ROLE[type];
    if (!role) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Invalid ranking type. Use: batting | bowling | allrounder',
      });
    }
    const gender = VALID_GENDERS[genderQ];
    if (!gender) {
      return res
        .status(400)
        .json({ success: false, data: null, error: 'Invalid gender. Use: men | women' });
    }

    const rankings = await prisma.ranking.findMany({
      where: { role, gender },
      orderBy: { position: 'asc' },
    });

    res.status(200).json({ success: true, data: rankings });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load rankings' });
  }
});

export default router;
