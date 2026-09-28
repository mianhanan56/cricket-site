import type { PulseReading } from '@/lib/pulse';
import styles from './MatchPulse.module.scss';

const CELLS = 10;

/**
 * Four meters built from the last deliveries. Each prints the figure it was
 * built from, so a bar is never a number the reader has to take on trust.
 */
export default function MatchPulse({
  readings,
  window,
  compact = false,
}: {
  readings: PulseReading[];
  /** How many deliveries the readings cover. */
  window?: number;
  compact?: boolean;
}) {
  return (
    <div className={`${styles.pulse} ${compact ? styles.compact : ''}`}>
      <dl className={styles.list}>
        {readings.map((r) => {
          const lit = Math.round(r.value * CELLS);
          return (
            <div key={r.key} className={`${styles.row} ${styles[r.key]}`}>
              <dt className={styles.label}>{r.label}</dt>
              <dd className={styles.meterCell}>
                <svg
                  className={styles.meter}
                  viewBox={`0 0 ${CELLS * 10} 8`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${r.label}: ${r.figure}`}
                >
                  {Array.from({ length: CELLS }, (_, i) => (
                    <rect
                      key={i}
                      x={i * 10}
                      y="0"
                      width="8"
                      height="8"
                      rx="1"
                      className={i < lit ? styles.on : styles.off}
                    />
                  ))}
                </svg>
              </dd>
              <dd key={r.figure} className={styles.figure}>
                {r.figure}
              </dd>
            </div>
          );
        })}
      </dl>
      {window ? <p className={styles.window}>Last {window} balls</p> : null}
    </div>
  );
}
