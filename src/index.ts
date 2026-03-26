import barba from '@barba/core';
import gsap from 'gsap';

import { greetUser } from '$utils/greet';

import { destroyLoopSlider, initLoopSlider, remeasureLoopSlider } from './features/loopSlider';
import { updateNavCurrentState } from './features/nav';
import { initVideoPlayers } from './features/videoPlayer';

/**
 * CSS to paste into Webflow → .global-styles embed (REPLACE existing opacity/display rules):
 *
 *   [data-barba="wrapper"] { position: relative; }
 *   .main-wrapper { opacity: 0; }
 *   .logo-container, .nav, .nav-wrapper-mobile { opacity: 0; }
 *
 * IMPORTANT: No !important, no display:none — GSAP controls all opacity from here.
 * display:none breaks layout measurement (slider getBoundingClientRect returns 0).
 * !important blocks GSAP inline-style overrides entirely.
 *
 * [data-barba="wrapper"] needs position:relative so the outgoing container can be
 * pinned with position:absolute during crossfade transitions without escaping the wrapper.
 */

/** Persistent nav/logo outside the barba container — revealed once on initial load only. */
const PERSISTENT_NAV = '.logo-container, .nav, .nav-wrapper-mobile';

/**
 * Patch any inline stylesheet rule that sets display:none or opacity:0 !important on
 * .main-wrapper — these block GSAP and break layout measurement for the slider.
 * Replaces the rule with a clean opacity:0 so GSAP can animate it normally.
 */
const patchMainWrapperCSS = () => {
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href) continue; // only touch inline <style> blocks (Webflow custom code)
    try {
      const rules = Array.from(sheet.cssRules || []);
      for (let i = rules.length - 1; i >= 0; i--) {
        const rule = rules[i] as CSSStyleRule;
        if (rule.selectorText?.includes('main-wrapper')) {
          const hasDisplayNone = rule.style.display === 'none';
          const hasImportantOpacity = rule.style.getPropertyPriority('opacity') === 'important';
          if (hasDisplayNone || hasImportantOpacity) {
            sheet.deleteRule(i);
            sheet.insertRule('.main-wrapper { opacity: 0; }', i);
          }
        }
      }
    } catch {
      // Cross-origin sheets throw — skip silently
    }
  }
};

/**
 * If .main-wrapper is a child of the barba container (rather than being the container itself),
 * it carries CSS opacity:0 into every new page fetch. Reset it so the container-level fade works.
 */

const resetInnerMainWrapper = (container: HTMLElement) => {
  const inner = container.querySelector<HTMLElement>('.main-wrapper');
  if (inner) gsap.set(inner, { opacity: 1 });
};

window.Webflow ||= [];
window.Webflow.push(() => {
  greetUser('John Doe');

  const initialNamespace = document
    .querySelector('[data-barba-namespace]')
    ?.getAttribute('data-barba-namespace');

  // Patch any display:none or opacity:0 !important on .main-wrapper before anything runs.
  patchMainWrapperCSS();

  if (initialNamespace === 'home') {
    // Init while content is still opacity:0 so the slider measures and snaps before
    // anything is visible. opacity:0 elements are still in layout — getBoundingClientRect works.
    document.body.setAttribute('data-loop-slider-snap', '');
    initLoopSlider();
    initVideoPlayers();
  }

  barba.init({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ sync: true } as any), // run leave + enter simultaneously for a seamless crossfade
    preventRunning: true,
    transitions: [
      {
        name: 'fade',

        // ── Initial hard load ─────────────────────────────────────────────────────
        // barba's `once` fires on first visit instead of leave/enter.
        // gsap.set hides everything first — fallback in case Webflow CSS opacity:0
        // rules are missing. Real FOUC prevention requires the CSS in Webflow.
        async once(data) {
          gsap.set([data.next.container, PERSISTENT_NAV], { opacity: 0 });
          await new Promise<void>((resolve) => setTimeout(resolve, 400));
          await gsap.to([data.next.container, PERSISTENT_NAV], {
            opacity: 1,
            duration: 0.5,
            ease: 'power1.out',
          });
        },

        // ── Subsequent barba navigations ──────────────────────────────────────────
        // Pin the outgoing container so it overlays the incoming one during the crossfade.
        // Without this, both containers stack in DOM flow and the page doubles in height.
        async leave(data) {
          gsap.set(data.current.container, {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
          });
          await gsap.to(data.current.container, {
            opacity: 0,
            duration: 0.4,
            ease: 'power1.in',
          });
        },

        beforeEnter(data) {
          resetInnerMainWrapper(data.next.container);

          if (data.next.namespace === 'home') {
            // In barba's non-sync mode the new container is appended after the leaving
            // container in DOM flow. Slides appear completely off-screen →
            // getBoundingClientRect returns positions below the viewport →
            // _currentVisibility = 0 → all videos render at maximum blur.
            //
            // Fix: temporarily pin the container at the top of the viewport with
            // position:fixed so slider measurements reflect the real viewport position.
            // The fixed position is cleared in the home view's afterEnter hook once
            // barba has removed the old container.
            gsap.set(data.next.container, {
              opacity: 0,
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
            });
            document.body.setAttribute('data-loop-slider-snap', '');
            initLoopSlider();
            initVideoPlayers();
          } else {
            gsap.set(data.next.container, { opacity: 0 });
          }
        },

        async enter(data) {
          await gsap.to(data.next.container, {
            opacity: 1,
            duration: 0.4,
            ease: 'power1.out',
          });
        },
      },
    ],
    views: [
      {
        namespace: 'home',
        beforeLeave() {
          destroyLoopSlider();
        },
        afterEnter({ next: { container } }) {
          // afterEnter fires before barba removes the old container, so clearing
          // position:fixed here would push the new container below the old one
          // and cause a wrong re-measure. Defer one tick past barba's cleanup.
          setTimeout(() => {
            gsap.set(container, { clearProps: 'position,top,left,width' });
            remeasureLoopSlider();
          }, 0);
        },
      },
    ],
  });

  // Reset scroll position on every page transition.
  barba.hooks.enter(() => {
    window.scrollTo(0, 0);
  });

  // Webflow only sets w--current on hard load — refresh it after every barba transition.
  barba.hooks.after(() => {
    updateNavCurrentState();
  });
});
