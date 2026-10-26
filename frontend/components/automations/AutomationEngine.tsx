'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Match } from '@/types';
import { HIDDEN_INTERVAL_MS, useApiMatches } from '@/hooks/useApiMatches';
import { feedFromRows, getApiMatchFeed, getApiNewsTopics, type ApiFeedRow } from '@/lib/api';
import { newsFromTopics } from '@/lib/news';
import { isTopicLive, subscribeLive } from '@/lib/live/socket';
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
import { followCount, useFollows, type Follows } from '@/lib/follows';
import { followRules, followedNews, isFollowRule, momentOn, useFollowAlerts } from '@/lib/followAlerts';
import { useNotificationPermission } from './useNotificationPermission';

const LIST_INTERVAL_MS = 15_000;
const FEED_INTERVAL_MS = 20_000;
// With the socket delivering each ball, the poll only has to catch a missed frame.
const SOCKET_FEED_INTERVAL_MS = 60_000;
const MAX_FEED_MATCHES = 6;
// A tab frozen, asleep or parked longer than this saw nothing happen live; what
// changed meanwhile is history, not an alert.
const STALE_GAP_MS = 5 * 60_000;
// The upstream's news list is cached for 15 minutes at the edge; reading it more often finds nothing new.
const NEWS_INTERVAL_MS = 5 * 60_000;
const NEWS_PER_READ = 3;

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
  const follows = useFollows();
  const prefs = useFollowAlerts();
  // Following is an alert of its own: the reader's rules plus the ones their follows imply.
  const active = useMemo(
    () =>
      [...automations, ...followRules(follows, prefs)].filter(
        (a) => a.enabled && a.triggers.some((t) => triggerSpec(t).available)
      ),
    [automations, follows, prefs]
  );
  const news = momentOn(prefs, 'news') && followCount(follows) > 0;
  const held = useEngineLock(active.length > 0 || news);

  const [permission] = useNotificationPermission();
  // A hidden tab keeps checking only when a browser notification is waiting on it.
  const background = permission === 'granted' && (news || active.some((a) => a.action.system));

  if (!held) return null;
  return (
    <>
      {active.length > 0 && <Runner rules={active} background={background} />}
      {news && <NewsWatcher follows={follows} background={background} />}
    </>
  );
}

/** New stories tagged with anything the reader follows, a few at a time, each once across tabs. */
function NewsWatcher({ follows, background }: { follows: Follows; background: boolean }) {
  const followsRef = useRef(follows);
  followsRef.current = follows;
  const backgroundRef = useRef(background);
  backgroundRef.current = background;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let readAt = 0;

    const run = async () => {
      if (timer) clearTimeout(timer);
      if (!isHidden() || backgroundRef.current) {
        readAt = Date.now();
        try {
          const { articles } = newsFromTopics(await getApiNewsTopics(1, 20), 1);
          if (cancelled) return;
          let sent = 0;
          for (const { article, about } of followedNews(articles, followsRef.current, Date.now())) {
            if (sent === NEWS_PER_READ) break;
            if (!claimEvent(`news:${article.id}`)) continue;
            sent += 1;
            pushNotification({
              kind: 'news',
              title: article.title,
              body: about.join(' · '),
              href: `/news/${article.slug}`,
              eventKey: `news:${article.id}`,
              system: true,
            });
          }
        } catch {
          // Try again next tick.
        }
      }
      if (!cancelled) timer = setTimeout(run, NEWS_INTERVAL_MS);
    };

    const onVisible = () => !isHidden() && Date.now() - readAt > NEWS_INTERVAL_MS && void run();
    document.addEventListener('visibilitychange', onVisible);
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}

function Runner({ rules, background }: { rules: Automation[]; background: boolean }) {
  const follows = useFollows();
  const { matches, lastUpdated } = useApiMatches({ intervalMs: LIST_INTERVAL_MS, background });
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

  // One event, one notification: two alerts that both cover a wicket still send it once.
  const deliver = (firing: Firing & { player?: string }, m: Match) => {
    const matched = rulesRef.current.filter(
      (rule) =>
        rule.triggers.includes(firing.trigger) &&
        matchInScope(rule.scope, m, ctxRef.current) &&
        (rule.scope.kind !== 'PLAYER' || playerMatches(rule.scope.name, firing.player))
    );
    if (!matched.length || !claimEvent(`event:${firing.key}`)) return;
    matched.forEach((rule) => !isFollowRule(rule.id) && recordFire(rule.id));
    pushNotification({
      kind: triggerSpec(firing.trigger).notification,
      title: firing.title,
      body: firing.body,
      href: firing.href,
      automationId: matched[0].id,
      eventKey: firing.key,
      system: matched.some((rule) => rule.action.system),
    });
  };

  useEffect(() => {
    if (!matches.length) return;
    const now = Date.now();
    // An unchanged list is still a fresh look: without this a quiet spell would read as a stale gap.
    if (prev.current?.matches === matches) {
      prev.current.at = now;
      return;
    }
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
  }, [matches, lastUpdated]);

  const feedRules = rules.filter((r) => r.triggers.some((t) => triggerSpec(t).feed));
  // Keyed on the scopes, not the count: editing an alert's team must move its watchers.
  const feedScopes = feedRules.map((r) => `${r.scope.kind}:${r.scope.id ?? ''}:${r.scope.name ?? ''}`).join('|');
  const feedTargets = useMemo(
    () =>
      feedRules.length
        ? matches
            .filter((m) => m.status === 'LIVE' && feedRules.some((r) => matchInScope(r.scope, m, ctx)))
            .slice(0, MAX_FEED_MATCHES)
        : [],
    // `feedRules` is rebuilt every render; `feedScopes` is what it contributes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, ctx, feedScopes]
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

    const topic = `feed:${match.id}`;

    // Socket frames and polls land here alike; the seen sets make a repeat of either a no-op.
    const consume = (feed: Pick<Awaited<ReturnType<typeof getApiMatchFeed>>, 'balls' | 'events'>) => {
      // A long gap means these balls are old news: learn them, don't announce them.
      if (Date.now() - readAt > STALE_GAP_MS) baseline = true;
      const found = feedFirings(matchRef.current, feed.balls, feed.events, seenBalls, seenEvents);
      // The first read only learns what is already on the feed.
      if (!baseline) found.forEach((f) => fireRef.current(f, matchRef.current));
      baseline = false;
      readAt = Date.now();
    };

    const run = async () => {
      // One chain only: a return-to-tab read must not start a second one beside the timer's.
      if (reading) return;
      reading = true;
      if (timer) clearTimeout(timer);
      if (!isHidden() || backgroundRef.current) {
        try {
          const feed = await getApiMatchFeed(match.id, { minBalls: 6, maxPages: 1 });
          if (cancelled) return;
          consume(feed);
        } catch {
          // Try again next tick.
        }
      }
      reading = false;
      const every = isTopicLive(topic) ? SOCKET_FEED_INTERVAL_MS : FEED_INTERVAL_MS;
      if (!cancelled) timer = setTimeout(run, isHidden() ? Math.max(HIDDEN_INTERVAL_MS, every) : every);
    };

    const offLive = subscribeLive(topic, (frame) => {
      if (Array.isArray(frame.data)) consume(feedFromRows(frame.data as ApiFeedRow[]));
    });

    // Back on screen: read now rather than wait out a hidden-tab interval.
    const onVisible = () => !isHidden() && void run();
    document.addEventListener('visibilitychange', onVisible);
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      offLive();
    };
  }, [match.id]);

  return null;
}
