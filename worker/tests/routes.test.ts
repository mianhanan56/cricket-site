import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute, ParamError, readParams, ROUTES, upstreamTarget } from '../src/routes';

const read = (path: string, query: string) => {
  const route = matchRoute(path);
  assert.ok(route, `no route ${path}`);
  return readParams(route, new URLSearchParams(query));
};

test('every string and list param is bounded by a set or a pattern', () => {
  for (const route of ROUTES) {
    for (const [name, spec] of Object.entries(route.params ?? {})) {
      if (spec.type === 'int') continue;
      const bounded = spec.type === 'list' ? spec.pattern : spec.enum ?? spec.pattern;
      assert.ok(bounded, `${route.match} ${name} goes upstream unbounded`);
    }
  }
});

test('keys as the upstream issues them pass', () => {
  assert.deepEqual(read('/match/info', 'key=13Q6'), { key: '13Q6' });
  assert.deepEqual(read('/series/matches', 'key=2MT'), { key: '2MT' });
  assert.deepEqual(read('/player/overview', 'key=1IG'), { key: '1IG' });
});

test('a keyed route refuses anything that is not a short alphanumeric key', () => {
  const keyed = ROUTES.filter((r) => r.params?.key && r.match !== '/news/tagged').map((r) => r.match);
  assert.ok(keyed.length >= 9);
  for (const path of keyed) {
    for (const bad of ['A'.repeat(13), 'AUDIT KEY', 'a.b', '^2MT', "1' OR '1'='1", '../x', 'a/b', '']) {
      assert.throws(() => read(path, `key=${encodeURIComponent(bad)}`), ParamError, `${path} took ${JSON.stringify(bad)}`);
    }
  }
});

test('the commentary cursor is digits only', () => {
  assert.deepEqual(read('/match/commentary', 'matchKey=13Q6'), { matchKey: '13Q6', lastDocId: '' });
  assert.equal(read('/match/commentary', 'matchKey=13Q6&lastDocId=1794419220825').lastDocId, '1794419220825');
  assert.throws(() => read('/match/commentary', 'matchKey=13Q6&lastDocId=AUDITCURSOR1'), ParamError);
  assert.throws(() => read('/match/commentary', 'matchKey=a.b'), ParamError);
});

test('the rankings page is a small number, not free text', () => {
  assert.equal(read('/rankings/players', '').page, '1');
  assert.equal(read('/rankings/players', 'page=2').page, '2');
  for (const bad of ['AUDITPAGE', '0', '1;DROP', '100', '-1', '1 OR 1']) {
    assert.throws(() => read('/rankings/players', `page=${encodeURIComponent(bad)}`), ParamError, bad);
  }
});

test('a mapping list keeps well-formed keys and drops the rest', () => {
  const params = read('/mapping', `t=11,70,${'B'.repeat(40)},a.b,11&p=1IG,<script>`);
  assert.deepEqual(params.t, ['11', '70']);
  assert.deepEqual(params.p, ['1IG']);
  assert.deepEqual(params.v, []);
});

test('a mapping list is capped', () => {
  const many = Array.from({ length: 201 }, (_, i) => `K${i}`).join(',');
  assert.throws(() => read('/mapping', `t=${many}`), ParamError);
});

test('integers stay inside their range and set', () => {
  assert.equal(read('/fixtures', 'page=-60').page, -60);
  assert.throws(() => read('/fixtures', 'page=999'), ParamError);
  assert.throws(() => read('/fixtures', 'page=1.5'), ParamError);
  assert.throws(() => read('/fixtures', 'format=9'), ParamError);
});

test('an error names the param, never the value sent', () => {
  try {
    read('/match/info', 'key=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    assert.fail('accepted');
  } catch (err) {
    assert.ok(err instanceof ParamError);
    assert.ok(!err.message.includes('script'));
  }
});

test('a param filled into the upstream path is encoded and leaves the query', () => {
  const route = matchRoute('/news/tagged');
  assert.ok(route);
  const target = upstreamTarget(route, readParams(route, new URLSearchParams('type=t&key=O')));
  assert.equal(target.path, '/api/articles/filter/t_O');
  assert.ok(!target.query.includes('key='));
});
