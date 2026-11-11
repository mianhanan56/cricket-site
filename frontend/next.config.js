const path = require('path');
const withPWAInit = require('@ducanh2912/next-pwa').default;

// Everything the app renders comes from this Worker.
const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL ??
  'https://pulsecrease-api.pulse-cricket.workers.dev';

// The browser reaches the Worker through this same-origin path, rewritten below, because
// some networks block *.workers.dev. lib/api/client.ts uses the same prefix.
const WORKER_PROXY_PATH = '/api/worker';

// A RegExp, not a `({url}) => …` predicate: Workbox serialises matchers with toString(),
// so a closure's free variables reach sw.js undefined and take the service worker down.
// Ball-by-ball routes are left out: a saved copy is a score going backwards, and
// routing them through the service worker only adds a hop to every poll.
const WORKER_LIVE_PATHS = '(matches/live|match/(scorecard|commentary)|live)(\\?|$)';
const WORKER_PROXY_PATTERN = new RegExp(`^https?://[^/]+${WORKER_PROXY_PATH}/(?!${WORKER_LIVE_PATHS})`, 'i');

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
    `NEXT_PUBLIC_WORKER_URL points at ${WORKER_URL} in a production build. ` +
      'That URL is inlined into the client bundle and would ship to production. ' +
      'Unset it (or point it at the deployed Worker) and rebuild.'
  );
}

// The browser reads the Worker through /api/worker; only the live socket dials it directly.
const WORKER_ORIGIN = new URL(WORKER_URL).origin;
const LIVE_ORIGIN = new URL(process.env.NEXT_PUBLIC_LIVE_WS_URL ?? WORKER_URL).origin.replace(/^http/, 'ws');
// The Vercel toolbar on preview deployments loads from these.
const PREVIEW = process.env.VERCEL_ENV === 'preview';

// Static rather than nonce-based: a nonce makes every page dynamic. Next's own bootstrap is
// inline script, hence 'unsafe-inline' — this policy limits where code, frames and requests
// may go, and is not a defence against injected inline script.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${PREVIEW ? ' https://vercel.live' : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `font-src 'self' data:${PREVIEW ? ' https://vercel.live https://assets.vercel.com' : ''}`,
  `connect-src 'self' ${WORKER_ORIGIN} ${LIVE_ORIGIN}${PREVIEW ? ' https://vercel.live wss://ws-us3.pusher.com' : ''}`,
  `frame-src ${PREVIEW ? 'https://vercel.live' : "'none'"}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = [
  // `next dev` needs eval for hot reload, so the policy is sent by production builds only.
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: CSP }] : []),
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
];

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
        // The Worker apart from live scores, matched by origin from the same env var the client is
        // built with. On a slow link the last copy answers after the timeout instead of a spinner;
        // the network reply still lands in the cache for next time.
        urlPattern: WORKER_PROXY_PATTERN,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'worker-api',
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 },
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
        // A cached page's scores are only a first paint: the live poll replaces them.
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Switching tabs asks the server again instead of replaying the router's copy
    // of a page for up to 30s (5 min if static). The server's per-fetch revalidate
    // still decides whether the upstream is actually called, so nothing is over-fetched.
    staleTimes: { dynamic: 0, static: 30 },
  },
  eslint: {
    // `next lint` and the build's lint pass only cover app/, components/, lib/
    // and pages/ by default, which silently skipped these three. Listed so the
    // build checks everything the app actually ships.
    dirs: ['app', 'components', 'lib', 'hooks', 'data', 'types'],
  },
  async rewrites() {
    return [{ source: `${WORKER_PROXY_PATH}/:path*`, destination: `${WORKER_URL.replace(/\/$/, '')}/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  sassOptions: {
    includePaths: [path.join(__dirname, 'scss')],
  },
  images: {
    // Nothing uses next/image, so /_next/image is switched off rather than left open to
    // anyone as a resizing proxy. Adding next/image later means allowlisting its hosts here.
    unoptimized: true,
  },
};

module.exports = withPWA(nextConfig);
