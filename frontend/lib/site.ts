// Vercel sets VERCEL_PROJECT_PRODUCTION_URL (no scheme) on every deployment; without
// it or the explicit override, robots, sitemap and metadata URLs would name localhost.
const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? (vercelProduction ? `https://${vercelProduction}` : 'http://localhost:3005');

// Public contact address. Null hides the contact lines on /about and /privacy until one is chosen.
export const CONTACT_EMAIL: string | null = null;
