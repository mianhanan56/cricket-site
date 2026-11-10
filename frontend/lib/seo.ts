import type { Metadata } from 'next';

export const SITE_NAME = 'PulseCrease';
export const HOME_TITLE = 'Live Cricket Scores, Fixtures & Results — PulseCrease';
export const HOME_DESCRIPTION =
  'Live cricket scores with ball-by-ball commentary, full scorecards, win probability, fixtures, results and ICC rankings for Tests, ODIs, T20Is and T20 leagues.';

// app/opengraph-image.tsx's route.
const DEFAULT_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: SITE_NAME };

export interface PageMetaInput {
  title: string;
  description?: string;
  /** Path of the page's canonical URL, query included only when it names distinct content. */
  path: string;
  /** Skip the `| PulseCrease` template. */
  absoluteTitle?: boolean;
  /** Share image URLs; 'segment' leaves them to an opengraph-image file in the route's own folder. */
  images?: string[] | 'segment';
  article?: { publishedTime?: string; authors?: string[] };
  noindex?: boolean;
}

/**
 * Every page's metadata goes through here: a page-level `openGraph`/`twitter` replaces the
 * root's wholesale in Next 14, so anything left out falls back to nothing, not the site default.
 */
export function pageMeta(input: PageMetaInput): Metadata {
  const { title, description, path, absoluteTitle, images, article, noindex } = input;
  const shareTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  // The key must be absent, not undefined, for a segment's image file to fill it.
  const shareImages = images === 'segment' ? {} : { images: images?.length ? images : [DEFAULT_IMAGE] };

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      siteName: SITE_NAME,
      locale: 'en',
      url: path,
      title: shareTitle,
      description,
      ...shareImages,
      ...(article ? { type: 'article', ...article } : { type: 'website' }),
    },
    twitter: { card: 'summary_large_image', title: shareTitle, description, ...shareImages },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
