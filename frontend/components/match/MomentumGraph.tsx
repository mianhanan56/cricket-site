'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchEvent, MatchFormat } from '@/types';
import type { InningsWorm, WormPoint } from '@/lib/momentum';
import { SCHEDULED_OVERS, ballsFrom, oversFrom } from '@/lib/overs';
import Segmented from '../ui/Segmented';
import styles from './MomentumGraph.module.scss';

const WORM_H = 190;
const BAR_H = 64;
const GAP = 14;
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 10;
const AXIS_H = 22;

interface Readout {
  key: string;
  text: string;
  tone: 'wicket' | 'moment' | 'point' | 'over';
}

function niceMax(v: number): number {
  if (v <= 0) return 50;
  const step = v > 300 ? 100 : v > 120 ? 50 : 25;
  return Math.ceil(v / step) * step;
}

function lastKnown(points: WormPoint[], balls: number): WormPoint | null {
  let hit: WormPoint | null = null;
  for (const p of points) {
    if (p.balls <= balls) hit = p;
    else break;
  }
  return hit;
}

export default function MomentumGraph({
  worms,
  perOver,
  format,
  moments,
  ballLimit,
}: {
  worms: InningsWorm[];
  perOver: number;
  format: MatchFormat;
  moments: MatchEvent[];
  /** Balls per innings where the format fixes it. */
  ballLimit: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const multi = format === 'TEST';
  const [pick, setPick] = useState<string>(() => String(Math.max(0, worms.length - 1)));
  const [readout, setReadout] = useState<Readout | null>(null);
  const [crossX, setCrossX] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const firstTeam = worms[0]?.teamShortName;
  const tone = (wm: InningsWorm) => (wm.teamShortName === firstTeam ? 'a' : 'b');

  const shown = useMemo(
    () => (multi ? worms.filter((wm) => String(wm.index) === pick) : worms),
    [multi, worms, pick]
  );

  const maxBalls = Math.max(
    multi ? 0 : ballLimit ?? (SCHEDULED_OVERS[format] ?? 0) * perOver,
    ...shown.map((wm) => wm.balls),
    perOver * 5
  );
  const maxRuns = niceMax(Math.max(...shown.map((wm) => wm.runs), 1));
  const maxOverRuns = Math.max(12, ...shown.flatMap((wm) => wm.bars.map((b) => b.runs)));

  const innerW = Math.max(0, w - PAD_L - PAD_R);
  const x = (balls: number) => PAD_L + (balls / Math.max(maxBalls, 1)) * innerW;
  const y = (runs: number) => PAD_T + WORM_H - (runs / maxRuns) * WORM_H;
  const barTop = PAD_T + WORM_H + GAP;
  const totalH = barTop + BAR_H + AXIS_H;
  const overW = innerW / Math.max(1, Math.ceil(maxBalls / perOver));

  const overStep = maxBalls / perOver > 60 ? 20 : maxBalls / perOver > 25 ? 10 : 5;
  const xTicks: number[] = [];
  for (let o = 0; o <= maxBalls / perOver; o += overStep) xTicks.push(o);
  const yTicks = [0, maxRuns / 2, maxRuns].map(Math.round);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const balls = Math.max(0, Math.min(maxBalls, ((px - 0) / rect.width) * maxBalls));
    const parts = shown
      .map((wm) => {
        const p = lastKnown(wm.points, balls);
        if (!p) return null;
        const wk = wm.fall.filter((f) => ballsFrom(f.overs, perOver) <= p.balls).length;
        return `${wm.teamShortName} ${p.runs}/${wk} at ${oversFrom(p.balls, perOver)}`;
      })
      .filter(Boolean);
    const over = Math.floor(balls / perOver) + 1;
    setCrossX(PAD_L + px);
    setReadout({ key: 'hover', tone: 'point', text: `Over ${over} · ${parts.join('  ·  ')}` });
  };

  const summary = shown.map((wm) => `${wm.teamShortName} ${wm.runs}/${wm.wickets} (${oversFrom(wm.balls, perOver)})`).join('  ·  ');

  return (
    <div className={styles.graph}>
      <div className={styles.top}>
        <ul className={styles.legend}>
          {shown.map((wm) => (
            <li key={wm.index} className={styles[`legend_${tone(wm)}`]}>
              <span className={styles.swatch} aria-hidden="true" />
              {wm.teamShortName}
              <span className={styles.legendFig}>
                {wm.runs}/{wm.wickets}
              </span>
            </li>
          ))}
        </ul>
        {multi && worms.length > 1 && (
          <Segmented
            label="Innings"
            size="sm"
            value={pick}
            onChange={setPick}
            options={worms.map((wm) => ({ value: String(wm.index), label: `${wm.teamShortName} ${wm.index + 1}` }))}
          />
        )}
      </div>

      <p className={`${styles.readout} ${readout ? styles[`ro_${readout.tone}`] : ''}`} aria-live="polite">
        {readout?.text ?? summary}
      </p>

      <div ref={ref} className={styles.canvas}>
        {w > 0 && (
          <svg width={w} height={totalH} viewBox={`0 0 ${w} ${totalH}`} className={styles.svg} role="img" aria-label="Match momentum by over">
            {yTicks.map((t) => (
              <g key={t}>
                <line className={styles.grid} x1={PAD_L} x2={w - PAD_R} y1={y(t)} y2={y(t)} />
                <text className={styles.yLabel} x={PAD_L - 6} y={y(t) + 3}>
                  {t}
                </text>
              </g>
            ))}
            <line className={styles.baseline} x1={PAD_L} x2={w - PAD_R} y1={barTop + BAR_H} y2={barTop + BAR_H} />
            {xTicks.map((o) => (
              <g key={o}>
                <line className={styles.tick} x1={x(o * perOver)} x2={x(o * perOver)} y1={barTop + BAR_H} y2={barTop + BAR_H + 4} />
                <text className={styles.xLabel} x={x(o * perOver)} y={totalH - 4}>
                  {o}
                </text>
              </g>
            ))}

            {shown.map((wm) =>
              wm.bars.map((b) => {
                const h = (b.runs / maxOverRuns) * (BAR_H - 6);
                const bx = PAD_L + (b.over - 1) * overW + (shown.length > 1 ? (tone(wm) === 'a' ? 0 : overW / 2) : 0);
                const bw = Math.max(1, (shown.length > 1 ? overW / 2 : overW) - 1.5);
                return (
                  <g key={`${wm.index}-${b.over}`}>
                    <rect
                      className={`${styles.bar} ${styles[`bar_${tone(wm)}`] ?? ''}`}
                      x={bx}
                      y={barTop + BAR_H - h}
                      width={bw}
                      height={Math.max(h, 1)}
                    />
                    {b.wickets > 0 && (
                      <circle className={styles.barWicket} cx={bx + bw / 2} cy={barTop + BAR_H - h - 5} r={2.5} />
                    )}
                  </g>
                );
              })
            )}

            {shown.map((wm) => {
              const d = wm.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.balls).toFixed(1)} ${y(p.runs).toFixed(1)}`).join(' ');
              const last = wm.points[wm.points.length - 1];
              return (
                <g key={wm.index} className={styles[`worm_${tone(wm)}`]}>
                  <path className={styles.area} d={`${d} L${x(last.balls).toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z`} />
                  <path className={styles.line} d={d} />
                  {wm.current && <circle className={styles.now} cx={x(last.balls)} cy={y(last.runs)} r={4} />}
                </g>
              );
            })}

            <rect
              className={styles.hit}
              x={PAD_L}
              y={PAD_T}
              width={innerW}
              height={barTop + BAR_H - PAD_T}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => {
                setReadout(null);
                setCrossX(null);
              }}
            />
            {crossX !== null && (
              <line className={styles.cross} x1={crossX} x2={crossX} y1={PAD_T} y2={barTop + BAR_H} />
            )}

            {shown.map((wm) =>
              wm.fall.map((f) => {
                const b = ballsFrom(f.overs, perOver);
                const text = `Wicket ${f.wicket} — ${f.name} ${f.playerRuns}(${f.playerBalls}) · ${wm.teamShortName} ${f.runs}/${f.wicket} at ${f.overs}`;
                return (
                  <g
                    key={`${wm.index}-w${f.wicket}`}
                    className={styles.marker}
                    tabIndex={0}
                    role="button"
                    aria-label={text}
                    onFocus={() => setReadout({ key: `w${f.wicket}`, tone: 'wicket', text })}
                    onPointerEnter={() => setReadout({ key: `w${f.wicket}`, tone: 'wicket', text })}
                    onClick={() => setReadout({ key: `w${f.wicket}`, tone: 'wicket', text })}
                  >
                    <circle className={styles.hitDot} cx={x(b)} cy={y(f.runs)} r={11} />
                    <circle className={styles.wicketDot} cx={x(b)} cy={y(f.runs)} r={4} />
                  </g>
                );
              })
            )}

            {moments.map((m) => {
              if (m.over == null || m.over * perOver > maxBalls) return null;
              const mx = PAD_L + (m.over - 0.5) * overW;
              const text = `Over ${m.over} · ${m.label}${m.text ? ` — ${m.text}` : ''}`;
              return (
                <g
                  key={m.id}
                  className={styles.marker}
                  tabIndex={0}
                  role="button"
                  aria-label={text}
                  onFocus={() => setReadout({ key: m.id, tone: 'moment', text })}
                  onPointerEnter={() => setReadout({ key: m.id, tone: 'moment', text })}
                  onClick={() => setReadout({ key: m.id, tone: 'moment', text })}
                >
                  <rect className={styles.hitDot} x={mx - 9} y={barTop - 12} width={18} height={18} />
                  <path className={`${styles.moment} ${styles[`moment_${m.kind}`] ?? ''}`} d={`M${mx} ${barTop - 9} l4 4 -4 4 -4 -4 z`} />
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className={styles.axisName}>
        <span>Runs</span>
        <span>Overs</span>
      </div>
    </div>
  );
}
