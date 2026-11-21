import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]';

/** Keeps Tab and Shift+Tab cycling inside a modal surface, plus any controls outside it (in order after it). */
export function trapTab(
  e: KeyboardEvent | ReactKeyboardEvent,
  container: HTMLElement | null,
  ...after: Array<HTMLElement | null>
): void {
  if (e.key !== 'Tab' || !container) return;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE), ...after]
    .filter((el): el is HTMLElement => Boolean(el))
    .filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
  const first = items[0];
  const last = items[items.length - 1];
  const at = document.activeElement;
  if (!first || !last) {
    e.preventDefault();
    return;
  }
  const outside = !items.some((el) => el === at || el.contains(at));
  if (e.shiftKey && (at === first || outside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (at === last || outside)) {
    e.preventDefault();
    first.focus();
  }
}
