import type { Broadcaster } from '@/lib/broadcasters';
import Icon from '../ui/Icon';
import styles from './WatchLinks.module.scss';

/** Broadcasters as links to their own sites; one we have no site for is named, not linked. */
export default function WatchLinks({ list, matchLabel }: { list: Broadcaster[]; matchLabel: string }) {
  return (
    <ul className={styles.list}>
      {list.map((b) => (
        <li key={b.name}>
          {b.url ? (
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
              aria-label={`Watch ${matchLabel} on ${b.name} (opens in a new tab)`}
            >
              {b.name}
              <Icon name="arrowRight" size={15} className={styles.out} />
            </a>
          ) : (
            <span className={styles.plain}>{b.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
