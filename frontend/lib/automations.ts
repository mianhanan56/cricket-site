'use client';

import type { Match, MatchEvent } from '@/types';
import type { PulseBall } from './pulse';
import { createPersisted, isRecord, newId } from './persisted';
import { isChaseTight, liveEquation } from './telemetry';
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
  /** One or more moments; any of them fires the alert. */
  triggers: TriggerKind[];
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
  /** "Wicket" — for a card that names several moments at once. */
  short: string;
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
  { kind: 'MATCH_START', label: 'Match starts', short: 'Match start', phrase: 'a match starts', feed: false, scopes: MATCH_SCOPES, notification: 'live', available: true },
  { kind: 'WICKET', label: 'Wicket falls', short: 'Wicket', phrase: 'a wicket falls', feed: false, scopes: MATCH_SCOPES, notification: 'moment', available: true },
  { kind: 'SIX', label: 'Six is hit', short: 'Six', phrase: 'a six is hit', feed: true, scopes: MATCH_SCOPES, notification: 'moment', available: true },
  { kind: 'FOUR', label: 'Four is hit', short: 'Four', phrase: 'a four is hit', feed: true, scopes: MATCH_SCOPES, notification: 'moment', available: true },
  { kind: 'FIFTY', label: 'Fifty reached', short: 'Fifty', phrase: 'a batter reaches 50', feed: true, scopes: ['ANY', 'FOLLOWED', 'TEAM', 'SERIES', 'PLAYER'], notification: 'moment', available: true },
  { kind: 'HUNDRED', label: 'Century reached', short: 'Century', phrase: 'a batter reaches 100', feed: true, scopes: ['ANY', 'FOLLOWED', 'TEAM', 'SERIES', 'PLAYER'], notification: 'moment', available: true },
  { kind: 'CLOSE_CHASE', label: 'Chase gets tight', short: 'Close chase', phrase: 'the required rate passes the current rate', feed: false, scopes: MATCH_SCOPES, notification: 'alert', available: true },
  { kind: 'STOPPAGE', label: 'Play stops', short: 'Play stops', phrase: 'play stops for rain, bad light or a break', feed: false, scopes: MATCH_SCOPES, notification: 'alert', available: true },
  { kind: 'RESULT', label: 'Match finishes', short: 'Result', phrase: 'a match finishes', feed: false, scopes: MATCH_SCOPES, notification: 'result', available: true },
  { kind: 'TOURNAMENT_MILESTONE', label: 'Tournament milestone', short: 'Milestone', phrase: 'a player reaches 1,000 tournament runs', feed: false, scopes: ['SERIES', 'PLAYER'], notification: 'moment', available: false },
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

/** "a wicket falls, a six is hit or a match finishes" */
function joinPhrases(parts: string[]): string {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

export function describeAutomation(a: Pick<Automation, 'triggers' | 'scope'>): string {
  if (a.scope.kind === 'PLAYER') {
    const marks = a.triggers.filter((t) => t === 'FIFTY' || t === 'HUNDRED').map((t) => (t === 'FIFTY' ? '50' : '100'));
    return `When ${a.scope.name ?? 'this player'} reaches ${joinPhrases(marks)}`;
  }
  return `When ${joinPhrases(a.triggers.map((t) => triggerSpec(t).phrase))} ${scopePhrase(a.scope)}`;
}

/** Every moment the simple creator offers under this scope. */
export function triggersForScope(kind: ScopeKind): TriggerKind[] {
  return TRIGGERS.filter((t) => t.available && t.scopes.includes(kind)).map((t) => t.kind);
}

/** "Wicket + Fifty + Century", or "All match events" once nothing is left out. */
export function summarizeTriggers(a: Pick<Automation, 'triggers' | 'scope'>): string {
  const all = triggersForScope(a.scope.kind);
  if (all.length > 2 && all.every((t) => a.triggers.includes(t))) return 'All match events';
  const names = TRIGGERS.filter((t) => a.triggers.includes(t.kind)).map((t) => t.short);
  return names.length > 3 ? `${names.slice(0, 2).join(' + ')} + ${names.length - 2} more` : names.join(' + ');
}

export function scopeLabel(scope: AutomationScope): string {
  switch (scope.kind) {
    case 'ANY':
      return 'Any match';
    case 'FOLLOWED':
      return 'What I follow';
    default:
      return scope.name ?? 'Unnamed';
  }
}

export const sameScope = (a: AutomationScope, b: AutomationScope) => a.kind === b.kind && (a.id ?? '') === (b.id ?? '');

const VALID_TRIGGERS = new Set(TRIGGERS.map((t) => t.kind));
const SCOPE_KINDS = new Set<ScopeKind>(['ANY', 'FOLLOWED', 'TEAM', 'SERIES', 'PLAYER']);

function parseScope(raw: unknown): AutomationScope | null {
  if (!isRecord(raw) || !SCOPE_KINDS.has(raw.kind as ScopeKind)) return null;
  const scope: AutomationScope = { kind: raw.kind as ScopeKind };
  if (typeof raw.id === 'string') scope.id = raw.id;
  if (typeof raw.name === 'string') scope.name = raw.name;
  return scope;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Alerts saved before an alert could hold several moments carry a single `trigger`.
export function parseAutomations(raw: unknown): Automation[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Automation[] = [];
  for (const a of raw) {
    if (!isRecord(a) || typeof a.id !== 'string') continue;
    const listed = Array.isArray(a.triggers) ? a.triggers : [a.trigger];
    const triggers = [...new Set(listed)].filter((t): t is TriggerKind => VALID_TRIGGERS.has(t as TriggerKind));
    const scope = parseScope(a.scope);
    if (!triggers.length || !scope) continue;
    const action = isRecord(a.action) ? a.action : {};
    out.push({
      id: a.id,
      triggers,
      scope,
      action: { inApp: action.inApp !== false, system: action.system === true },
      enabled: a.enabled !== false,
      createdAt: count(a.createdAt),
      fired: count(a.fired),
      lastFiredAt: typeof a.lastFiredAt === 'number' ? a.lastFiredAt : null,
    });
  }
  return out;
}

export const automationsStore = createPersisted<Automation[]>('pc.automations', [], parseAutomations);

export const useAutomations = automationsStore.use;

export function addAutomation(input: Pick<Automation, 'triggers' | 'scope' | 'action'>): Automation {
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
        isChaseTight(eqNow) &&
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
