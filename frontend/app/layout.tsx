import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import '../scss/main.scss';
import Navbar from '../components/layout/Navbar';
import BottomNav from '../components/layout/BottomNav';
import NavigationTracker from '../components/layout/NavigationTracker';
import Footer from '../components/layout/Footer';
import SearchOverlay, { SearchHotkeys } from '../components/search/SearchOverlay';
import NotificationCenter from '../components/notifications/NotificationCenter';
import Toaster from '../components/notifications/Toaster';
import AutomationEngine from '../components/automations/AutomationEngine';
import { Analytics } from '@vercel/analytics/next';

const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3005';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'PulseCrease — Live Cricket Intelligence',
    template: '%s | PulseCrease',
  },
  description: 'Every ball. Live.',
  applicationName: 'PulseCrease',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  openGraph: {
    type: 'website',
    siteName: 'PulseCrease',
    title: 'PulseCrease — Live Cricket Intelligence',
    description: 'Every ball. Live.',
    images: ['/icon.svg'],
  },
  twitter: {
    card: 'summary',
    title: 'PulseCrease — Live Cricket Intelligence',
    description: 'Every ball. Live.',
    images: ['/icon.svg'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#090b0d' },
    { media: '(prefers-color-scheme: light)', color: '#f1f3f5' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        {/* Theme is set before first paint so there is no flash. Dark unless chosen otherwise. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
        {process.env.NODE_ENV === 'development' && (
          // Dev-only: a service worker left by a production run serves stale chunks.
          <script
            dangerouslySetInnerHTML={{
              __html: `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});if(window.caches&&caches.keys){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});});}}`,
            }}
          />
        )}
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <NavigationTracker />
        <SearchHotkeys />
        <div className="app-shell">
          <Navbar />
          <main id="main" className="main-content">
            {children}
          </main>
          <Footer />
        </div>
        <BottomNav />
        <SearchOverlay />
        <NotificationCenter />
        <Toaster />
        <AutomationEngine />
        <Analytics />
      </body>
    </html>
  );
}
