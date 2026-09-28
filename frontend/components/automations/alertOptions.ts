import { triggerSpec, type ScopeKind, type TriggerKind } from '@/lib/automations';
import type { IconName } from '../ui/Icon';

export const TRIGGER_ICON: Record<TriggerKind, IconName> = {
  MATCH_START: 'live',
  WICKET: 'flag',
  SIX: 'bolt',
  FOUR: 'arrowRight',
  FIFTY: 'star',
  HUNDRED: 'trophy',
  CLOSE_CHASE: 'signal',
  STOPPAGE: 'cloud',
  RESULT: 'check',
  TOURNAMENT_MILESTONE: 'rankings',
};

export const SCOPE_LABEL: Record<ScopeKind, string> = {
  ANY: 'Any match',
  FOLLOWED: 'What I follow',
  TEAM: 'A team',
  SERIES: 'A series',
  PLAYER: 'A player',
};

const PRESET_LABELS: Array<[TriggerKind, string]> = [
  ['MATCH_START', 'Match starts'],
  ['WICKET', 'Wicket falls'],
  ['FIFTY', 'Player scores 50'],
  ['HUNDRED', 'Player scores 100'],
  ['SIX', 'Six'],
  ['FOUR', 'Four'],
  ['CLOSE_CHASE', 'Close chase'],
  ['STOPPAGE', 'Play stops'],
  ['RESULT', 'Match finishes'],
];

// Only moments the engine can actually detect today.
export const PRESETS = PRESET_LABELS.filter(([kind]) => triggerSpec(kind).available).map(([trigger, label]) => ({
  trigger,
  label,
}));
