import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

// NextResponse.next({ request: { headers } }) hands the rewritten request headers on as x-middleware-request-*.
const forwarded = (headers: Record<string, string>) => {
  const res = middleware(new NextRequest('https://pulsecrease.vercel.app/api/worker/matches/live', { headers }));
  const sent = (name: string) => res.headers.get(`x-middleware-request-${name}`);
  // Only the headers named here reach the Worker, so a stripped one must be missing from it.
  const kept = (res.headers.get('x-middleware-override-headers') ?? '').split(',');
  const pass = (name: string) => (kept.includes(name) ? sent(name) : null);
  return { secret: pass('x-pulse-proxy-secret'), ip: pass('x-pulse-client-ip') };
};

const spoofed = { 'x-pulse-proxy-secret': 'guess', 'x-pulse-client-ip': '6.6.6.6' };

describe('worker proxy middleware', () => {
  afterEach(() => {
    delete process.env.WORKER_PROXY_SECRET;
  });

  it("sends the secret and the reader's address, never the ones the browser sent", () => {
    process.env.WORKER_PROXY_SECRET = 'real-secret';
    assert.deepEqual(forwarded({ ...spoofed, 'x-real-ip': '203.0.113.9' }), { secret: 'real-secret', ip: '203.0.113.9' });
    assert.deepEqual(forwarded({ ...spoofed, 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }), {
      secret: 'real-secret',
      ip: '198.51.100.7',
    });
  });

  it('never sends the secret without an address, which would read as a server render', () => {
    process.env.WORKER_PROXY_SECRET = 'real-secret';
    assert.deepEqual(forwarded({}), { secret: 'real-secret', ip: 'unknown' });
    assert.deepEqual(forwarded({ 'x-forwarded-for': ' ' }), { secret: 'real-secret', ip: 'unknown' });
  });

  it('without a configured secret, strips the headers and adds nothing', () => {
    assert.deepEqual(forwarded({ ...spoofed, 'x-real-ip': '203.0.113.9' }), { secret: null, ip: null });
  });
});
