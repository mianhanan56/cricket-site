import type { MatchEvent, MatchEventKind } from '@/types';
import Skeleton, { staggerRows } from '../ui/Skeleton';
import styles from './MatchEvents.module.scss';

// Over summaries live in the commentary; here they would drown the moments.
const LISTED: ReadonlyArray<MatchEventKind> = ['WICKET', 'INNINGS_END', 'TARGET', 'TOSS', 'MILESTONE', 'REVIEW'];

const KIND_CLASS: Partial<Record<MatchEventKind, string>> = {
  WICKET: styles.wicket,
  INNINGS_END: styles.innings,
  TARGET: styles.target,
  TOSS: styles.toss,
  MILESTONE: styles.milestone,
  REVIEW: styles.review,
};

export function EventsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ol className={`${styles.list} ${staggerRows}`} role="status" aria-busy="true" aria-label="Loading key moments">
      {Array.from({ length: rows }, (_, i) => (
        <li className={styles.item} key={i}>
          <span className={styles.body}>
            <Skeleton variant="text" width="20" />
            <Skeleton variant="body" width={i % 2 ? '70' : '90'} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The non-delivery moments of a match, newest first, on a vertical rail. */
export default function MatchEvents({
  events,
  limit = 6,
  pending,
}: {
  events: MatchEvent[];
  limit?: number;
  pending?: boolean;
}) {
  const shown = events.filter((e) => LISTED.includes(e.kind)).slice(0, limit);

  if (pending && !shown.length) return <EventsSkeleton />;
  if (!shown.length) return <p className={styles.empty}>No moments reported yet.</p>;

  return (
    <ol className={styles.list}>
      {shown.map((event) => (
        <li key={event.id} className={`${styles.item} ${KIND_CLASS[event.kind] ?? ''}`}>
          <span className={styles.body}>
            <span className={styles.head}>
              <span className={styles.kind}>{event.label}</span>
              {event.over != null && <span className={styles.over}>Over {event.over}</span>}
            </span>
            <span className={styles.text}>{event.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
