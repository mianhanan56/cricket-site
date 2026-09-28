'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OverSummary } from '@/types';
import { ballKind, runsLabel, type BallEntry, type BallKind } from '@/lib/balls';
import Segmented from '../ui/Segmented';
import PlayerLink from './PlayerLink';
import { CommentarySkeleton } from './MatchDetailSkeleton';
import mc from './matchCenter.module.scss';
import styles from './CommentaryFeed.module.scss';

const BALL_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'highlights', label: 'Highlights' },
  { value: 'overs', label: 'Overs' },
  { value: 'wickets', label: 'Wickets' },
  { value: 'sixes', label: 'Sixes' },
  { value: 'fours', label: 'Fours' },
] as const;

type BallFilter = (typeof BALL_FILTERS)[number]['value'];

// These are questions about the innings, not a browse — they fill themselves
// by walking back until the innings start or the budget runs out.
const SEARCH_FILTERS: ReadonlySet<BallFilter> = new Set(['highlights', 'wickets', 'sixes', 'fours']);

// Each walk is several upstream requests; past this the reader scrolls for more.
const AUTO_WALK_BUDGET = 14;

function passesFilter(b: BallEntry, filter: BallFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'highlights':
      return b.isWicket || b.batRuns === 4 || b.batRuns === 6;
    case 'wickets':
      return b.isWicket;
    case 'sixes':
      return b.batRuns === 6;
    case 'fours':
      return b.batRuns === 4;
    case 'overs':
      return false;
  }
}

// `over` is the over as a reader counts it: crex's deliveries 63.1–63.6 are the
// 64th over, and its summary row for them is numbered 64.
type FeedRow =
  | { kind: 'ball'; key: string; over: number; ball: BallEntry }
  | { kind: 'over'; key: string; over: number; summary: OverSummary };

const WORD: Record<BallKind, string> = {
  wicket: 'Wicket',
  six: 'Six',
  four: 'Four',
  wide: 'Wide',
  noball: 'No ball',
  extra: 'Extra',
  run: 'Run',
  dot: 'Dot',
};

function word(b: BallEntry, kind: BallKind): string {
  if (kind === 'extra') return b.extra === 'legbye' ? 'Leg bye' : 'Bye';
  if (kind === 'run') return b.runs === 1 ? '1 run' : `${b.runs} runs`;
  return WORD[kind];
}

function BallEvent({ b }: { b: BallEntry }) {
  const kind = ballKind(b);
  const [head, ...rest] = b.text.split('—');
  const body = rest.join('—').trim();
  const big = kind === 'six' || kind === 'four' || kind === 'wicket';

  return (
    <li className={`${styles.event} ${styles[`k_${kind}`]} ${big ? styles.big : ''}`}>
      <span className={styles.at}>
        {b.over}.{b.ball}
      </span>
      <span className={styles.node} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.line1}>
          <span className={styles.word}>{word(b, kind)}</span>
          {b.runs > 0 && kind !== 'run' && <span className={styles.runs}>{runsLabel(b)}</span>}
          {b.scoreAfter && <span className={styles.score}>{b.scoreAfter}</span>}
        </div>
        {body ? (
          <p className={styles.text}>
            <span className={styles.head}>{head.trim()}</span> {body}
          </p>
        ) : (
          <p className={styles.text}>{b.text}</p>
        )}
      </div>
    </li>
  );
}

function overTone(token: string): string {
  const t = token.toUpperCase();
  if (t === 'W' || t.endsWith('W')) return styles.tW;
  if (t.startsWith('6')) return styles.t6;
  if (t.startsWith('4')) return styles.t4;
  if (t === '0') return styles.t0;
  if (/[A-Z]/.test(t)) return styles.tX;
  return '';
}

