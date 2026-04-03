import gsap from 'gsap';

import { destroyLoopSlider, initLoopSlider, remeasureLoopSlider } from './loopSlider';
import { initAboutVideo, initVideoPlayers } from './videoPlayer';
import { destroyWorkView, initWorkView } from './workView';

// Minimal barba data shape — avoid importing @barba/core types just for views
type ViewData = {
  next: { container: HTMLElement; namespace: string };
  current: { container: HTMLElement; namespace: string };
};

export const barbaViews = [
  // ────────────────────────────────────────────────────────────────────────────
  // HOME
  // ────────────────────────────────────────────────────────────────────────────
  {
    namespace: 'home',

    beforeLeave() {
      destroyLoopSlider();
    },

    beforeEnter() {
      // Snap attribute ensures the slider measures and snaps focus/blur state
      // before anything is visible — prevents all-blurred initial render.
      document.body.setAttribute('data-loop-slider-snap', '');
      initLoopSlider();
      initVideoPlayers();

      // NOTE: .home-blurb (position:fixed, mix-blend-mode:difference) is intentionally
      // NOT controlled separately. It fades with the container. The blend mode compositing
      // artifact during a 0.4s fade is imperceptible, and any separate timing creates
      // a visible delay that is far more noticeable.
    },

    afterEnter() {
      // rAF ensures we're past the frame where GSAP settled container opacity.
      // This snaps _currentVisibility to correct values — without it, videos
      // stay at max blur until the user scrolls after a barba transition.
      requestAnimationFrame(() => {
        remeasureLoopSlider();
      });
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // ABOUT
  // Body theme (.dark) is applied by the transition's enter() via updateBodyTheme.
  // ────────────────────────────────────────────────────────────────────────────
  {
    namespace: 'about',

    beforeEnter() {
      initAboutVideo();
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // WORK
  // ────────────────────────────────────────────────────────────────────────────
  {
    namespace: 'work',

    beforeEnter({ next }: Pick<ViewData, 'next'>) {
      // Hide items before the container fades in so they stagger in after visible.
      const items = next.container.querySelectorAll<HTMLElement>('.worklist-item');
      if (items.length) gsap.set(items, { opacity: 0, y: 16 });
    },

    afterEnter({ next }: Pick<ViewData, 'next'>) {
      const items = next.container.querySelectorAll<HTMLElement>('.worklist-item');
      if (items.length) {
        gsap.to(items, {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'power2.out',
          stagger: 0.07,
          onComplete: () => {
            // Init view switcher after entry animation completes so initial
            // GSAP sets don't fight the stagger.
            initWorkView(next.container);
          },
        });
      } else {
        initWorkView(next.container);
      }
    },

    beforeLeave() {
      destroyWorkView();
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // CASES (future — case study template page)
  // ────────────────────────────────────────────────────────────────────────────
  {
    namespace: 'cases',
  },
];
