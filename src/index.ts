import { greetUser } from '$utils/greet';

import { initLoopSlider } from './features/loopSlider';
import { initVideoPlayers } from './features/videoPlayer';

/**
 * Elements set to opacity:0 in Webflow to prevent FOUC.
 * We only manipulate opacity to avoid breaking Webflow's native display property breakpoints.
 * Note: .logo-floating is intentionally excluded — it stays visible from the start.
 */
const REVEAL_SELECTORS = [
  '.loop-slider-wrapper',
  '.logo-container',
  '.nav',
  '.nav.background',
  '.nav-wrapper-mobile',
  '.activeitem-title',
  '.home-blurb',
];

const FADE_DURATION = '0.5s';

/**
 * Fade opacity from 0 → 1 (Webflow CSS already sets opacity:0).
 */
function revealHiddenElements() {
  const elements = REVEAL_SELECTORS.reduce<HTMLElement[]>((acc, sel) => {
    // Select all matching elements for classes like .nav.background that might have multiple instances
    const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
    return acc.concat(els);
  }, []);

  if (!elements.length) return;

  // Phase 1: Wait 750ms — apply transition and fade in
  setTimeout(() => {
    requestAnimationFrame(() => {
      for (const el of elements) {
        el.style.setProperty('transition', `opacity ${FADE_DURATION} ease`, 'important');
        el.style.setProperty('opacity', '1', 'important');

        el.addEventListener(
          'transitionend',
          () => {
            el.style.removeProperty('transition');
          },
          { once: true }
        );
      }
    });
  }, 750);
}

window.Webflow ||= [];
window.Webflow.push(() => {
  const name = 'John Doe';
  greetUser(name);

  revealHiddenElements();
  initLoopSlider();
  initVideoPlayers();
});
