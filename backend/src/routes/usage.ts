import { Router } from 'express';
import { getApiCalls, resetAtUTC, QUOTA_LIMIT } from '../lib/usage';

const router = Router();

// GET /api/usage — today's CricAPI quota usage.
router.get('/', async (_req, res) => {
  try {
    const callsToday = await getApiCalls();
    res.status(200).json({
      success: true,
      data: {
        callsToday,
        limit: QUOTA_LIMIT,
        remaining: Math.max(0, QUOTA_LIMIT - callsToday),
        resetAt: resetAtUTC(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to read usage' });
  }
});

export default router;
