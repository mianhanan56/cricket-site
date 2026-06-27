const path = require('path');
const withPWAInit = require('@ducanh2912/next-pwa').default;

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
        // Backend API — stale-while-revalidate so the UI is instant + fresh.
        urlPattern: /\/api\/.*$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'crex-api',
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
  transpilePackages: ['@crex/shared'],
  sassOptions: {
    includePaths: [path.join(__dirname, 'scss')],
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = withPWA(nextConfig);
