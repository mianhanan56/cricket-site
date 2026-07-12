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
  themeColor: '#070a0f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@400;500;600;700&family=JetBrains+Mono:wght@600;700&display=swap"
          rel="stylesheet"
        />
        {/* No-flash theme: set data-theme before first paint from the stored
            preference (defaults to the light "soft aurora" theme). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var t = localStorage.getItem('theme');
                  if (t !== 'dark' && t !== 'light') t = 'light';
                  document.documentElement.setAttribute('data-theme', t);
                } catch (e) {
                  document.documentElement.setAttribute('data-theme', 'light');
                }
              })();
            `,
          }}
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
