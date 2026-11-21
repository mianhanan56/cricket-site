import { NextResponse, type NextRequest } from 'next/server';

const SECRET_HEADER = 'x-pulse-proxy-secret';
const CLIENT_IP_HEADER = 'x-pulse-client-ip';

// Without these the Worker sees every reader as the site's own address and limits them as one.
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(SECRET_HEADER);
  headers.delete(CLIENT_IP_HEADER);

  const secret = process.env.WORKER_PROXY_SECRET;
  if (secret) {
    headers.set(SECRET_HEADER, secret);
    // Never left empty: a secret with no address is what marks a server render.
    headers.set(CLIENT_IP_HEADER, clientIp(request.headers) ?? 'unknown');
  }
  return NextResponse.next({ request: { headers } });
}

function clientIp(headers: Headers): string | null {
  const ip = headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0];
  return ip?.trim() || null;
}

export const config = { matcher: '/api/worker/:path*' };
