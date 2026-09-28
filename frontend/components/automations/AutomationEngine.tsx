'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Match } from '@/types';
import { useCrexMatches } from '@/hooks/useCrexMatches';
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

const LIST_INTERVAL_MS = 15_000;
const FEED_INTERVAL_MS = 20_000;
const MAX_FEED_MATCHES = 6;

/** Runs the reader's automations against the live feed while a tab is open. */
export default function AutomationEngine() {
  const automations = useAutomations();
  const active = automations.filter((a) => a.enabled && triggerSpec(a.trigger).available);
  return active.length ? <Runner rules={active} /> : null;
}

function Runner({ rules }: { rules: Automation[] }) {
  const follows = useFollows();
  const { matches } = useCrexMatches({ intervalMs: LIST_INTERVAL_MS });
  const prev = useRef<Match[] | null>(null);

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
        system: rule.action.system,
      });
    }
  };

  useEffect(() => {
    if (!matches.length) return;
    if (prev.current) {
      const byId = new Map(matches.map((m) => [m.id, m]));
      for (const f of listFirings(prev.current, matches)) {
        const m = byId.get(f.matchId);
        if (m) deliver(f, m);
      }
    }
    prev.current = matches;
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
        <FeedWatcher key={m.id} match={m} onFire={deliver} />
      ))}
    </>
  );
}

function FeedWatcher({
  match,
  onFire,
}: {
  match: Match;
  onFire: (f: Firing & { player?: string }, m: Match) => void;
}) {
  const matchRef = useRef(match);
  matchRef.current = match;
  const fireRef = useRef(onFire);
  fireRef.current = onFire;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const seenBalls = new Set<string>();
    const seenEvents = new Set<string>();
    let baseline = true;

    const run = async () => {
      if (document.visibilityState !== 'hidden') {
        try {
          const feed = await getCrexMatchFeed(match.id, { minBalls: 6, maxPages: 1 });
          if (cancelled) return;
          const found = feedFirings(matchRef.current, feed.balls, feed.events, seenBalls, seenEvents);
          // The first read only learns what is already on the feed.
          if (!baseline) found.forEach((f) => fireRef.current(f, matchRef.current));
          baseline = false;
        } catch {
          // Try again next tick.
        }
      }
      if (!cancelled) timer = setTimeout(run, FEED_INTERVAL_MS);
    };

    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [match.id]);

  return null;
}
