'use client';

import type { Match, MatchEvent } from '@/types';
import type { PulseBall } from './pulse';
import { createPersisted, isRecord, newId } from './persisted';
import { liveEquation } from './telemetry';
import { formatTeamScore, inningsFor } from './innings';
import { matchStateOf } from './matchState';
import type { NotificationKind } from './notifications';

// ---------------------------------------------------------------- Model

export type TriggerKind =
  | 'MATCH_START'
  | 'WICKET'
  | 'SIX'
  | 'FOUR'
  | 'FIFTY'
  | 'HUNDRED'
  | 'CLOSE_CHASE'
  | 'STOPPAGE'
  | 'RESULT'
  | 'TOURNAMENT_MILESTONE';

export type ScopeKind = 'ANY' | 'FOLLOWED' | 'TEAM' | 'SERIES' | 'PLAYER';

export interface AutomationScope {
  kind: ScopeKind;
  id?: string;
  name?: string;
}

export interface AutomationAction {
  inApp: boolean;
  system: boolean;
}

export interface Automation {
  id: string;
  trigger: TriggerKind;
  scope: AutomationScope;
  action: AutomationAction;
  enabled: boolean;
  createdAt: number;
  fired: number;
  lastFiredAt: number | null;
}

export interface TriggerSpec {
  kind: TriggerKind;
  label: string;
  /** "a wicket falls" — completes "When …". */
  phrase: string;
  /** Needs the ball feed rather than the match list. */
  feed: boolean;
  scopes: ScopeKind[];
  notification: NotificationKind;
  available: boolean;
}

const MATCH_SCOPES: ScopeKind[] = ['ANY', 'FOLLOWED', 'TEAM', 'SERIES'];

export const TRIGGERS: TriggerSpec[] = [
  { kind: 'MATCH_START', label: 'Match starts', phrase: 'a match starts', feed: false, scopes: MATCH_SCOPES, notification: 'live', available: true },
  { kind: 'WICKET', label: 'Wicket falls', phrase: 'a wicket falls', feed: false, scopes: MATCH_SCOPES, notification: 'moment', available: true },
  { kind: 'SIX', label: 'Six is hit', phrase: 'a six is hit', feed: true, scopes: MATCH_SCOPES, notification: 'moment', available: true },
  { kind: 'FOUR', label: 'Four is hit', phrase: 'a four is hit', feed: true, scopes: MATCH_SCOPES, notification: 'moment', available: true },
  { kind: 'FIFTY', label: 'Fifty reached', phrase: 'a batter reaches 50', feed: true, scopes: ['ANY', 'FOLLOWED', 'TEAM', 'SERIES', 'PLAYER'], notification: 'moment', available: true },
  { kind: 'HUNDRED', label: 'Century reached', phrase: 'a batter reaches 100', feed: true, scopes: ['ANY', 'FOLLOWED', 'TEAM', 'SERIES', 'PLAYER'], notification: 'moment', available: true },
  { kind: 'CLOSE_CHASE', label: 'Chase gets tight', phrase: 'the required rate passes the current rate', feed: false, scopes: MATCH_SCOPES, notification: 'alert', available: true },
  { kind: 'STOPPAGE', label: 'Play stops', phrase: 'play stops for rain, bad light or a break', feed: false, scopes: MATCH_SCOPES, notification: 'alert', available: true },
  { kind: 'RESULT', label: 'Match finishes', phrase: 'a match finishes', feed: false, scopes: MATCH_SCOPES, notification: 'result', available: true },
  { kind: 'TOURNAMENT_MILESTONE', label: 'Tournament milestone', phrase: 'a player reaches 1,000 tournament runs', feed: false, scopes: ['SERIES', 'PLAYER'], notification: 'moment', available: false },
];

export const triggerSpec = (kind: TriggerKind): TriggerSpec =>
  TRIGGERS.find((t) => t.kind === kind) as TriggerSpec;

export function scopePhrase(scope: AutomationScope): string {
  switch (scope.kind) {
    case 'ANY':
      return 'in any match';
    case 'FOLLOWED':
      return 'in my teams’ matches';
    case 'TEAM':
      return `in ${scope.name ?? 'this team'}’s matches`;
    case 'SERIES':
      return `in ${scope.name ?? 'this series'}`;
    case 'PLAYER':
      return `for ${scope.name ?? 'this player'}`;
  }
}

