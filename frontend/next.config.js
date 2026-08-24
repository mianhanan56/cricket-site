const path = require('path');
const withPWAInit = require('@ducanh2912/next-pwa').default;

// The Worker host the client bundle will be built against. Everything the app
// renders comes from here, so it is also the runtime-caching pattern below.
const WORKER_URL =
  process.env.NEXT_PUBLIC_CREX_WORKER_URL ??
  'https://pulsecrease-crex.pulse-cricket.workers.dev';

/**
 * The Worker's origin as a pattern the service worker can actually evaluate.
 *
 * It has to be a RegExp rather than the obvious `({url}) => url.origin === …`
 * predicate: Workbox serialises a route matcher by calling `toString()` on it,
 * so a closure over `WORKER_URL` reaches sw.js as a free variable and throws a
 * ReferenceError on the first request it is asked about — taking the whole
 * service worker down with it. A RegExp serialises as a literal, value included.
 */
const WORKER_ORIGIN_PATTERN = new RegExp(
  `^${new URL(WORKER_URL).origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`,
  'i'
);

// `NEXT_PUBLIC_*` is inlined into the client bundle at build time, so a local
// override does not just affect the machine doing the building — it ships. A
// build that pointed at localhost produced a deployable, completely dead site
// (empty sitemap, every fetch refused), and did it silently. Fail the build
// instead. Use `npm run local` to develop against a local Worker.
if (
  process.env.NODE_ENV === 'production' &&
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(WORKER_URL)
) {
  throw new Error(
    `NEXT_PUBLIC_CREX_WORKER_URL points at ${WORKER_URL} in a production build. ` +
      'That URL is inlined into the client bundle and would ship to production. ' +
      'Unset it (or point it at the deployed Worker) and rebuild.'
  );
}

const withPWA = withPWAInit({
  dest: 'public',
  // Don't run the service worker in dev (avoids caching headaches while coding).
  disable: process.env.NODE_ENV === 'development',
  register: true,
  cacheOnFrontEndNav: true,
  workboxOptions: {
    // Precaching of build assets is automatic; these handle runtime requests.
    runtimeCaching: [
      {
        // The Worker that serves every page's data. This used to match `/api/*`
        // on our own origin, which nothing serves now that the Express backend
        // is gone — the data is cross-origin, so the pattern has to name the
        // host.
        //
        // Matched by ORIGIN, read from the same env var the client is built
        // with, rather than by a hardcoded `*.workers.dev` pattern: moving the
        // Worker to a custom domain used to silently stop the service worker
        // matching it at all, with nothing to notice.
        //
        // NetworkFirst, not StaleWhileRevalidate. SWR answers from cache and
        // revalidates behind the response, which on a 2-second poll means every
        // tick renders the PREVIOUS tick's body — the service worker quietly
        // undoing the 2s poll/2s edge-TTL pairing the whole live path is built
        // on. NetworkFirst goes to the network first and falls back to cache
        // only when it is genuinely unreachable, which is the behaviour the
        // fallback was wanted for.
        urlPattern: WORKER_ORIGIN_PATTERN,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'crex-api',
          // Long enough to ride out a dropped connection, short enough that the
          // network almost always wins the race on a working one.
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 64, maxAgeSeconds: 300 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // Next.js static assets.
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static',
          expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        // Images.
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'images',
          expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        // App shell / pages.
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // `next lint` and the build's lint pass only cover app/, components/, lib/
    // and pages/ by default, which silently skipped these three. Listed so the
    // build checks everything the app actually ships.
    dirs: ['app', 'components', 'lib', 'hooks', 'data', 'types'],
  },
  sassOptions: {
    includePaths: [path.join(__dirname, 'scss')],
  },
  images: {
    // Pinned to the hosts crex actually serves media from. `hostname: '**'` made
    // the image optimizer an open proxy — anyone could route arbitrary remote
    // images through this deployment, on our bandwidth and under our domain.
    // Nothing uses next/image yet, which is the cheapest moment to close it.
    // The one host crex serves media from: team crests (TEAM_LOGO_BASE) and
    // player portraits (PLAYER_IMAGE_BASE) are both on it. See lib/crex.
    remotePatterns: [{ protocol: 'https', hostname: 'cricketvectors.akamaized.net' }],
  },
};

module.exports = withPWA(nextConfig);
