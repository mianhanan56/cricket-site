import type { Match, MatchNote } from '@/types';

export type StateKey =
  | 'LIVE'
  | 'UPCOMING'
  | 'TOSS'
  | 'FINISHED'
  | 'STUMPS'
  | 'LUNCH'
  | 'TEA'
  | 'DRINKS'
  | 'TIMEOUT'
  | 'BREAK'
  | 'INNINGS_BREAK'
  | 'RAIN'
  | 'BAD_LIGHT'
  | 'DELAYED'
  | 'PAUSED'
  | 'ABANDONED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'SUPER_OVER'
  | 'NO_RESULT'
  | 'TIED'
  | 'DRAWN';

/** How a state behaves visually — each family has its own crease-line motion. */
export type StateFamily =
  | 'live'
  | 'climax'
  | 'upcoming'
  | 'interval'
  | 'transition'
  | 'dormant'
  | 'weather'
  | 'hold'
  | 'void'
  | 'final';

export interface MatchStateView {
  key: StateKey;
  family: StateFamily;
  /** Short uppercase word for chips. */
  word: string;
  /** crex's own wording where it sent some. */
  label: string;
  /** Play could still happen today. */
  alive: boolean;
}

const WORD: Record<StateKey, string> = {
  LIVE: 'Live',
  UPCOMING: 'Upcoming',
  TOSS: 'Toss',
  FINISHED: 'Finished',
  STUMPS: 'Stumps',
  LUNCH: 'Lunch',
  TEA: 'Tea',
  DRINKS: 'Drinks',
  TIMEOUT: 'Timeout',
  BREAK: 'Break',
  INNINGS_BREAK: 'Innings break',
  RAIN: 'Rain delay',
  BAD_LIGHT: 'Bad light',
  DELAYED: 'Delayed',
  PAUSED: 'Paused',
  ABANDONED: 'Abandoned',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
  SUPER_OVER: 'Super over',
  NO_RESULT: 'No result',
  TIED: 'Tied',
  DRAWN: 'Drawn',
};

const FAMILY: Record<StateKey, StateFamily> = {
  LIVE: 'live',
  SUPER_OVER: 'climax',
  UPCOMING: 'upcoming',
  TOSS: 'upcoming',
  LUNCH: 'interval',
  TEA: 'interval',
  DRINKS: 'interval',
  TIMEOUT: 'interval',
  BREAK: 'interval',
  INNINGS_BREAK: 'transition',
  STUMPS: 'dormant',
  RAIN: 'weather',
  BAD_LIGHT: 'weather',
  DELAYED: 'hold',
  PAUSED: 'hold',
  ABANDONED: 'void',
  CANCELLED: 'void',
  RESCHEDULED: 'void',
  NO_RESULT: 'void',
  FINISHED: 'final',
  TIED: 'final',
  DRAWN: 'final',
};

function weatherKey(text: string): StateKey {
  if (/light/i.test(text)) return 'BAD_LIGHT';
  if (/rain|wet|weather|outfield/i.test(text)) return 'RAIN';
  return 'DELAYED';
}

function terminalKey(text: string): StateKey | null {
  if (/super over/i.test(text)) return 'SUPER_OVER';
  if (/tied|tie\b/i.test(text)) return 'TIED';
  if (/drawn|draw\b/i.test(text)) return 'DRAWN';
  if (/no result/i.test(text)) return 'NO_RESULT';
  if (/abandon/i.test(text)) return 'ABANDONED';
  if (/reschedul/i.test(text)) return 'RESCHEDULED';
  if (/cancel/i.test(text)) return 'CANCELLED';
  return null;
}

function keyFor(match: Match, note: MatchNote | null | undefined): StateKey {
  const label = note?.label ?? '';

  if (match.status === 'COMPLETED') {
    return terminalKey(label) ?? terminalKey(match.result ?? '') ?? 'FINISHED';
  }

  if (note && !note.paused && (note.kind === 'SUSPENDED' || note.kind === 'RESULT')) {
    const terminal = terminalKey(label);
    if (terminal) return terminal;
  }

  if (match.status === 'UPCOMING') {
    if (note?.kind === 'TOSS') return 'TOSS';
    if (note?.kind === 'DELAY') return weatherKey(label);
    return 'UPCOMING';
  }

  if (!note?.paused) return 'LIVE';

  switch (note.kind) {
    case 'STUMPS':
      return 'STUMPS';
    case 'BREAK':
      if (note.betweenInnings) return 'INNINGS_BREAK';
      if (/lunch/i.test(label)) return 'LUNCH';
      if (/tea/i.test(label)) return 'TEA';
      if (/drinks/i.test(label)) return 'DRINKS';
      if (/timeout/i.test(label)) return 'TIMEOUT';
      return 'BREAK';
    case 'DELAY':
      return weatherKey(label);
    case 'SUSPENDED':
      return 'PAUSED';
    default:
      return 'LIVE';
  }
}

export function matchStateOf(match: Match, note: MatchNote | null | undefined = match.note): MatchStateView {
  const key = keyFor(match, note);
  const family = FAMILY[key];
  return {
    key,
    family,
    word: WORD[key],
    label: note?.label && key !== 'LIVE' && key !== 'FINISHED' ? note.label : WORD[key],
    alive: family === 'live' || family === 'climax',
  };
}
