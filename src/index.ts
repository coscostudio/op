import barba from '@barba/core';

import { greetUser } from '$utils/greet';

import { fadeTransition, patchMainWrapperCSS, updateBodyTheme } from './features/barbaTransitions';
import { barbaViews } from './features/barbaViews';
import { updateNavCurrentState } from './features/nav';

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
});