export function describeAutomation(a: Pick<Automation, 'trigger' | 'scope'>): string {
  const spec = triggerSpec(a.trigger);
  if (a.scope.kind === 'PLAYER' && (a.trigger === 'FIFTY' || a.trigger === 'HUNDRED')) {
    return `When ${a.scope.name ?? 'this player'} reaches ${a.trigger === 'FIFTY' ? 50 : 100}`;
  }
  return `When ${spec.phrase} ${scopePhrase(a.scope)}`;
}

const VALID_TRIGGERS = new Set(TRIGGERS.map((t) => t.kind));

export const automationsStore = createPersisted<Automation[]>('pc.automations', [], (raw) =>
  Array.isArray(raw)
    ? (raw.filter(
        (a) => isRecord(a) && typeof a.id === 'string' && VALID_TRIGGERS.has(a.trigger as TriggerKind)
      ) as Automation[])
    : null
);

export const useAutomations = automationsStore.use;

export function addAutomation(input: Pick<Automation, 'trigger' | 'scope' | 'action'>): Automation {
  const item: Automation = {
    ...input,
    id: newId(),
    enabled: true,
    createdAt: Date.now(),
    fired: 0,
    lastFiredAt: null,
  };
  automationsStore.set((prev) => [item, ...prev]);
  return item;
}

