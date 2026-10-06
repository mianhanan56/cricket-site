import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Retry for an error boundary. `reset()` alone re-renders the failed server
 * payload; refreshing first fetches the page again.
 */
export function useErrorRetry(reset: () => void): { retry: () => void; retrying: boolean } {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return { retry, retrying };
}
