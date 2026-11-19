let locks = 0;

// Locked on <html>, not <body>: html's overflow-x: clip stops body overflow reaching the
// viewport, so a hidden body collapses to one screen and the page snaps to the top.
export function lockScroll(): () => void {
  if (locks++ === 0) document.documentElement.classList.add('scroll-locked');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) document.documentElement.classList.remove('scroll-locked');
  };
}
