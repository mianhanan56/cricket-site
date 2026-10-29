import type { Shaper } from '../shape';
import { shapes as commentary } from './commentary';
import { shapes as match } from './match';
import { shapes as matches } from './matches';
import { shapes as names } from './names';
import { shapes as news } from './news';
import { shapes as player } from './player';
import { shapes as schedule } from './schedule';
import { shapes as standings } from './standings';

/** Each Worker route's shape, by its path. */
export const SHAPES: Record<string, Shaper> = {
  ...names,
  ...matches,
  ...match,
  ...commentary,
  ...schedule,
  ...standings,
  ...player,
  ...news,
};
