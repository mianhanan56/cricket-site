import type { Metadata, Viewport } from 'next';
import '../scss/main.scss';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'PulseCrease — Live Cricket Scores',
    template: '%s | PulseCrease',
  },
  description: 'Every ball. Live.',
  applicationName: 'PulseCrease',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  openGraph: {
    type: 'website',
    siteName: 'PulseCrease',
    title: 'PulseCrease — Live Cricket Scores',
    description: 'Every ball. Live.',
    images: ['/icon.svg'],
  },
  twitter: {
    card: 'summary',
    title: 'PulseCrease — Live Cricket Scores',
    description: 'Every ball. Live.',
    images: ['/icon.svg'],
  },
};

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@600;700&display=swap"
          rel="stylesheet"
        />
        {process.env.NODE_ENV === 'development' && (
          // Dev-only service-worker kill switch. A SW registered on this origin
          // by a production run (or another app on localhost:3000) serves stale
          // CacheFirst chunks and breaks dev with webpack "reading 'call'"
          // errors. Inline in the HTML so it runs even when cached chunks fail.
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function (rs) {
                    rs.forEach(function (r) { r.unregister(); });
                  });
                  if (window.caches && caches.keys) {
                    caches.keys().then(function (ks) {
                      ks.forEach(function (k) { caches.delete(k); });
                    });
                  }
                }
              `,
            }}
          />
        )}
      </head>
      <body>
        <div className="app-shell">
          <Navbar />
          <main className="main-content">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
