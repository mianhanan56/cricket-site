import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

interface Config {
  poweredByHeader?: boolean;
  images?: { unoptimized?: boolean; remotePatterns?: unknown[] };
  headers(): Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
}

// next.config.js reads NODE_ENV as it loads: the policy is a production header.
function loadConfig(): Config {
  const before = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'production' });
  try {
    return createRequire(import.meta.url)('../next.config.js') as Config;
  } finally {
    Object.assign(process.env, { NODE_ENV: before });
  }
}

describe('response headers', async () => {
  const config = loadConfig();
  const [rule] = await config.headers();
  const header = (name: string) => rule.headers.find((h) => h.key === name)?.value;
  const csp = header('Content-Security-Policy') ?? '';
  const directive = (name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

  it('covers every path', () => {
    assert.equal(rule.source, '/:path*');
  });

  it('refuses framing, sniffing and plugins', () => {
    assert.equal(header('X-Frame-Options'), 'DENY');
    assert.equal(header('X-Content-Type-Options'), 'nosniff');
    assert.equal(directive('frame-ancestors'), "frame-ancestors 'none'");
    assert.equal(directive('object-src'), "object-src 'none'");
    assert.equal(directive('base-uri'), "base-uri 'self'");
    assert.ok(header('Referrer-Policy'));
    assert.ok(header('Permissions-Policy'));
  });

  it('loads script only from this origin and never evaluates strings', () => {
    assert.equal(directive('script-src'), "script-src 'self' 'unsafe-inline'");
    assert.ok(!csp.includes('unsafe-eval'));
    assert.ok(!/script-src[^;]*(\*|https:)/.test(csp));
  });

  it('lets the browser reach only this origin and the Worker', () => {
    const sources = directive('connect-src').split(' ').slice(1);
    assert.equal(sources[0], "'self'");
    assert.equal(sources.length, 3);
    assert.ok(sources.slice(1).every((s) => /^(https|wss):\/\/[a-z0-9.-]+$/.test(s)), sources.join(' '));
  });

  it('does not announce the framework or expose the image optimizer', () => {
    assert.equal(config.poweredByHeader, false);
    assert.equal(config.images?.unoptimized, true);
    assert.equal(config.images?.remotePatterns, undefined);
  });
});
