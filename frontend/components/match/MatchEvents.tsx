// Recent events, as the ball feed reported them: wickets, overs closing, an
// innings ending, a target, the toss, milestones, umpire reviews.
//
// Two things are deliberately NOT here:
//
//   crex's written updates ("Until then, I am Dev Rajawat, signing off…") arrive
//   in the same feed, as `NOTE` events. They are commentary — paragraphs of it —
//   and they belong in the Commentary tab, where a reader has gone looking for
//   prose. Listed here they buried the facts this panel exists to show, which is
//   what made the page read as a wall of "Update" badges.
//
//   The current stoppage is not here either. It is a state rather than an event,
//   and the header's status pill is where a reader already looks for it.
//
// Over summaries stay in: they are the same events the header's ball strip is
// drawn from, but stated rather than plotted, and they are what keeps this list
// populated through a quiet passage of play. Their row carries no over column —
// the label is the over number — so the two never print the same figure twice.

import type { MatchEvent, MatchEventKind } from '@/types';
import Skeleton, { staggerRows } from '../ui/Skeleton';
import styles from './MatchEvents.module.scss';

/**
 * The kinds this panel lists. An allowlist rather than an exclusion, so adding a
 * new event kind to the decoder cannot silently drop prose onto the page.
 */
const LISTED: ReadonlyArray<MatchEventKind> = [
  'WICKET',
  'OVER',
  'INNINGS_END',
  'TARGET',
  'TOSS',
  'MILESTONE',
  'REVIEW',
];

const KIND_CLASS: Partial<Record<MatchEventKind, string>> = {
  WICKET: styles.kindWicket,
  OVER: styles.kindOver,
  INNINGS_END: styles.kindInnings,
  TARGET: styles.kindTarget,
  TOSS: styles.kindToss,
  MILESTONE: styles.kindMilestone,
  REVIEW: styles.kindReview,
};

export interface MatchEventsProps {
  events: MatchEvent[];
  /** How many rows to list. Six is about a passage of play. */
  limit?: number;
  /** Placeholder text while the first poll is in flight. */
  pending?: boolean;
}

/** Ragged sentence widths, so stacked bars read as events rather than as a grid. */
const TEXT_WIDTHS: Array<'60' | '70' | '80' | '90'> = ['80', '60', '90', '70'];

/**
 * Placeholder rows in the real list's geometry.
 *
 * Lives here rather than in MatchDetailSkeleton because it borrows this module's
 * grid: the row layout and its placeholder cannot drift apart if they are defined
 * against the same classes.
 */
export function EventsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ol
      className={`${styles.list} ${styles.skeleton} ${staggerRows}`}
      role="status"
      aria-busy="true"
      aria-label="Loading match events"
    >
      {Array.from({ length: rows }, (_, i) => (
        <li className={styles.item} key={i}>
          <Skeleton className={styles.kindSk} />
          <span className={styles.textSk}>
            <Skeleton variant="body" width={TEXT_WIDTHS[i % TEXT_WIDTHS.length]} />
          </span>
          <Skeleton variant="text" className={styles.overSk} />
        </li>
      ))}
    </ol>
  );
}

export default function MatchEvents({ events, limit = 6, pending }: MatchEventsProps) {
  const shown = events.filter((e) => LISTED.includes(e.kind)).slice(0, limit);

  // A load in progress gets placeholder rows in the shape of real ones, like every
  // other panel on the page — the reader sees the list arriving rather than a line
  // of text that has to be read and then replaced.
  if (pending && !shown.length) return <EventsSkeleton />;

  if (!shown.length) {
    // A real state — a match yet to be bowled at — so it says so in one line
    // rather than holding open an empty container.
    return <p className={styles.empty}>No events reported yet.</p>;
  }

  return (
    <ol className={styles.list}>
      {shown.map((event) => {
        // An over row's label already names the over; printing "Ov 34" beside
        // "End of over 34" is the same number twice.
        const showOver = event.kind !== 'OVER' && event.over !== null && event.over !== undefined;

        return (
          <li key={event.id} className={styles.item}>
            <span className={`${styles.kind} ${KIND_CLASS[event.kind] ?? ''}`}>{event.label}</span>
            <span className={styles.text}>{event.text}</span>
            {showOver && <span className={styles.over}>Ov {event.over}</span>}
          </li>
        );
      })}
    </ol>
  );
}
