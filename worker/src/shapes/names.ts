import { fields, type Shaper } from '../shape';

const named = { f_key: 'key', n: 'name' } as const;

const team = fields({
  ...named,
  sn: 'shortName',
  // "0-#8F65E6": a mode flag, then the hex.
  cc: 'primaryColor',
  uc: 'secondaryColor',
});

const buckets = fields({
  t: ['teams', team],
  v: ['venues', fields(named)],
  s: ['series', fields({ ...named, sn: 'shortName' })],
  p: ['players', fields(named)],
  u: ['umpires', fields(named)],
});

export const shapes: Record<string, Shaper> = {
  // Empty buckets are left out; the frontend reads a missing one as empty.
  '/mapping': (value) => {
    const out = buckets(value);
    if (typeof out !== 'object' || out === null) return out;
    return Object.fromEntries(Object.entries(out).filter(([, list]) => !Array.isArray(list) || list.length));
  },
};
