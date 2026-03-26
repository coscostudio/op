/**
 * Updates w--current on nav links to match the current pathname.
 * Webflow only sets this class on hard load — call after every barba transition.
 * Skips links with no real destination (empty href, hash-only) — these are modal/action triggers.
 */
export const updateNavCurrentState = () => {
  const currentPath = window.location.pathname;
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const raw = link.getAttribute('href') ?? '';
    if (!raw || raw.startsWith('#')) return;
    const linkPath = new URL(link.href, window.location.origin).pathname;
    if (linkPath === currentPath) {
      link.classList.add('w--current');
    } else {
      link.classList.remove('w--current');
    }
  });
};
