import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBudget, RETRY_WINDOW_MS, retryWindow } from '../lib/quizGuard';

describe('quiz generation limits', () => {
  it('spends the budget, then refuses until the window turns', () => {
    const budget = createBudget(3, 1_000);
    assert.deepEqual([1, 2, 3, 4, 5].map((i) => budget.spend(10_000 + i)), [true, true, true, false, false]);
    assert.equal(budget.spend(11_001), true);
  });

  it('holds a failure for its window: same window inside it, a new one after', () => {
    const start = 40 * RETRY_WINDOW_MS;
    assert.equal(retryWindow(start), retryWindow(start + RETRY_WINDOW_MS - 1));
    assert.equal(retryWindow(start + RETRY_WINDOW_MS), retryWindow(start) + 1);
  });
});
