'use client';

import type { NewsArticle, NewsTagKind } from '@/types';
import type { Automation, TriggerKind } from './automations';
import { followCount, type FollowKind, type Follows } from './follows';
import { createPersisted, isRecord } from './persisted';

export type FollowMoment = 'start' | 'wicket' | 'milestone' | 'chase' | 'result' | 'news';

export const FOLLOW_MOMENTS: ReadonlyArray<{ key: FollowMoment; label: string; triggers: TriggerKind[] }> = [
  { key: 'start', label: 'Match start', triggers: ['MATCH_START'] },
  { key: 'wicket', label: 'Wickets', triggers: ['WICKET'] },
  { key: 'milestone', label: '50s and 100s', triggers: ['FIFTY', 'HUNDRED'] },
  { key: 'chase', label: 'Close chase', triggers: ['CLOSE_CHASE'] },
  { key: 'result', label: 'Results', triggers: ['RESULT'] },
  { key: 'news', label: 'News', triggers: [] },
];

const MOMENT_KEYS = new Set<string>(FOLLOW_MOMENTS.map((m) => m.key));

/** What is switched off, so a moment added later starts on. */
export interface FollowAlerts {
  on: boolean;
  off: FollowMoment[];
}

const DEFAULTS: FollowAlerts = { on: true, off: [] };

export const followAlertsStore = createPersisted<FollowAlerts>('pc.followAlerts', DEFAULTS, (raw) =>
  isRecord(raw)
    ? {
        on: raw.on !== false,
        off: Array.isArray(raw.off) ? (raw.off.filter((k) => MOMENT_KEYS.has(k as string)) as FollowMoment[]) : [],
      }
    : null
);

export const useFollowAlerts = followAlertsStore.use;

export const setFollowAlertsOn = (on: boolean) => followAlertsStore.set((prev) => ({ ...prev, on }));

export const toggleFollowMoment = (key: FollowMoment) =>
  followAlertsStore.set((prev) => ({
    ...prev,
    off: prev.off.includes(key) ? prev.off.filter((k) => k !== key) : [...prev.off, key],
  }));

export const momentOn = (prefs: FollowAlerts, key: FollowMoment) => prefs.on && !prefs.off.includes(key);

/** True once following anything will notify — the cue to ask for browser permission. */
export const followAlertsLive = (follows: Follows, prefs: FollowAlerts) =>
  prefs.on && followCount(follows) > 0 && FOLLOW_MOMENTS.some((m) => !prefs.off.includes(m.key));

const FOLLOW_ID = 'follow:';
export const isFollowRule = (id: string) => id.startsWith(FOLLOW_ID);

const rule = (id: string, triggers: TriggerKind[], scope: Automation['scope']): Automation => ({
  id: `${FOLLOW_ID}${id}`,
  triggers,
  scope,
  action: { inApp: true, system: true },
  enabled: true,
  createdAt: 0,
  fired: 0,
  lastFiredAt: null,
});

/**
 * The alerts following implies: every chosen moment in a followed team's or
 * series' matches, and 50s and 100s for a followed player. They run beside the
 * reader's own alerts and are never stored with them.
 */
export function followRules(follows: Follows, prefs: FollowAlerts): Automation[] {
  if (!prefs.on) return [];
  const triggers = FOLLOW_MOMENTS.filter((m) => !prefs.off.includes(m.key)).flatMap((m) => m.triggers);
  const rules: Automation[] = [];
  if (triggers.length && (follows.teams.length || follows.series.length)) {
    rules.push(rule('matches', triggers, { kind: 'FOLLOWED' }));
  }
  const milestones = triggers.filter((t) => t === 'FIFTY' || t === 'HUNDRED');
  if (milestones.length) {
    for (const p of follows.players) rules.push(rule(`player:${p.id}`, milestones, { kind: 'PLAYER', id: p.id, name: p.name }));
  }
  return rules;
}

const FOLLOW_KEY: Record<NewsTagKind, FollowKind> = { team: 'teams', series: 'series', player: 'players' };

/** A story counts as news while it is this fresh; older ones are history, not a notification. */
export const NEWS_FRESH_MS = 3 * 60 * 60_000;

/** Fresh stories tagged with anything followed, newest first, with the names they were tagged under. */
export function followedNews(
  articles: NewsArticle[],
  follows: Follows,
  now: number
): Array<{ article: NewsArticle; about: string[] }> {
  const found: Array<{ article: NewsArticle; about: string[] }> = [];
  for (const article of articles) {
    const age = now - Date.parse(article.publishedAt);
    if (!(age >= -60_000 && age <= NEWS_FRESH_MS)) continue;
    const about = article.tags
      .filter((t) => follows[FOLLOW_KEY[t.kind]].some((e) => e.id === t.id))
      .map((t) => t.name);
    if (about.length) found.push({ article, about });
  }
  return found.sort((a, b) => b.article.publishedAt.localeCompare(a.article.publishedAt));
}
