import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRejectedRequest } from '../lib/api/client';

const failed = (status: number, upstreamStatus?: number) => Object.assign(new Error('api failed'), { status, upstreamStatus });

describe('isRejectedRequest', () => {
  it('reads a bad request or an upstream 400/404 as missing', () => {
    assert.equal(isRejectedRequest(failed(400)), true);
    assert.equal(isRejectedRequest(failed(404)), true);
    assert.equal(isRejectedRequest(failed(502, 400)), true);
    assert.equal(isRejectedRequest(failed(502, 404)), true);
  });

  it('reads a block, a throttle, a server error or a timeout as an outage', () => {
    for (const upstream of [401, 403, 408, 429, 500, 503]) assert.equal(isRejectedRequest(failed(502, upstream)), false, String(upstream));
    assert.equal(isRejectedRequest(failed(502)), false);
    assert.equal(isRejectedRequest(failed(429)), false);
    assert.equal(isRejectedRequest(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), false);
    assert.equal(isRejectedRequest(null), false);
  });
});
