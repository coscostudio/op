import { greetUser } from '$utils/greet';

import { initLoopSlider } from './features/loopSlider';
import { initVideoPlayers } from './features/videoPlayer';

/**
 * Elements set to display:none + opacity:0 in Webflow to prevent FOUC.
 * Maps each selector to the display value it should be revealed with.
 * Note: .logo-floating is intentionally excluded — it stays visible from the start.
 */
const REVEAL_MAP: Record<string, string> = {
  '.loop-slider-wrapper': 'block',
  '.logo-container': 'block',
  '.nav': 'flex',
  '.activeitem-title': 'block',
  '.home-blurb': 'block',
};

const FADE_DURATION = '0.5s';

/**
 * Override Webflow's display:none with the correct display value,
 * then fade opacity from 0 → 1 (Webflow CSS already sets opacity:0).
 */
function revealHiddenElements() {
  const entries = Object.entries(REVEAL_MAP)
    .map(([sel, display]) => {
      const el = document.querySelector<HTMLElement>(sel);
      return el ? { el, display } : null;
    })
    .filter((e): e is { el: HTMLElement; display: string } => e !== null);

  if (!entries.length) return;

  // Phase 1: make elements layout-visible but keep them explicitly hidden during the delay
  for (const { el, display } of entries) {
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('display', display, 'important');
  }

  // Phase 2: wait 750ms — apply transition and fade in
  setTimeout(() => {
    requestAnimationFrame(() => {
      for (const { el } of entries) {
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
