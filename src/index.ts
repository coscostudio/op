import barba from '@barba/core';
import gsap from 'gsap';

import { hideForEntrance, playEntrance } from '$utils/entrance';
import { greetUser } from '$utils/greet';

import { fadeTransition, patchMainWrapperCSS, updateBodyTheme } from './features/barbaTransitions';
import { barbaViews } from './features/barbaViews';
import {
  destroyIntroSequence,
  initIntroSequence,
  waitForIntroFadeOut,
} from './features/introSequence';
import { closeMobileNav, initMobileNav } from './features/mobileNav';
import {
  enableChromeThemeSync,
  expandNavLogoForTransition,
  initNavClock,
  updateNavCurrentState,
  updateNavPageState,
} from './features/nav';
import { initRenderToReality } from './features/renderToReality';
import { getStoredWorkViewMode, GRID_ITEM_SELECTOR, initWorkView } from './features/workView';

const initIntroSequenceOnDomReady = () => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIntroSequence, { once: true });
    return;
  }

  initIntroSequence();
};

initIntroSequenceOnDomReady();

window.Webflow ||= [];
window.Webflow.push(() => {
  initMobileNav();
  initNavClock();

  greetUser('John Doe');

  // Strip any display:none or opacity:0 !important Webflow injects on .main-wrapper.
  patchMainWrapperCSS();

  // Apply body theme for the initial hard load before barba runs.
  const initialNamespace = document
    .querySelector('[data-barba-namespace]')
    ?.getAttribute('data-barba-namespace');
  updateBodyTheme(initialNamespace);
  updateNavPageState(initialNamespace, undefined, true, true);
  // Body/status bar stay dark (head CSS) through the intro; html[data-chrome] only starts being
  // driven by the nav state as the intro fades out. Resolves immediately when there's no intro.
  waitForIntroFadeOut().then(enableChromeThemeSync);

  barba.init({
    preventRunning: true,
    transitions: [fadeTransition],
    views: barbaViews,
  });

  // Kill intro if the user navigates before it finishes.
  barba.hooks.before(() => {
    destroyIntroSequence();
    closeMobileNav(false, true);
    expandNavLogoForTransition();
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
    updateNavPageState(namespace, barbaContainer);

    if (namespace === 'work') {
      const savedMode = getStoredWorkViewMode();

      // Set toggle active state before items become visible
      barbaContainer.querySelectorAll<HTMLElement>('.view-toggle').forEach((el) => {
        el.classList.toggle('is-active', el.getAttribute('viewTrigger') === savedMode);
      });

      const worklist = barbaContainer.querySelector<HTMLElement>('.component-worklist');
      const workgrid = barbaContainer.querySelector<HTMLElement>('.component-workgrid');
      if (savedMode === 'grid') {
        if (worklist) gsap.set(worklist, { display: 'none' });
        if (workgrid) gsap.set(workgrid, { display: 'block', opacity: 1 });
      } else {
        barbaContainer
          .querySelectorAll<HTMLElement>('.worklist-expand')
          .forEach((el) => gsap.set(el, { display: 'none', height: 0, opacity: 0 }));
      }
      const items = Array.from(
        barbaContainer.querySelectorAll<HTMLElement>(
          savedMode === 'grid' ? GRID_ITEM_SELECTOR : '.worklist-item'
        )
      );
      hideForEntrance(items);
      playEntrance(items, () => initWorkView(barbaContainer));
    } else if (namespace === 'cases') {
      initRenderToReality(barbaContainer);
    }
  });
});
