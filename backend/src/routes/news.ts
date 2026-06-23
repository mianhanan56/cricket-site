import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { cache } from '../middleware/cache';

const router = Router();

// GET /api/news — latest articles, paginated (?page=1&limit=10)
router.get('/', cache(60), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    // Accept `limit` (per spec); fall back to `pageSize` for convenience.
    const limit = Math.min(50, Number(req.query.limit ?? req.query.pageSize) || 10);

    const [articles, total] = await Promise.all([
      prisma.newsArticle.findMany({
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.newsArticle.count(),
    ]);

    res.status(200).json({
      success: true,
      data: articles,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load news' });
  }
});

// GET /api/news/:slug — single article
router.get('/:slug', cache(60), async (req, res) => {
  try {
    const article = await prisma.newsArticle.findUnique({
      where: { slug: req.params.slug },
    });
    if (!article) {
      return res.status(404).json({ success: false, data: null, error: 'Article not found' });
    }
    res.status(200).json({ success: true, data: article });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: 'Failed to load article' });
  }
});

export default router;