export const updateAutomation = (id: string, patch: Partial<Automation>) =>
  automationsStore.set((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

export const removeAutomation = (id: string) =>
  automationsStore.set((prev) => prev.filter((a) => a.id !== id));

export function recordFire(id: string) {
  automationsStore.set((prev) =>
    prev.map((a) => (a.id === id ? { ...a, fired: a.fired + 1, lastFiredAt: Date.now() } : a))
  );
}

/** Ready-made rules, one tap to add. */
export const TEMPLATES: Array<Pick<Automation, 'trigger' | 'scope'>> = [
  { trigger: 'MATCH_START', scope: { kind: 'FOLLOWED' } },
  { trigger: 'WICKET', scope: { kind: 'FOLLOWED' } },
  { trigger: 'CLOSE_CHASE', scope: { kind: 'ANY' } },
  { trigger: 'HUNDRED', scope: { kind: 'ANY' } },
  { trigger: 'RESULT', scope: { kind: 'FOLLOWED' } },
];

// ---------------------------------------------------------------- Evaluation

export interface ScopeContext {
  followedTeams: Set<string>;
  followedSeries: Set<string>;
}

export function matchInScope(scope: AutomationScope, m: Match, ctx: ScopeContext): boolean {
  switch (scope.kind) {
    case 'ANY':
    case 'PLAYER':
      return true;
    case 'FOLLOWED':
      return (
        ctx.followedTeams.has(m.homeTeam.id) ||
        ctx.followedTeams.has(m.awayTeam.id) ||
        ctx.followedSeries.has(m.series.id)
      );
    case 'TEAM':
      return m.homeTeam.id === scope.id || m.awayTeam.id === scope.id;
    case 'SERIES':
      return m.series.id === scope.id;
  }
}

export interface Firing {
  key: string;
  trigger: TriggerKind;
  matchId: string;
  title: string;
  body: string;
  href: string;
}

const fixture = (m: Match) => `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`;

function scoreLine(m: Match): string {
  const multi = m.format === 'TEST';
  return [m.homeTeam, m.awayTeam]
    .map((t) => {
      const s = formatTeamScore(inningsFor(m, t), multi);
      return s ? `${t.shortName} ${s}` : null;
    })
    .filter(Boolean)
    .join(' · ');
}

/** Events visible from two consecutive match-list snapshots. */
export function listFirings(prev: Match[], next: Match[]): Firing[] {
  const before = new Map(prev.map((m) => [m.id, m]));
  const out: Firing[] = [];

  for (const m of next) {
    const was = before.get(m.id);
    if (!was) continue;
    const href = `/matches/${m.id}`;

    if (was.status === 'UPCOMING' && m.status === 'LIVE') {
      out.push({ key: `start:${m.id}`, trigger: 'MATCH_START', matchId: m.id, href, title: `${fixture(m)} is live`, body: m.series.name });
    }

    if (was.status !== 'COMPLETED' && m.status === 'COMPLETED') {
      out.push({ key: `result:${m.id}`, trigger: 'RESULT', matchId: m.id, href, title: m.result ?? `${fixture(m)} has finished`, body: scoreLine(m) || fixture(m) });
    }

    if (m.status === 'LIVE') {
      const now = (m.scorecard?.innings ?? []).find((i) => i.phase === 'CURRENT');
      const then = now && (was.scorecard?.innings ?? []).find(
        (i) => i.teamId === now.teamId && i.inningsNumber === now.inningsNumber
      );
      if (now && then && now.wickets > then.wickets && now.wickets <= 10) {
        out.push({
          key: `wkt:${m.id}:${now.teamId}:${now.inningsNumber}:${now.wickets}`,
          trigger: 'WICKET',
          matchId: m.id,
          href,
          title: `Wicket — ${now.teamShortName} ${now.runs}/${now.wickets}`,
          body: `${fixture(m)} · ${now.overs} ov`,
        });
      }

      const eqNow = liveEquation(m);
      const eqThen = liveEquation(was);
      if (
        eqNow?.rrr != null && eqNow.crr != null && eqNow.rrr > eqNow.crr &&
        eqThen?.rrr != null && eqThen.crr != null && eqThen.rrr <= eqThen.crr
      ) {
        out.push({
          key: `chase:${m.id}:${eqNow.ballsBowled}`,
          trigger: 'CLOSE_CHASE',
          matchId: m.id,
          href,
          title: `${eqNow.battingTeam.shortName} need ${eqNow.need} from ${eqNow.ballsLeft}`,
          body: `Required ${eqNow.rrr.toFixed(2)} vs current ${eqNow.crr.toFixed(2)} · ${fixture(m)}`,
        });
      }

      const stateNow = matchStateOf(m);
      const stateThen = matchStateOf(was);
      const stoppage = ['interval', 'transition', 'dormant', 'weather', 'hold'];
      if (stoppage.includes(stateNow.family) && stateNow.key !== stateThen.key) {
        out.push({
          key: `stop:${m.id}:${stateNow.key}:${m.day ?? 1}`,
          trigger: 'STOPPAGE',
          matchId: m.id,
          href,
          title: `${stateNow.label} — ${fixture(m)}`,
          body: scoreLine(m) || m.series.name,
        });
      }
    }
  }

  return out;
}

/** Events visible in newly arrived deliveries and feed rows for one match. */
export function feedFirings(
  m: Match,
  balls: Array<PulseBall & { text?: string }>,
  events: MatchEvent[],
  seenBalls: Set<string>,
  seenEvents: Set<string>
): Array<Firing & { player?: string }> {
  const out: Array<Firing & { player?: string }> = [];
  const href = `/matches/${m.id}`;

  for (const b of balls) {
    if (seenBalls.has(b.id)) continue;
    seenBalls.add(b.id);
    if (b.batRuns !== 6 && b.batRuns !== 4) continue;
    const six = b.batRuns === 6;
    out.push({
      key: `${six ? 'six' : 'four'}:${m.id}:${b.id}`,
      trigger: six ? 'SIX' : 'FOUR',
      matchId: m.id,
      href,
      title: `${six ? 'Six' : 'Four'} — ${fixture(m)}`,
      body: `${b.over}.${b.ball}${b.text ? ` · ${b.text.split('—')[0].trim()}` : ''}`,
    });
  }

  for (const e of events) {
    if (seenEvents.has(e.id)) continue;
    seenEvents.add(e.id);
    if (e.kind !== 'MILESTONE' || !e.text) continue;
    // crex writes "R Ram Arvindh — Scored 50 in 28 Balls"; team milestones say "overs".
    const m100 = /scored\s+(\d+)\s+in\s+\d+\s+balls/i.exec(e.text);
    if (!m100) continue;
    const runs = Number(m100[1]);
    const trigger: TriggerKind | null = runs === 50 ? 'FIFTY' : runs === 100 ? 'HUNDRED' : null;
    if (!trigger) continue;
    const player = e.text.split('—')[0].trim();
    out.push({
      key: `ms:${m.id}:${e.id}`,
      trigger,
      matchId: m.id,
      href,
      player,
      title: `${player} reaches ${runs}`,
      body: fixture(m),
    });
  }

  return out;
}

/** Loose name match for player-scoped rules: every word of the rule's name in the feed's. */
export function playerMatches(ruleName: string | undefined, feedName: string | undefined): boolean {
  if (!ruleName || !feedName) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const feed = norm(feedName);
  const rule = norm(ruleName);
  const surname = rule[rule.length - 1];
  return Boolean(surname) && feed.includes(surname);
}
