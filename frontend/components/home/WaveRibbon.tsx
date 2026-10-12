'use client';

import { useEffect, useId, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from 'react';
import type { Match } from '@/types';
import MatchTile from '../match/MatchTile';
import Icon from '../ui/Icon';
import styles from './WaveRibbon.module.scss';

// One card can't form a wave; it stays on the grid.
const WAVE_MIN = 2;
const DRAG_SLOP = 6;
const SETTLE_MS = 700;

function strideOf(list: HTMLElement): number {
  const [a, b] = Array.from(list.children) as HTMLElement[];
  return a && b ? b.offsetLeft - a.offsetLeft : 0;
}

/** Match tiles on a ribbon bent into a wave in depth: the centre card rides the crest, its neighbours sit back in fog. */
export default function WaveRibbon({ matches, label }: { matches: Match[]; label: string }) {
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [ends, setEnds] = useState({ start: true, end: false });
  const flowing = matches.length >= WAVE_MIN;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const start = el.scrollLeft <= 1;
      const end = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      setEnds((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    el.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    update();
    return () => {
      el.removeEventListener('scroll', schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [matches.length]);

  const scrolls = (el: HTMLElement | null): el is HTMLElement => Boolean(el && el.scrollWidth > el.clientWidth);

  const step = (dir: 1 | -1) => {
    const el = listRef.current;
    const stride = el ? strideOf(el) : 0;
    if (!el || !stride) return;
    el.scrollTo({ left: (Math.round(el.scrollLeft / stride) + dir) * stride, behavior: 'smooth' });
  };

  // Mouse only: touch and trackpads already scroll the ribbon natively.
  const onPointerDown = (e: PointerEvent<HTMLUListElement>) => {
    justDragged.current = false;
    if (e.pointerType !== 'mouse' || e.button !== 0 || !scrolls(listRef.current)) return;
    drag.current = { x: e.clientX, left: listRef.current.scrollLeft, moved: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    const el = listRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_SLOP) return;
      d.moved = true;
      el.setPointerCapture(e.pointerId);
      window.getSelection()?.removeAllRanges();
      setDragging(true);
    }
    el.scrollLeft = d.left - dx;
  };

  const onPointerUp = () => {
    const d = drag.current;
    const el = listRef.current;
    drag.current = null;
    if (!d?.moved || !el) return;
    justDragged.current = true;
    const stride = strideOf(el);
    const from = Math.round(d.left / stride);
    const moved = (el.scrollLeft - d.left) / stride;
    const to = Math.abs(moved) < 0.15 ? from : from + Math.sign(moved) * Math.max(1, Math.round(Math.abs(moved)));
    // Snapping stays off until the glide lands, or the browser would jump to the nearest card mid-way.
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener('scrollend', done);
      setDragging(false);
    };
    const timer = setTimeout(done, SETTLE_MS);
    el.addEventListener('scrollend', done);
    el.scrollTo({ left: to * stride, behavior: 'smooth' });
  };

  const onClickCapture = (e: MouseEvent) => {
    if (!justDragged.current) return;
    justDragged.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // The track scrubs card by card: press to glide there, drag to follow.
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    const el = listRef.current;
    const stride = el ? strideOf(el) : 0;
    if (!el || !stride) return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    el.scrollTo({
      left: Math.round(at * Math.round((el.scrollWidth - el.clientWidth) / stride)) * stride,
      behavior: e.type === 'pointerdown' ? 'smooth' : 'auto',
    });
  };

  // Tabbing onto a card in the fog brings it to the centre, where it can be read.
  const onFocus = (e: FocusEvent<HTMLUListElement>) => {
    if (!scrolls(listRef.current) || !(e.target as HTMLElement).matches(':focus-visible')) return;
    (e.target as HTMLElement).closest('li')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  };

  return (
    <div className={`${styles.frame} ${flowing ? styles.flowing : ''}`}>
      <ul
        ref={listRef}
        id={id}
        className={`${styles.ribbon} ${dragging ? styles.dragging : ''}`}
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
        onFocus={onFocus}
      >
        {matches.map((m) => (
          <li key={m.id} className={styles.slot}>
            <div className={styles.card}>
              <MatchTile match={m} />
            </div>
          </li>
        ))}
      </ul>
      {flowing && !(ends.start && ends.end) && (
        <div className={styles.controls}>
          <div
            className={styles.track}
            aria-hidden="true"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              scrub(e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e);
            }}
          >
            <span className={styles.thumb} />
          </div>
          <button
            type="button"
            className={styles.step}
            aria-label="Previous match"
            aria-controls={id}
            disabled={ends.start}
            onClick={() => step(-1)}
          >
            <Icon name="chevronLeft" />
          </button>
          <button
            type="button"
            className={styles.step}
            aria-label="Next match"
            aria-controls={id}
            disabled={ends.end}
            onClick={() => step(1)}
          >
            <Icon name="chevronRight" />
          </button>
        </div>
      )}
    </div>
  );
}
