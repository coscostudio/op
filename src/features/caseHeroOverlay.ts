/**
 * Keeps the case hero's sticky title block (.case-hero-overlay-sticky) from turning the iOS
 * status bar opaque, while letting it scroll up under the (see-through) status bar like normal
 * content.
 *
 * Why: iOS/iPadOS Safari 26+ tints the status bar from position:fixed/sticky elements touching the
 * top edge. While the block is stuck at its CSS `top` that's fine, but once the end of the hero
 * pushes it up it eventually reaches the edge and the status bar goes opaque.
 *
 * How: while it's being pushed it moves 1:1 with the page — exactly like normal-flow content. So
 * partway into the push (well before the top edge) it's switched to position:relative at the
 * exact same spot (no visual change), and from then on scrolls natively under the status bar.
 * Scrolling back up, it's switched back to sticky while still inside the push (again seamless).
 */

const HERO_SELECTOR = '.component-case-header-top';
const OVERLAY_SELECTOR = '.case-hero-overlay-sticky';
// Hand off to normal flow once pushed this far up from its stuck position (must stay clear of
// the top edge, where Safari samples ~4px)…
const RELEASE_AFTER_PX = 32;
// …and hand back to sticky once it comes back within this distance (hysteresis; both points are
// inside the push, where sticky and normal flow positions coincide).
const RESTORE_WITHIN_PX = 16;

let cleanups: Array<() => void> = [];

const bindOverlay = (overlay: HTMLElement) => {
  let rafId = 0;
  let released = false;
  // Where the block sits while stuck (its CSS `top`, e.g. 4rem). Only read while sticky.
  let stuckTop = Number.parseFloat(getComputedStyle(overlay).top) || 0;

  const release = () => {
    const before = overlay.getBoundingClientRect().top;
    overlay.style.position = 'relative';
    overlay.style.top = '0px';
    const flow = overlay.getBoundingClientRect().top;
    overlay.style.top = `${before - flow}px`;
    released = true;
  };

  const restore = () => {
    overlay.style.position = '';
    overlay.style.top = '';
    released = false;
  };

  const update = () => {
    rafId = 0;
    const { top } = overlay.getBoundingClientRect();
    if (!released && top < stuckTop - RELEASE_AFTER_PX) release();
    else if (released && top > stuckTop - RESTORE_WITHIN_PX) restore();
  };

  const request = () => {
    if (!rafId) rafId = window.requestAnimationFrame(update);
  };

  const onResize = () => {
    restore(); // re-measure from the real sticky layout
    stuckTop = Number.parseFloat(getComputedStyle(overlay).top) || 0;
    request();
  };

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', onResize);
  update();

  cleanups.push(() => {
    window.removeEventListener('scroll', request);
    window.removeEventListener('resize', onResize);
    if (rafId) window.cancelAnimationFrame(rafId);
    restore();
  });
};

export const initCaseHeroOverlay = (root: ParentNode = document) => {
  destroyCaseHeroOverlay();
  root.querySelectorAll<HTMLElement>(`${HERO_SELECTOR} ${OVERLAY_SELECTOR}`).forEach(bindOverlay);
};

export const destroyCaseHeroOverlay = () => {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
};
