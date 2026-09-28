'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { TracePoint } from '@/lib/pulse';
import styles from './PulseTrace.module.scss';

const H = 64;
const MID = 36;
const AMP = 26;

function Tip({ point, edge }: { point: TracePoint; edge: string }) {
  return (
    <span className={`${styles.tip} ${edge}`}>
      <span className={styles.tipHead}>
        <span className={styles.tipAt}>{point.at}</span>
        <span className={`${styles.tipWord} ${styles[`t_${point.kind}`] ?? ''}`}>{point.summary}</span>
        {point.score && <span className={styles.tipScore}>{point.score}</span>}
      </span>
      {point.detail && <span className={styles.tipDetail}>{point.detail}</span>}
    </span>
  );
}

/**
 * The last deliveries as a heartbeat: dots run flat, runs lift the line,
 * boundaries spike it, a wicket drops below the crease. Drawn in real pixels
 * so markers stay round at any width.
 */
export default function PulseTrace({ points, label, still }: { points: TracePoint[]; label?: string; still?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(touchTimer.current), []);

  if (points.length < 2) return null;

  const step = w / points.length;
  const xAt = (i: number) => step * i + step / 2;
  const yAt = (i: number) => MID - points[i].level * AMP;
  let d = `M0 ${MID}`;
  const marks: Array<{ x: number; y: number; kind: TracePoint['kind']; id: string }> = [];
  points.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(i);
    d += ` L${(x - step * 0.32).toFixed(1)} ${MID} L${x.toFixed(1)} ${y.toFixed(1)} L${(x + step * 0.32).toFixed(1)} ${MID}`;
    if (p.kind === 'six' || p.kind === 'four' || p.kind === 'wicket') marks.push({ x, y, kind: p.kind, id: p.id });
  });
  d += ` L${w} ${MID}`;

  const lastIndex = points.length - 1;
  const last = points[lastIndex];
  const shown = active !== null && active < points.length ? active : null;
  const third = points.length / 3;
  const edge = (i: number) => (i < third ? styles.start : i >= points.length - third ? styles.end : '');

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return setActive(null);
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!delta) return;
    e.preventDefault();
    setActive((i) => Math.max(0, Math.min(lastIndex, (i ?? lastIndex + (delta > 0 ? -1 : 1)) + delta)));
  };

  // A tap has no hover to end it, so the tip clears itself.
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(() => setActive(null), 2400);
  };

  return (
    <div
      ref={ref}
      className={styles.wrap}
      tabIndex={0}
      aria-label={label ?? 'Pulse of the last deliveries'}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
      onPointerUp={onPointerUp}
    >
      {w > 0 && (
        <svg className={styles.trace} width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true">
          <line className={styles.crease} x1="0" x2={w} y1={MID} y2={MID} />
          {shown !== null && <line className={styles.guide} x1={xAt(shown)} x2={xAt(shown)} y1="0" y2={H} />}
          {/* Drawn in once; re-keying per ball replayed the draw and left the markers floating past a half line. */}
          <path className={styles.path} d={d} pathLength={1} />
          {marks.map((m) => (
            <circle key={m.id} className={`${styles.mark} ${styles[m.kind]}`} cx={m.x} cy={m.y} r="3.5" />
          ))}
          <circle key={`now-${last.id}`} className={`${styles.now} ${still ? styles.held : ''}`} cx={xAt(lastIndex)} cy={yAt(lastIndex)} r="4" />
          {shown !== null && (
            <circle className={`${styles.focus} ${styles[points[shown].kind] ?? ''}`} cx={xAt(shown)} cy={yAt(shown)} r="4.5" />
          )}
        </svg>
      )}
      <div className={styles.hits} aria-hidden="true">
        {points.map((p, i) => (
          <span key={p.id} className={styles.hit} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}>
            {i === shown && <Tip point={p} edge={edge(i)} />}
          </span>
        ))}
      </div>
      <span className={styles.live} aria-live="polite">
        {shown !== null && [points[shown].at, points[shown].summary, points[shown].detail, points[shown].score].filter(Boolean).join(', ')}
      </span>
    </div>
  );
}
