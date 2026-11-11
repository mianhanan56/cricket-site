import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isKey } from '../lib/api/names';
import { parseScheduledMatchId } from '../lib/api/schedule';

describe('ids taken from a URL', () => {
  it('accepts keys as the upstream issues them', () => {
    for (const key of ['13Q6', '2MT', 'O', '11', '1IG']) assert.ok(isKey(key), key);
  });

  it('refuses anything else before a request is made', () => {
    for (const key of ['', 'A'.repeat(13), 'a b', 'a.b', '^2MT', '../x', "1'--", 'a/b', '<x>']) {
      assert.equal(isKey(key), false, JSON.stringify(key));
    }
  });

  it('reads a fixture id only when both parts are keys', () => {
    assert.deepEqual(parseScheduledMatchId('fx-2MT-52378'), { seriesKey: '2MT', rowId: '52378' });
    for (const id of ['fx-2MT-', 'fx--52378', `fx-${'A'.repeat(40)}-1`, 'fx-2MT-1%20OR%201', 'fx-a.b-1', '13Q6']) {
      assert.equal(parseScheduledMatchId(id), null, id);
    }
  });
});
