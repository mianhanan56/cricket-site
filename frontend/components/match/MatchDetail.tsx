'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HeadToHead, InningsScore, Match, OverSummary, PointsTableGroup, SeriesLeaders } from '@/types';
import {
  IDLE_INTERVAL_MS,
  useCrexCommentaryHistory,
  useCrexMatch,
  useCrexMatchExtras,
  useCrexMatchSquads,
} from '@/hooks/useCrexMatches';
import { useSeriesLeaders } from '@/hooks/useSeriesLeaders';
import type { MatchTab } from '@/lib/tabs';
import { useLiveStatus } from '@/lib/live/socket';
import { DEFAULT_BALLS_PER_OVER, formatProgressShort } from '@/lib/overs';
import { battedInnings, formatTeamScore, inningsFor } from '@/lib/innings';
import { creaseContext, matchSituation, type MatchSituation } from '@/lib/situation';
import { isStaleStoppage, attributeResult } from '@/lib/crex';
import { matchStateOf } from '@/lib/matchState';
import { breakFromFeed } from '@/lib/feedBreak';
import { inningsProgress, liveEquation } from '@/lib/telemetry';
import { creaseFromCard } from '@/lib/crease';
import { dedupeDeliveries, groupBalls, reachedByCard, toBallEntry, type BallEntry } from '@/lib/balls';
import { useActiveInView, useScrollFade } from '@/hooks/useScrollFade';
import PointsTable from '../series/PointsTable';
import { SeriesLeadersBoard, rankedLeaders } from '../series/SeriesLeaders';
import BackButton from '../ui/BackButton';
import FollowButton from '../follow/FollowButton';
import StateChip from '../live/StateChip';
import Ticker from '../live/Ticker';
import ScoreHeader, { type ScoreParts } from './ScoreHeader';
import LivePanel from './LivePanel';
import ScorecardPanel from './ScorecardPanel';
import CommentaryFeed from './CommentaryFeed';
import InfoPanel from './InfoPanel';
import mc from './matchCenter.module.scss';
import styles from './MatchDetail.module.scss';

type TabKey = MatchTab;

const MAX_COMMENTARY = 60;
// Three overs of recent balls — two is too short to read the shape of a spell.
const MAX_DOTS = 18;

const NO_SITUATION: MatchSituation = { margin: null, followOn: null, target: null };

// "287/4"; once a Test side bats again, its earlier innings ("462") ride in front of the latest.
function scoreParts(list: InningsScore[], perOver: number, multiInnings: boolean): ScoreParts | null {
  const batted = battedInnings(list);
  if (!batted.length) return null;
  return {
    runs: formatTeamScore(batted.slice(-1), multiInnings),
    earlier: batted.length > 1 ? formatTeamScore(batted.slice(0, -1), true) : null,
    overs: formatProgressShort(batted[batted.length - 1].overs, perOver),
  };
}

