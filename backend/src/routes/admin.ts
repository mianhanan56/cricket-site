import { Router } from 'express';
import { runSync } from '../jobs/syncData';

const router = Router();

// GET /api/admin/sync — manually trigger an immediate CricAPI sync and report
// how many matches were upserted. Useful for forcing fresh data on demand.
router.get('/sync', async (_req, res) => {
  try {
    const synced = await runSync();
    res.status(200).json({ success: true, synced, at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
