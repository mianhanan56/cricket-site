import { ImageResponse } from 'next/og';

// The mark from public/icon.svg, full-bleed: iOS and Android mask the corners themselves.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#090b0d"/><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M72 320h368" stroke="#3a4148" stroke-width="16"/><path d="M152 248v144M360 248v144" stroke="#7c868f" stroke-width="16"/><path d="M72 320h112l36-132 44 204 36-160 22 88h130" stroke="#c6f432" stroke-width="30"/></g></svg>`;

const MARK_SRC = `data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`;

/** The mark as a square PNG. */
export function markImage(size: number): ImageResponse {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element -- rendered by next/og, not the browser
    <img src={MARK_SRC} width={size} height={size} alt="" />,
    { width: size, height: size }
  );
}

/** The link preview card: mark, name, line. */
export function shareImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 56,
          padding: '0 96px',
          background: '#090b0d',
          color: '#f1f3f5',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by next/og, not the browser */}
        <img src={MARK_SRC} width={240} height={240} alt="" style={{ borderRadius: 52 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -2 }}>PulseCrease</div>
          <div style={{ fontSize: 40, color: '#c6f432' }}>Every ball. Live.</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

/** A page's own preview card: small brand row, the page's headline, two supporting lines. */
export function shareCard({ eyebrow, headline, lines }: { eyebrow: string; headline: string; lines: string[] }): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 88px',
          background: '#090b0d',
          color: '#f1f3f5',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by next/og, not the browser */}
          <img src={MARK_SRC} width={64} height={64} alt="" style={{ borderRadius: 14 }} />
          <div style={{ fontSize: 34, fontWeight: 700 }}>PulseCrease</div>
          <div style={{ fontSize: 30, color: '#c6f432', marginLeft: 'auto' }}>{eyebrow}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: headline.length > 34 ? 68 : 84, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            {headline}
          </div>
          {lines.map((line) => (
            <div key={line} style={{ fontSize: 34, color: '#9aa3ab' }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