export default function MatchDetail({
  matchId,
  initial,
  preview = false,
  headToHead,
  seriesTable,
  seriesLeaders,
  initialTab = '',
}: {
  matchId: string;
  initial: Match;
  /** A scheduled fixture with no crex key yet — nothing match-keyed exists upstream. */
  preview?: boolean;
  headToHead?: HeadToHead | null;
  seriesTable?: PointsTableGroup[];
  /** The series' leaders, for the Stats tab; null where crex has none yet. */
  seriesLeaders?: SeriesLeaders | null;
  /** `?tab=` from the URL; '' when absent or not a tab. */
  initialTab?: TabKey | '';
}) {
  const [match, setMatch] = useState<Match>(initial);
  const hasSummary = !preview && initial.status !== 'UPCOMING';
  const defaultTab: TabKey = hasSummary ? 'live' : 'info';
  const [picked, setPicked] = useState<TabKey>(initialTab || defaultTab);
  const offered: Record<TabKey, boolean> = {
    live: hasSummary || initial.status !== 'UPCOMING',
    scorecard: true,
    commentary: true,
    info: true,
    table: Boolean(seriesTable?.length),
    stats: Boolean(seriesLeaders && rankedLeaders(seriesLeaders).length),
  };
  // A shared ?tab= this match has no section for (no table, not started) opens the default.
  const tab: TabKey = offered[picked] ? picked : defaultTab;

  const [commentary, setCommentary] = useState<BallEntry[]>(() =>
    (initial.scorecard?.commentary ?? []).map(toBallEntry).reverse()
  );
  const [dots, setDots] = useState<BallEntry[]>(() =>
    (initial.scorecard?.commentary ?? []).map(toBallEntry).slice(-MAX_DOTS)
  );

  const isLive = match.status === 'LIVE';

  // Polling is not gated on LIVE: a page opened before the toss has to keep
  // asking to learn the match has started. Status sets the cadence; a finished
  // match is terminal and stops.
  const { match: polled, lastUpdated, error: listError } = useCrexMatch(matchId, {
    initial,
    enabled: !preview && match.status !== 'COMPLETED',
    intervalMs: isLive ? undefined : IDLE_INTERVAL_MS,
  });

  const extrasEnabled = !preview && match.status !== 'UPCOMING';
  const crexExtras = useCrexMatchExtras(matchId, {
    enabled: extrasEnabled,
    // A finished card is final: fetch once, then stop.
    repeat: isLive,
    ballsPerOver: match.ballsPerOver,
    status: match.status,
  });
  const extrasPending = extrasEnabled && !crexExtras.loaded;

  const squadsEnabled = !preview;
  const { squads: squadsByTeam, conditions, loaded: squadsLoaded } = useCrexMatchSquads(matchId, {
    enabled: squadsEnabled,
  });
  const squads = useMemo(() => {
    const home = squadsByTeam[match.homeTeam.id] ?? match.squads?.home ?? [];
    const away = squadsByTeam[match.awayTeam.id] ?? match.squads?.away ?? [];
    return home.length || away.length ? { home, away } : null;
  }, [squadsByTeam, match.homeTeam.id, match.awayTeam.id, match.squads]);
  // Placeholders only before the toss, where the list is the tallest thing on the tab.
  const squadsPending = squadsEnabled && match.status === 'UPCOMING' && !squadsLoaded && !squads;

  // The crex card is a complete card each poll, not a delta.
  useEffect(() => {
    if (!polled) return;
    setMatch(
      crexExtras.innings.length
        ? { ...polled, scorecard: { ...polled.scorecard, innings: crexExtras.innings } }
        : polled
    );
  }, [polled, crexExtras.innings]);

  useEffect(() => {
    if (!crexExtras.commentary.length) return;
    const entries = crexExtras.commentary.map(toBallEntry);
    setCommentary(entries.slice(0, MAX_COMMENTARY));
    setDots([...entries].reverse().slice(-MAX_DOTS));
  }, [crexExtras.commentary]);

  const isConnected = Boolean(lastUpdated);
  const liveStatus = useLiveStatus();
  // Both routes down: the score on screen is the last one known, and says so.
  const interrupted = isLive && Boolean(listError) && liveStatus !== 'open';
  const innings = match.scorecard?.innings ?? [];
  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;

  // crex latches break codes after play resumes; this page holds the freshest
  // score and the last ball's time, so it is best placed to drop a stale one.
  // The clock is the poll's own, not Date.now(), to keep hydration stable.
  const note =
    match.note &&
    isStaleStoppage(match.note, {
      innings,
      format: match.format,
      perOver,
      lastBallAt: commentary[0]?.timestamp ?? null,
      now: lastUpdated?.getTime() ?? null,
    })
      ? null
      : match.note;
  // An interval the commentary has just called, which the list feed cannot report fresh.
  // A stoppage the list does report as stopping play (rain, stumps) still wins over it.
  const feedBreak = isLive ? breakFromFeed(crexExtras.events, commentary[0]?.timestamp) : null;
  const listStoppage = Boolean(note?.paused && note.kind !== 'BREAK');
  const state = matchStateOf(match, feedBreak && !listStoppage ? feedBreak : note);

  const multiInnings = match.format === 'TEST';
  const homeScore = scoreParts(inningsFor(match, match.homeTeam), perOver, multiInnings);
  const awayScore = scoreParts(inningsFor(match, match.awayTeam), perOver, multiInnings);

  const cardDots = useMemo(
    () => (isLive ? reachedByCard(dots, crexExtras.innings, perOver) : dots),
    [isLive, dots, crexExtras.innings, perOver]
  );
  // Not while play is stopped: the newest delivery then belongs to an innings that has ended.
  const lastBall = isLive && state.alive ? cardDots[cardDots.length - 1] ?? null : null;

  // Rates and crease read the fetched card — only it returns innings in innings order.
  const eq = useMemo(
    () => (isLive ? liveEquation(match, crexExtras.innings.length ? crexExtras.innings : undefined) : null),
    [isLive, match, crexExtras.innings]
  );
  const situation = useMemo(
    () => (isLive ? matchSituation(match, crexExtras.innings) : NO_SITUATION),
    [isLive, match, crexExtras.innings]
  );
  const stand = useMemo(
    () => (isLive ? creaseContext(crexExtras.innings) : { partnership: null, lastWicket: null }),
    [isLive, crexExtras.innings]
  );
  const crease = useMemo(
    () => (isLive ? creaseFromCard(match, crexExtras.innings, lastBall?.text ?? null) : null),
    [isLive, match, crexExtras.innings, lastBall]
  );

  const history = useCrexCommentaryHistory(matchId, {
    enabled: !preview && (tab === 'commentary' || tab === 'live') && match.status !== 'UPCOMING',
  });

  // Ordered by innings, over, ball — not by id, which can fall back to "64.3".
  const feedBalls = useMemo(() => {
    const byId = new Map<string, BallEntry>();
    for (const b of commentary) byId.set(b.id, b);
    for (const b of history.balls) byId.set(b.id, toBallEntry(b));
    const sorted = dedupeDeliveries([...byId.values()]).sort((a, b) => (b.inning ?? 0) - (a.inning ?? 0) || b.over - a.over || b.ball - a.ball);
    return isLive ? reachedByCard(sorted, crexExtras.innings, perOver) : sorted;
  }, [commentary, history.balls, isLive, crexExtras.innings, perOver]);

  const feedOvers = useMemo(() => {
    const byId = new Map<string, OverSummary>();
    for (const o of crexExtras.overs) byId.set(o.id, o);
    for (const o of history.overs) byId.set(o.id, o);
    return [...byId.values()].sort((a, b) => b.inning - a.inning || b.over - a.over);
  }, [crexExtras.overs, history.overs]);

  const ballGroups = useMemo(() => groupBalls(cardDots, perOver, commentary, state.alive), [cardDots, commentary, perOver, state.alive]);

  const winnerId =
    match.status === 'COMPLETED' ? attributeResult(match.result, match.homeTeam, match.awayTeam).winnerKey : null;
  // Nobody is in at stumps, so no side carries the batting mark.
  const battingId = state.key === 'STUMPS' ? null : eq?.battingTeam.id ?? null;

  const leaders = useSeriesLeaders(match.series.id, seriesLeaders ?? null, isLive && tab === 'stats');
  const hasTable = offered.table;
  const hasStats = Boolean(leaders && rankedLeaders(leaders).length);
  const tabs: Array<{ key: TabKey; label: string }> = [
    ...(offered.live || match.status !== 'UPCOMING' ? [{ key: 'live' as const, label: isLive ? 'Live' : 'Summary' }] : []),
    { key: 'scorecard', label: 'Scorecard' },
    { key: 'commentary', label: 'Commentary' },
    { key: 'info', label: match.status === 'UPCOMING' ? 'Preview' : 'Info' },
    ...(hasTable ? [{ key: 'table' as const, label: 'Table' }] : []),
    ...(hasStats ? [{ key: 'stats' as const, label: 'Stats' }] : []),
  ];

  // The rail carries the score once the header has scrolled away.
  const headerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: '-60px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const railInn = eq?.innings;
  const panelRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  useScrollFade(tabsRef);
  useActiveInView(tabsRef, `${tab}|${tabs.length}`);
  const railRef = useRef<HTMLElement>(null);
  const show = (next: TabKey) => {
    setPicked(next);
    // replaceState, not the router: the page is dynamic and a navigation would re-render it on the server.
    const url = new URL(window.location.href);
    if (next === defaultTab) url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  };
  const pick = (next: TabKey) => {
    show(next);
    const panel = panelRef.current;
    const rail = railRef.current;
    if (!compact || !panel || !rail) return;
    // Panel top just under the stuck rail, so the rail stays where it is.
    const gap = panel.getBoundingClientRect().top - rail.getBoundingClientRect().bottom;
    window.scrollBy({ top: gap });
  };

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <BackButton />
        <div className={styles.follows}>
          <FollowButton kind="teams" label={match.homeTeam.shortName} entity={{ id: match.homeTeam.id, name: match.homeTeam.name, shortName: match.homeTeam.shortName, logo: match.homeTeam.logo }} />
          <FollowButton kind="teams" label={match.awayTeam.shortName} entity={{ id: match.awayTeam.id, name: match.awayTeam.name, shortName: match.awayTeam.shortName, logo: match.awayTeam.logo }} />
        </div>
      </div>

      <div ref={headerRef}>
        <ScoreHeader
          match={match}
          state={state}
          home={homeScore}
          away={awayScore}
          battingId={battingId}
          winnerId={winnerId}
          lastBall={lastBall}
          eq={eq}
          situation={situation}
          stand={stand}
          progress={state.alive ? inningsProgress(match, crexExtras.innings.length ? crexExtras.innings : undefined) : null}
          connecting={isLive && !isConnected && !crexExtras.fetchedAt}
          interrupted={interrupted}
          perOver={perOver}
          nextPlay={conditions?.nextPlay}
        />
      </div>

      <nav ref={railRef} className={`${styles.rail} ${compact ? styles.railCompact : ''}`} aria-label="Match sections">
        <div ref={tabsRef} className={styles.tabs} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`${styles.tab} ${tab === t.key ? styles.active : ''}`}
              onClick={() => pick(t.key)}
            >
              {t.key === 'live' && isLive && state.key !== 'STUMPS' && <span className={styles.liveDot} aria-hidden="true" />}
              {t.label}
            </button>
          ))}
        </div>
        {/* After the tabs, so its arrival never moves them under the pointer. */}
        {compact && (
          <span className={styles.mini} aria-hidden="true">
            <StateChip state={state} />
            <span className={styles.miniTeams}>
              {match.homeTeam.shortName} v {match.awayTeam.shortName}
            </span>
            {railInn && (
              <span className={styles.miniScore}>
                <Ticker value={`${railInn.runs}/${railInn.wickets}`} />
                <small>{railInn.overs}</small>
              </span>
            )}
          </span>
        )}
      </nav>

      {/* While the rail is stuck, a short tab must not let the page clamp and bring the header back. */}
      <div ref={panelRef} className={`${styles.panelAnchor} ${compact ? styles.panelHold : ''}`}>
        {tab === 'live' && (
          <LivePanel
            match={match}
            state={state}
            perOver={perOver}
            innings={crexExtras.innings}
            balls={feedBalls}
            overs={feedOvers}
            events={crexExtras.events}
            groups={ballGroups}
            crease={crease}
            pending={extrasPending}
            history={history}
          />
        )}
        {tab === 'scorecard' && (
          <ScorecardPanel match={match} innings={innings} squads={squads} pending={extrasPending} onShowSquads={() => show('info')} />
        )}
        {tab === 'commentary' && (
          <CommentaryFeed
            balls={feedBalls}
            summaries={feedOvers}
            pending={extrasPending || (history.loading && !feedBalls.length)}
            loadingMore={history.loading}
            exhausted={history.exhausted}
            onLoadMore={history.loadMore}
          />
        )}
        {tab === 'info' && (
          <InfoPanel
            match={match}
            events={crexExtras.events}
            squads={squads}
            squadsPending={squadsPending}
            conditions={conditions}
            headToHead={headToHead}
          />
        )}
        {tab === 'table' && seriesTable && (
          <div className={mc.panel}>
            <PointsTable groups={seriesTable} highlight={[match.homeTeam.id, match.awayTeam.id]} />
          </div>
        )}
        {tab === 'stats' && leaders && (
          <div className={mc.panel}>
            <SeriesLeadersBoard leaders={leaders} seriesId={match.series.id} />
          </div>
        )}
      </div>
    </div>
  );
}
