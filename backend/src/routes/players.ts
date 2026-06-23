import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { cache } from '../middleware/cache';

const router = Router();

// GET /api/players/:id → player profile + stats
router.get('/:id', cache(60), async (req, res) => {
  try {
    const player = await prisma.player.findUnique({ where: { id: req.params.id } });
    if (!player) {
      return res.status(404).json({ success: false, data: null, error: 'Player not found' });
    }
    res.json({ success: true, data: player });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load player' });
  }
});

export default router;
