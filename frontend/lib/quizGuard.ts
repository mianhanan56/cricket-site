// Limits on how often the quiz route may start a model call. Pure, so they are tested without Next.

/** A match whose quiz failed is not tried again until the next window. */
export const RETRY_WINDOW_MS = 15 * 60_000;

export const retryWindow = (now: number): number => Math.floor(now / RETRY_WINDOW_MS);

export interface Budget {
  /** Takes one from the window's allowance; false when it is spent. */
  spend(now: number): boolean;
}

export function createBudget(max: number, windowMs: number): Budget {
  let start = 0;
  let used = 0;
  return {
    spend(now) {
      if (now - start >= windowMs) {
        start = now;
        used = 0;
      }
      if (used >= max) return false;
      used += 1;
      return true;
    },
  };
}
