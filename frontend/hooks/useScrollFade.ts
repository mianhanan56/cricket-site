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

/**
 * Keeps a scroller's selected child (`aria-checked` / `aria-selected` / `aria-current`) in view,
 * so a tab picked at a faded edge, or the last one on a phone, isn't left half hidden.
 * `key` changes whenever the selection or the row's width might have.
 */
export function useActiveInView(ref: RefObject<HTMLElement>, key: string): void {
  useEffect(() => {
    const row = ref.current;
    const on = row?.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"], [aria-current="page"]');
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect();
    const o = on.getBoundingClientRect();
    if (o.left < r.left + 16) row.scrollLeft -= r.left - o.left + 32;
    else if (o.right > r.right - 16) row.scrollLeft += o.right - r.right + 32;
  }, [ref, key]);
}
