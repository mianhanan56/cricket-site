import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { broadcasters } from '../lib/broadcasters';

describe('broadcasters', () => {
  it('splits joined names and tidies known ones', () => {
    assert.deepEqual(broadcasters(['Sony LIV & FANCODE', 'EURO SPORT']), [
      { name: 'Sony LIV', url: 'https://www.sonyliv.com' },
      { name: 'FanCode', url: 'https://www.fancode.com' },
      { name: 'Eurosport', url: 'https://www.eurosport.com/cricket/' },
    ]);
  });

  it('keeps the feed spelling where it names a channel, and links only known sites', () => {
    assert.deepEqual(broadcasters(['Sony Sports TEN Network', 'Sony LIV', 'DD Sports']), [
      { name: 'Sony Sports TEN Network', url: 'https://www.sonysportsnetwork.com' },
      { name: 'Sony LIV', url: 'https://www.sonyliv.com' },
      { name: 'DD Sports', url: null },
    ]);
    assert.deepEqual(broadcasters(['Unite8 Sports', 'Z5']), [
      { name: 'Unite8 Sports', url: null },
      { name: 'Z5', url: null },
    ]);
  });

  it('lists a name once', () => {
    assert.deepEqual(broadcasters(['FanCode', 'FANCODE']), [{ name: 'FanCode', url: 'https://www.fancode.com' }]);
  });
});
