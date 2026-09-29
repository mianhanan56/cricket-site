import { useEffect, type RefObject } from 'react';

/**
 * Marks a horizontal scroller with the edges that still hide content —
 * `data-fade="start" | "end" | "both"` — for the `scroll-fade` mixin to shade.
 */
export function useScrollFade(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const hidden = el.scrollWidth - el.clientWidth > 1;
      const start = hidden && el.scrollLeft > 1;
      const end = hidden && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      el.dataset.fade = start && end ? 'both' : start ? 'start' : end ? 'end' : '';
    };

    el.addEventListener('scroll', update, { passive: true });
    // Children too: a count arriving widens the row without resizing the scroller.
    const observer = new ResizeObserver(update);
    const watch = () => {
      observer.observe(el);
      Array.from(el.children).forEach((child) => observer.observe(child));
      update();
    };
    // A tab added later (a points table that loads after the page) has to be watched as well.
    const children = new MutationObserver(watch);
    children.observe(el, { childList: true });
    watch();
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
      children.disconnect();
    };
  }, [ref]);
}
