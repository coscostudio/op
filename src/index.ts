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

  // Phase 1: make elements layout-visible (they're already opacity:0 from Webflow CSS)
  for (const { el, display } of entries) {
    el.style.display = display;
  }

  // Phase 2: next frame — apply transition and fade in
  requestAnimationFrame(() => {
    for (const { el } of entries) {
      el.style.transition = `opacity ${FADE_DURATION} ease`;
      el.style.opacity = '1';

      el.addEventListener(
        'transitionend',
        () => {
          el.style.removeProperty('transition');
        },
        { once: true }
      );
    }
  });
}

window.Webflow ||= [];
window.Webflow.push(() => {
  const name = 'John Doe';
  greetUser(name);

  revealHiddenElements();
  initLoopSlider();
  initVideoPlayers();
});
