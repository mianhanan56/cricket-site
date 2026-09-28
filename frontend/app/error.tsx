'use client';

import { useEffect } from 'react';
import ErrorState from '@/components/ui/ErrorState';
import styles from './status.module.scss';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.page}>
      <ErrorState onRetry={reset} />
    </div>
  );
}
