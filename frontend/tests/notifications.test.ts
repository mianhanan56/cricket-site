import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNotifications } from '../lib/notifications';

const valid = {
  id: 'a',
  kind: 'moment',
  title: 'Wicket',
  body: 'IND v AUS',
  href: '/matches/1',
  at: 1_790_000_000_000,
  read: false,
  eventKey: 'r:w1',
};

describe('stored notifications', () => {
  it('keeps a valid notification as it is', () => {
    assert.deepEqual(parseNotifications([valid]), [{ ...valid, automationId: undefined }]);
  });

  it('skips malformed rows and keeps the rest', () => {
    const rows = [
      null,
      'text',
      { ...valid, id: undefined },
      { ...valid, id: 'b', title: undefined },
      { ...valid, id: 'c', at: undefined },
      { ...valid, id: 'd', at: 1e20 },
      { ...valid, id: 'e', at: Number.NaN },
      { ...valid, id: 'ok', eventKey: 'r:w2' },
    ];
    assert.deepEqual(
      parseNotifications(rows)?.map((n) => n.id),
      ['ok']
    );
  });

  it('repairs fields it can: body, link, event id and kind', () => {
    const [n] =
      parseNotifications([
        {
          ...valid,
          body: { html: '<b>x</b>' },
          href: 'javascript:alert(1)',
          eventKey: 7,
          kind: 'mystery',
          read: 'yes',
        },
      ]) ?? [];
    assert.equal(n.body, '');
    assert.equal(n.href, undefined);
    assert.equal(n.eventKey, undefined);
    assert.equal(n.kind, 'alert');
    assert.equal(n.read, false);
  });

  it('drops a repeated id or event', () => {
    const rows = [valid, { ...valid }, { ...valid, id: 'z' }, { ...valid, id: 'y', eventKey: 'r:w9' }];
    assert.deepEqual(
      parseNotifications(rows)?.map((n) => n.id),
      ['a', 'y']
    );
  });

  it('handles an empty list, a non-list and a long list', () => {
    assert.deepEqual(parseNotifications([]), []);
    assert.equal(parseNotifications({ id: 'a' }), null);
    const many = Array.from({ length: 500 }, (_, i) => ({ ...valid, id: `n${i}`, eventKey: `k${i}` }));
    assert.equal(parseNotifications(many)?.length, 100);
  });
});
