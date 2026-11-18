import { useEffect } from 'react';
import { useLocation } from 'react-router';

export function RouteHeadingFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    let observer: MutationObserver | undefined;
    let timeout: number | undefined;
    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>('main h1, h1');
      if (!heading) return false;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      observer?.disconnect();
      if (timeout !== undefined) window.clearTimeout(timeout);
      return true;
    };
    const frame = window.requestAnimationFrame(() => {
      if (focusHeading()) return;
      observer = new MutationObserver(() => { focusHeading(); });
      observer.observe(document.querySelector('main') ?? document.body, { childList: true, subtree: true });
      timeout = window.setTimeout(() => observer?.disconnect(), 10000);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [pathname]);
  return null;
}
