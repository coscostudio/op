import barba from '@barba/core';
import gsap from 'gsap';

import { greetUser } from '$utils/greet';

import { fadeTransition, patchMainWrapperCSS, updateBodyTheme } from './features/barbaTransitions';
import { barbaViews } from './features/barbaViews';
import { updateNavCurrentState } from './features/nav';
import { getStoredWorkViewMode, initWorkView } from './features/workView';

window.Webflow ||= [];
window.Webflow.push(() => {
  greetUser('John Doe');

  // Strip any display:none or opacity:0 !important Webflow injects on .main-wrapper.
  patchMainWrapperCSS();

  // Apply body theme for the initial hard load before barba runs.
  const initialNamespace = document
    .querySelector('[data-barba-namespace]')
    ?.getAttribute('data-barba-namespace');
  updateBodyTheme(initialNamespace);

  barba.init({
    preventRunning: true,
    transitions: [fadeTransition],
    views: barbaViews,
  });

  // Reset scroll on every page transition.
  barba.hooks.enter(() => {
    window.scrollTo(0, 0);
  });

  // Webflow only sets w--current on hard load — keep nav state correct after transitions.
  barba.hooks.after(() => {
    updateNavCurrentState();
  });

  // ── Back-forward cache (bfcache) restore ────────────────────────────────────
  // When the user navigates away to a non-barba page (404, un-set-up case study)
  // and presses the browser back button, the browser may restore the previous
  // page from bfcache. In that state the barba container is still at opacity:0
  // (left by the leave transition) and namespace-specific features are destroyed.
  // This handler re-shows the page and re-inits what's needed.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;

    const barbaContainer = document.querySelector<HTMLElement>('[data-barba="container"]');
    if (!barbaContainer) return;

    const namespace = barbaContainer.getAttribute('data-barba-namespace');

    // Re-show the container regardless of namespace
    gsap.to(barbaContainer, { opacity: 1, duration: 0.4, ease: 'power1.out' });

    if (namespace === 'work') {
      const savedMode = getStoredWorkViewMode();

      // Set toggle active state before items become visible
      barbaContainer.querySelectorAll<HTMLElement>('.view-toggle').forEach((el) => {
        el.classList.toggle('is-active', el.getAttribute('viewTrigger') === savedMode);
      });

      if (savedMode === 'grid') {
        const gridItems = Array.from(
          barbaContainer.querySelectorAll<HTMLElement>('.workgrid-item')
        );
        gsap.set(gridItems, { opacity: 0, y: 16 });
        gsap.to(gridItems, {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'power2.out',
          stagger: 0.07,
          onComplete: () => initWorkView(barbaContainer),
        });
      } else {
        const items = Array.from(barbaContainer.querySelectorAll<HTMLElement>('.worklist-item'));
        const expandPanels = barbaContainer.querySelectorAll<HTMLElement>('.worklist-expand');
        expandPanels.forEach((el) => gsap.set(el, { display: 'none', height: 0, opacity: 0 }));
        gsap.set(items, { opacity: 0, y: 16 });
        gsap.to(items, {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'power2.out',
          stagger: 0.07,
          onComplete: () => initWorkView(barbaContainer),
        });
      }
    }
  });
});
