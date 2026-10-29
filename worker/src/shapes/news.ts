import { fields, type Shaper } from '../shape';

const tag = fields({ f_key: 'key', tag_name: 'name', tag_type: 'type' });

// A headline card, as every list prints it.
const cardFields = {
  // Full articles carry `_id`, cards `id`. `_id` is listed last so it wins.
  id: 'id',
  _id: 'id',
  header: 'title',
  cover_image_url: 'imageUrl',
  newsUrl: 'path',
  closed_on: 'publishedTime',
  assigned_to_name: 'author',
  tags_array: ['tags', tag],
} as const;

const card = fields(cardFields);

// The latest list carries these too: its lead prints the excerpt, and it stands in for a story the article route can't serve.
const article = fields({ ...cardFields, excerpt: 'excerpt', cover_image_caption: 'imageCaption' });

export const shapes: Record<string, Shaper> = {
  '/news/topics': fields({
    next: 'hasNext',
    topics: ['topics', fields({ published_on: 'publishedTime', articles: ['articles', article] })],
  }),
  '/news/tagged': fields({ articles: ['articles', card] }),
  '/news/article': fields({
    articleData: ['article', article],
    more_news: ['moreNews', card],
    moreFromAuthor: ['moreFromAuthor', card],
  }),
};
