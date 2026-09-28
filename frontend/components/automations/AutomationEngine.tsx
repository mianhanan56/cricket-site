'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Match } from '@/types';
import { HIDDEN_INTERVAL_MS, useCrexMatches } from '@/hooks/useCrexMatches';
import { getCrexMatchFeed } from '@/lib/crex';
import {
  feedFirings,
  listFirings,
  matchInScope,
  playerMatches,
  recordFire,
  triggerSpec,
  useAutomations,
  type Automation,
  type Firing,
  type ScopeContext,
} from '@/lib/automations';
import { claimEvent, pushNotification } from '@/lib/notifications';
import { useFollows } from '@/lib/follows';
import { useNotificationPermission } from './useNotificationPermission';

const LIST_INTERVAL_MS = 15_000;
const FEED_INTERVAL_MS = 20_000;
const MAX_FEED_MATCHES = 6;
// A tab frozen, asleep or parked longer than this saw nothing happen live; what
// changed meanwhile is history, not an alert.
const STALE_GAP_MS = 5 * 60_000;

const isHidden = () => document.visibilityState === 'hidden';

/**
 * One engine per browser, however many tabs are open: the Web Locks API hands
 * the lock to a single tab and passes it on when that tab closes. Without the
 * API every tab runs, and the shared fired-event ledger keeps them from doubling up.
 */
function useEngineLock(wanted: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    if (!navigator.locks) {
      setHeld(true);
      return;
    }
    const controller = new AbortController();
    navigator.locks
      .request('pulsecrease-alert-engine', { signal: controller.signal }, () => {
        setHeld(true);
        return new Promise<void>((release) => controller.signal.addEventListener('abort', () => release()));
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      setHeld(false);
    };
  }, [wanted]);
  return held;
}

/**
 * Runs the reader's automations against the live feed while a tab is open.
 * Nothing here runs once the browser closes the page — there is no push
 * subscription or server-side sender, so alerts reach only an open tab.
 */
export default function AutomationEngine() {
  const automations = useAutomations();
  const active = automations.filter((a) => a.enabled && triggerSpec(a.trigger).available);
  const held = useEngineLock(active.length > 0);

  const [permission] = useNotificationPermission();
  // A hidden tab keeps checking only when a browser notification is waiting on it.
  const background = permission === 'granted' && active.some((a) => a.action.system);

  return active.length && held ? <Runner rules={active} background={background} /> : null;
}

function Runner({ rules, background }: { rules: Automation[]; background: boolean }) {
  const follows = useFollows();
  const { matches } = useCrexMatches({ intervalMs: LIST_INTERVAL_MS, background });
  const prev = useRef<{ matches: Match[]; at: number } | null>(null);

  const ctx = useMemo<ScopeContext>(
    () => ({
      followedTeams: new Set(follows.teams.map((t) => t.id)),
      followedSeries: new Set(follows.series.map((s) => s.id)),
    }),
    [follows]
  );

  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const deliver = (firing: Firing & { player?: string }, m: Match) => {
    for (const rule of rulesRef.current) {
      if (rule.trigger !== firing.trigger) continue;
      if (!matchInScope(rule.scope, m, ctxRef.current)) continue;
      if (rule.scope.kind === 'PLAYER' && !playerMatches(rule.scope.name, firing.player)) continue;
      if (!claimEvent(`${rule.id}:${firing.key}`)) continue;
      recordFire(rule.id);
      pushNotification({
        kind: triggerSpec(rule.trigger).notification,
        title: firing.title,
        body: firing.body,
        href: firing.href,
        automationId: rule.id,
        eventKey: `${rule.id}:${firing.key}`,
        system: rule.action.system,
      });
    }
  };

  useEffect(() => {
    if (!matches.length) return;
    const now = Date.now();
    if (prev.current && now - prev.current.at < STALE_GAP_MS) {
      const byId = new Map(matches.map((m) => [m.id, m]));
      for (const f of listFirings(prev.current.matches, matches)) {
        const m = byId.get(f.matchId);
        if (m) deliver(f, m);
      }
    }
    prev.current = { matches, at: now };
    // `deliver` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  const feedRules = rules.filter((r) => triggerSpec(r.trigger).feed);
  const feedTargets = useMemo(
    () =>
      feedRules.length
        ? matches
            .filter((m) => m.status === 'LIVE' && feedRules.some((r) => matchInScope(r.scope, m, ctx)))
            .slice(0, MAX_FEED_MATCHES)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, ctx, feedRules.length]
  );

  return (
    <>
      {feedTargets.map((m) => (
        <FeedWatcher key={m.id} match={m} onFire={deliver} background={background} />
      ))}
    </>
  );
}

function FeedWatcher({
  match,
  onFire,
  background,
}: {
  match: Match;
  onFire: (f: Firing & { player?: string }, m: Match) => void;
  background: boolean;
}) {
  const matchRef = useRef(match);
  matchRef.current = match;
  const fireRef = useRef(onFire);
  fireRef.current = onFire;
  const backgroundRef = useRef(background);
  backgroundRef.current = background;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const seenBalls = new Set<string>();
    const seenEvents = new Set<string>();
    let baseline = true;
    let readAt = 0;
    let reading = false;

    const run = async () => {
      // One chain only: a return-to-tab read must not start a second one beside the timer's.
      if (reading) return;
      reading = true;
      if (timer) clearTimeout(timer);
      if (!isHidden() || backgroundRef.current) {
        try {
          const feed = await getCrexMatchFeed(match.id, { minBalls: 6, maxPages: 1 });
          if (cancelled) return;
          // A long gap means these balls are old news: learn them, don't announce them.
          if (Date.now() - readAt > STALE_GAP_MS) baseline = true;
          const found = feedFirings(matchRef.current, feed.balls, feed.events, seenBalls, seenEvents);
          // The first read only learns what is already on the feed.
          if (!baseline) found.forEach((f) => fireRef.current(f, matchRef.current));
          baseline = false;
          readAt = Date.now();
        } catch {
          // Try again next tick.
        }
      }
      reading = false;
      if (!cancelled) timer = setTimeout(run, isHidden() ? HIDDEN_INTERVAL_MS : FEED_INTERVAL_MS);
    };

    // Back on screen: read now rather than wait out a hidden-tab interval.
    const onVisible = () => !isHidden() && void run();
    document.addEventListener('visibilitychange', onVisible);
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [match.id]);

  return null;
}
