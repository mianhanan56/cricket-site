'use client';

import { useEffect } from 'react';
import ErrorState from '@/components/ui/ErrorState';
import { useErrorRetry } from '@/hooks/useErrorRetry';
import styles from './status.module.scss';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { retry, retrying } = useErrorRetry(reset);
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.page}>
      <ErrorState onRetry={retry} retrying={retrying} />
    </div>
  );
}
