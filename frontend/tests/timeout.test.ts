import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { withTimeout } from '../lib/timeout';

const nativeAny = AbortSignal.any;
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withTimeout', () => {
  afterEach(() => {
    AbortSignal.any = nativeAny;
  });

  it('aborts on the deadline, and with the caller', async () => {
    const alone = withTimeout(10);
    await settle(30);
    assert.equal(alone?.aborted, true);

    const caller = new AbortController();
    const linked = withTimeout(10_000, caller.signal);
    caller.abort();
    assert.equal(linked?.aborted, true);
  });

  it('keeps the deadline on a caller signal where AbortSignal.any is missing', async () => {
    // @ts-expect-error simulating Safari < 17.4
    AbortSignal.any = undefined;
    const caller = new AbortController();
    const linked = withTimeout(10, caller.signal);
    assert.notEqual(linked, caller.signal);
    await settle(30);
    assert.equal(linked?.aborted, true);
    assert.equal(caller.signal.aborted, false);

    const early = new AbortController();
    const followed = withTimeout(10_000, early.signal);
    early.abort('gone');
    assert.equal(followed?.aborted, true);
    assert.equal(followed?.reason, 'gone');
  });
});
