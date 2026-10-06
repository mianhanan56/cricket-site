'use client';

import { useEffect } from 'react';
import { PageHeader } from '@/components/ui/Section';
import ErrorState from '@/components/ui/ErrorState';
import { useErrorRetry } from '@/hooks/useErrorRetry';
import styles from '@/components/rankings/RankingsView.module.scss';

export default function RankingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { retry, retrying } = useErrorRetry(reset);
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="ICC Rankings" title="Rankings" />
      <ErrorState title="Rankings didn’t load" body="The ICC lists couldn’t be fetched. Try again in a moment." onRetry={retry} retrying={retrying} />
    </div>
  );
}
