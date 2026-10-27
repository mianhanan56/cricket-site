import Link from 'next/link';
import { ON_INTENT } from '@/lib/intentPrefetch';
import type { ReactNode } from 'react';
import Skeleton, { stagger } from '../ui/Skeleton';
import Icon from '../ui/Icon';
import styles from './FormCard.module.scss';

export type Discipline = 'batting' | 'bowling';
export type Tier = 'landmark' | 'notable' | 'plain';

const CHART_H = 120;

export function tierOf(lead: number, discipline: Discipline): Tier {
  const [notable, landmark] = discipline === 'batting' ? [50, 100] : [3, 5];
  return lead >= landmark ? 'landmark' : lead >= notable ? 'notable' : 'plain';
}

export function StatTiles({ stats }: { stats: Array<[string, string | number]> }) {
  return (
    <dl className={styles.stats}>
      {stats.map(([label, value]) => (
        <div key={label} className={styles.stat}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface FormBar {
  /** Runs batting, wickets bowling — what the bar measures. */
  lead: number;
  label: string;
}

/** One match on the chart: a bar per innings, the caption under them. */
export interface FormColumn {
  key: string;
  bars: FormBar[];
  caption: string;
  title: string;
  href: string | null;
}

/** Oldest to latest, each figure above its bar. `average` draws a line, in the bars' own unit. */
export function FormBars({
  columns,
  discipline,
  average,
}: {
  columns: FormColumn[];
  discipline: Discipline;
  average?: number | null;
}) {
  const leads = columns.flatMap((c) => c.bars.map((b) => b.lead));
  if (!leads.length) return null;
  const scale = Math.max(discipline === 'batting' ? 60 : 4, ...leads);
  const y = (v: number) => CHART_H - (v / scale) * CHART_H;

  return (
    <div className={styles.chart}>
      <div className={styles.plot}>
        {average != null && average > 0 && (
          <svg className={styles.avgLine} viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" x2="100" y1={y(average)} y2={y(average)} />
          </svg>
        )}
        <ol className={styles.bars}>
          {columns.map((c) => {
            const body = (
              <>
                <span className={styles.tracks}>
                  {c.bars.map((b, n) => {
                    const tier = tierOf(b.lead, discipline);
                    return (
                      <span key={n} className={styles.track}>
                        <span className={`${styles.value} ${styles[tier]}`}>{b.label}</span>
                        {/* In twentieths of the chart's height; the stylesheet maps each step to a height. */}
                        <span className={`${styles.fill} ${styles[tier]}`} data-step={Math.round((b.lead / scale) * 20)} />
                      </span>
                    );
                  })}
                </span>
                <span className={styles.caption}>{c.caption}</span>
              </>
            );
            return (
              <li key={c.key} className={styles.col} data-pair={c.bars.length > 1 || undefined}>
                {c.href ? (
                  <Link {...ON_INTENT} href={c.href} className={styles.bar} aria-label={c.title} title={c.title}>
                    {body}
                  </Link>
                ) : (
                  <span className={styles.bar} role="img" aria-label={c.title} title={c.title}>
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function MoreToggle({ open, count, onToggle }: { open: boolean; count: number; onToggle: () => void }) {
  return (
    <button type="button" className={styles.more} aria-expanded={open} onClick={onToggle}>
      {open ? 'Hide innings' : count === 1 ? 'Show the innings' : `Show all ${count} innings`}
      <Icon name="chevronDown" size={17} className={styles.moreIcon} />
    </button>
  );
}

export function FormRow({
  href,
  fig,
  tier,
  title,
  sub,
  aside,
}: {
  href: string | null;
  fig: string;
  tier: Tier;
  title: string;
  sub: string;
  aside?: ReactNode;
}) {
  const body = (
    <>
      <span className={`${styles.fig} ${styles[tier]}`}>{fig}</span>
      <span className={styles.match}>
        <span className={styles.fixture}>{title}</span>
        {sub && <span className={styles.date}>{sub}</span>}
      </span>
      {aside}
    </>
  );
  return (
    <li>
      {href ? (
        <Link {...ON_INTENT} href={href} className={styles.row}>
          {body}
        </Link>
      ) : (
        <div className={styles.row}>{body}</div>
      )}
    </li>
  );
}

const SK_STATS = [0, 1, 2, 3];
const SK_BARS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The tiles and the chart, in the boxes they will fill. */
export function FormCardSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.card}>
      {children}
      <div className={`${styles.stats} ${stagger}`}>
        {SK_STATS.map((i) => (
          <Skeleton key={i} className={styles.skStat} />
        ))}
      </div>
      <div className={`${styles.skBars} ${stagger}`}>
        {SK_BARS.map((i) => (
          <Skeleton key={i} className={styles.skBar} />
        ))}
      </div>
    </div>
  );
}
