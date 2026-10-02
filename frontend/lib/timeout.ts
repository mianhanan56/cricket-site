/**
 * `signal` with a deadline added. Where `AbortSignal.any` is missing (Safari < 17.4)
 * the two are linked by hand, so a caller-supplied signal never drops the deadline.
 */
export function withTimeout(ms: number, signal?: AbortSignal): AbortSignal | undefined {
  if (typeof AbortController === 'undefined') return signal;
  if (typeof AbortSignal.timeout === 'function' && (!signal || typeof AbortSignal.any === 'function')) {
    const deadline = AbortSignal.timeout(ms);
    return signal ? AbortSignal.any([signal, deadline]) : deadline;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
  const follow = () => {
    clearTimeout(timer);
    controller.abort(signal?.reason);
  };
  if (signal?.aborted) follow();
  else signal?.addEventListener('abort', follow, { once: true });
  return controller.signal;
}
