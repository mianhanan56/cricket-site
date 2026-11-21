import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = FakeSocket.CONNECTING;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeSocket.last = this;
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  deliver(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const noop = () => undefined;

describe('live socket', () => {
  before(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    Object.assign(globalThis, {
      window: { addEventListener: noop },
      document: { addEventListener: noop, visibilityState: 'visible' },
      WebSocket: FakeSocket,
    });
  });
  after(() => mock.timers.reset());

  it('drops a topic back to polling on a stale frame, and picks it up on its next update', async () => {
    const { isTopicLive, onLiveChange, subscribeLive } = await import('../lib/live/socket');
    let changes = 0;
    const offChange = onLiveChange(() => changes++);
    const frames: string[] = [];
    const off = subscribeLive('card:A1', (frame) => frames.push(frame.type));
    const ws = FakeSocket.last!;
    ws.open();

    const update = (seq: number) => ({ type: 'card:update', topic: 'card:A1', epoch: 'e', seq, ts: 0, data: [] });
    ws.deliver(update(1));
    assert.equal(isTopicLive('card:A1'), true);

    const seen = changes;
    ws.deliver({ type: 'topic:stale', topic: 'card:A1', epoch: 'e', ts: 0 });
    assert.equal(isTopicLive('card:A1'), false);
    assert.ok(changes > seen);
    assert.deepEqual(frames, ['card:update']);

    ws.deliver(update(2));
    assert.equal(isTopicLive('card:A1'), true);
    assert.deepEqual(frames, ['card:update', 'card:update']);

    off();
    offChange();
    mock.timers.tick(60_000);
  });
});
