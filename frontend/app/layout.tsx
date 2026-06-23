import type { Metadata, Viewport } from 'next';
import '../styles/globals.scss';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'CREX Clone — Live Cricket Scores, News & Updates',
    template: '%s | CREX Clone',
  },
  description:
    'Live cricket scores, ball-by-ball commentary, fixtures, series, player profiles, ICC rankings and the latest cricket news.',
  applicationName: 'CREX Clone',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  openGraph: {
    type: 'website',
    siteName: 'CREX Clone',
    title: 'CREX Clone — Live Cricket Scores, News & Updates',
    description: 'Live cricket scores, fixtures, rankings and news.',
    images: ['/icon.svg'],
  },
  twitter: {
    card: 'summary',
    title: 'CREX Clone — Live Cricket Scores',
    description: 'Live cricket scores, fixtures, rankings and news.',
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
