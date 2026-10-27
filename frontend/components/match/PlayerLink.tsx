import Link from 'next/link';
import { ON_INTENT } from '@/lib/intentPrefetch';
import styles from './matchCenter.module.scss';

/**
 * A player's name, linked to their profile. Styled as text — a scorecard of
 * forty accent-coloured names is unreadable. Names without a key stay plain.
 */
export default function PlayerLink({
  id,
  name,
  className,
  children,
}: {
  id: string | null | undefined;
  name: string;
  className?: string;
  children?: React.ReactNode;
}) {
  if (!id) {
    return (
      <span className={className}>
        {name}
        {children}
      </span>
    );
  }
  return (
    <Link {...ON_INTENT} href={`/players/${id}`} className={`${styles.playerLink} ${className ?? ''}`}>
      {name}
      {children}
    </Link>
  );
}