export function OverCard({ summary }: { summary: OverSummary }) {
  return (
    <li className={styles.overCard}>
      <div className={styles.overHead}>
        <h3 className={styles.overTitle}>End of over {summary.over}</h3>
        <span className={styles.overRuns}>
          {summary.runs} run{summary.runs === 1 ? '' : 's'}
          {summary.wickets > 0 && (
            <span className={styles.overWkts}>
              {' '}
              · {summary.wickets} wkt{summary.wickets === 1 ? '' : 's'}
            </span>
          )}
        </span>
        {summary.score && (
          <span className={styles.overScore}>
            {summary.battingTeam ? `${summary.battingTeam} ` : ''}
            {summary.score}
          </span>
        )}
      </div>
      {summary.balls.length > 0 && (
        <ol className={styles.overBalls} aria-label={`Over ${summary.over} ball by ball`}>
          {summary.balls.map((b, i) => (
            <li key={i} className={`${styles.overBall} ${overTone(b)}`}>
              {b}
            </li>
          ))}
        </ol>
      )}
      <dl className={styles.overPlayers}>
        {summary.batsmen.map((b) => (
          <div key={b.name}>
            <dt>
              <PlayerLink id={b.playerId} name={b.name} />
            </dt>
            <dd>{b.figures}</dd>
          </div>
        ))}
        {summary.bowler && (
          <div className={styles.overBowler}>
            <dt>
              <PlayerLink id={summary.bowler.playerId} name={summary.bowler.name} />
            </dt>
            <dd>{summary.bowler.figures}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

export default function CommentaryFeed({
  balls,
  summaries,
  pending,
  loadingMore,
  exhausted,
  onLoadMore,
}: {
  /** Deliveries, newest first. */
  balls: BallEntry[];
  summaries: OverSummary[];
  pending?: boolean;
  loadingMore?: boolean;
  exhausted?: boolean;
  onLoadMore?: () => void;
}) {
  const [filter, setFilter] = useState<BallFilter>('all');
  const [inning, setInning] = useState<string>('all');
  const inningNum = inning === 'all' ? null : Number(inning);

  const innings = useMemo(() => {
    const seen = new Set<number>();
    for (const b of balls) if (b.inning !== undefined) seen.add(b.inning);
    for (const o of summaries) seen.add(o.inning);
    return [...seen].sort((a, b) => a - b);
  }, [balls, summaries]);

  const rows = useMemo<FeedRow[]>(() => {
    const inScope = (n: number | undefined) => inningNum === null || n === inningNum;
    const ballRows: FeedRow[] = balls
      .filter((b) => inScope(b.inning) && passesFilter(b, filter))
      .map((b) => ({ kind: 'ball' as const, key: b.id, over: b.over + 1, ball: b }));
    // A reader who asked for fours wants fours, not over summaries between them.
    const withOvers = filter === 'all' || filter === 'overs' || filter === 'highlights';
    const overRows: FeedRow[] = withOvers
      ? summaries
          .filter((o) => inScope(o.inning))
          .map((o) => ({ kind: 'over' as const, key: `o-${o.id}`, over: o.over, summary: o }))
      : [];
    const inningOf = (row: FeedRow) => (row.kind === 'over' ? row.summary.inning : row.ball.inning ?? 0);
    return [...overRows, ...ballRows].sort(
      (a, b) =>
        inningOf(b) - inningOf(a) ||
        b.over - a.over ||
        (a.kind === b.kind ? 0 : a.kind === 'over' ? -1 : 1) ||
        (a.kind === 'ball' && b.kind === 'ball' ? b.ball.ball - a.ball.ball : 0)
    );
  }, [balls, summaries, filter, inningNum]);

  const autoWalks = useRef(0);
  const searching = SEARCH_FILTERS.has(filter);

  // Crossing into an earlier innings counts as reaching the start of this one.
  const reachedInningsStart = useMemo(() => {
    if (!balls.length) return false;
    if (new Set(balls.map((b) => b.inning)).size > 1) return true;
    return Math.min(...balls.map((b) => b.over)) === 0;
  }, [balls]);

  const autoFilling = searching && !exhausted && !reachedInningsStart && autoWalks.current < AUTO_WALK_BUDGET;

  useEffect(() => {
    if (!autoFilling || loadingMore || !onLoadMore) return;
    autoWalks.current += 1;
    onLoadMore();
  }, [autoFilling, loadingMore, onLoadMore]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const canScrollLoad = Boolean(onLoadMore) && !exhausted && !autoFilling && (balls.length > 0 || loadingMore);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canScrollLoad || loadingMore || !onLoadMore) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onLoadMore(), {
      rootMargin: '400px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [canScrollLoad, loadingMore, onLoadMore, rows.length]);

  const covered = useMemo(() => {
    const scope = inningNum ?? Math.max(...balls.map((b) => b.inning ?? 0), 0);
    const overs = [
      ...balls.filter((b) => (b.inning ?? 0) === scope).map((b) => b.over + 1),
      ...summaries.filter((o) => o.inning === scope).map((o) => o.over),
    ];
    if (!overs.length) return null;
    return { from: Math.min(...overs), to: Math.max(...overs) };
  }, [balls, summaries, inningNum]);

  return (
    <div className={mc.panel}>
      <section className={mc.block}>
        <div className={styles.controls}>
          <Segmented label="Commentary filter" size="sm" value={filter} options={BALL_FILTERS} onChange={setFilter} />
          {innings.length > 1 && (
            <Segmented
              label="Innings"
              size="sm"
              value={inning}
              onChange={setInning}
              options={[
                { value: 'all', label: 'All innings' },
                ...innings.map((n) => ({ value: String(n), label: `Inn ${n + 1}` })),
              ]}
            />
          )}
        </div>

        {rows.length ? (
          <ol className={styles.feed}>
            {rows.map((row) =>
              row.kind === 'over' ? <OverCard key={row.key} summary={row.summary} /> : <BallEvent key={row.key} b={row.ball} />
            )}
          </ol>
        ) : pending ? (
          <CommentarySkeleton />
        ) : (
          <p className={mc.empty}>
            {filter === 'all' && inningNum === null
              ? 'No commentary yet.'
              : covered
                ? `Nothing between overs ${covered.from} and ${covered.to} matches that filter.`
                : 'Nothing in the feed matches that filter.'}
          </p>
        )}

        {autoFilling && (
          <div role="status" aria-label={covered ? `Searching the innings, read back to over ${covered.from}` : 'Searching the innings'}>
            <CommentarySkeleton balls={2} card={false} />
          </div>
        )}

        {canScrollLoad && (
          <>
            {loadingMore && (
              <div role="status" aria-label="Loading older overs">
                <CommentarySkeleton balls={2} card={false} />
              </div>
            )}
            <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
          </>
        )}
      </section>
    </div>
  );
}
