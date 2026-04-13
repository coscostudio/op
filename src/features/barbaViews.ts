import gsap from 'gsap';

import { destroyCaseSliders, initCaseSliders } from './caseSlider';
import { destroyLoopSlider, initLoopSlider, remeasureLoopSlider } from './loopSlider';
import {
  destroyHomeVideoPlayers,
  destroyPageVideoPlayers,
  initPageVideoPlayers,
  initVideoPlayers,
} from './videoPlayer';
import { destroyWorkView, getStoredWorkViewMode, initWorkView } from './workView';

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
      destroyHomeVideoPlayers();
      destroyPageVideoPlayers();
    },

    beforeEnter({ next }: Pick<ViewData, 'next'>) {
      // Snap attribute ensures the slider measures and snaps focus/blur state
      // before anything is visible — prevents all-blurred initial render.
      document.body.setAttribute('data-loop-slider-snap', '');
      initLoopSlider();
      initVideoPlayers();
      initPageVideoPlayers(next.container);

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

    beforeEnter({ next }: Pick<ViewData, 'next'>) {
      destroyPageVideoPlayers();
      initPageVideoPlayers(next.container);
    },

    beforeLeave() {
      destroyPageVideoPlayers();
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // WORK
  // ────────────────────────────────────────────────────────────────────────────
  {
    namespace: 'work',

    beforeEnter({ next }: Pick<ViewData, 'next'>) {
      destroyPageVideoPlayers();
      initPageVideoPlayers(next.container);

      const savedMode = getStoredWorkViewMode();

      // Set the active toggle class immediately so it's correct the moment the
      // container fades in — not after the stagger animation completes.
      next.container.querySelectorAll<HTMLElement>('.view-toggle').forEach((el) => {
        el.classList.toggle('is-active', el.getAttribute('viewTrigger') === savedMode);
      });

      if (savedMode === 'grid') {
        // Hide worklist, reveal workgrid at opacity 0 for stagger entry
        const worklist = next.container.querySelector<HTMLElement>('.component-worklist');
        const workgrid = next.container.querySelector<HTMLElement>('.component-workgrid');
        if (worklist) gsap.set(worklist, { display: 'none' });
        if (workgrid) gsap.set(workgrid, { display: 'block', opacity: 0 });
        const gridItems = next.container.querySelectorAll<HTMLElement>('.workgrid-item');
        if (gridItems.length) gsap.set(Array.from(gridItems), { opacity: 0, y: 16 });
      } else {
        // list or list-expanded: hide worklist items for stagger, hide expand panels
        const items = next.container.querySelectorAll<HTMLElement>('.worklist-item');
        if (items.length) gsap.set(Array.from(items), { opacity: 0, y: 16 });
        const expandPanels = next.container.querySelectorAll<HTMLElement>('.worklist-expand');
        expandPanels.forEach((el) => gsap.set(el, { display: 'none', height: 0, opacity: 0 }));
      }
    },

    afterEnter({ next }: Pick<ViewData, 'next'>) {
      const savedMode = getStoredWorkViewMode();

      if (savedMode === 'grid') {
        const workgrid = next.container.querySelector<HTMLElement>('.component-workgrid');
        const gridItems = Array.from(
          next.container.querySelectorAll<HTMLElement>('.workgrid-item')
        );

        if (workgrid) {
          gsap.to(workgrid, { opacity: 1, duration: 0.45, ease: 'power2.out', overwrite: 'auto' });
        }
        if (gridItems.length) {
          gsap.to(gridItems, {
            opacity: 1,
            y: 0,
            duration: 0.45,
            ease: 'power2.out',
            stagger: 0.07,
            onComplete: () => initWorkView(next.container),
          });
        } else {
          initWorkView(next.container);
        }
      } else {
        // list or list-expanded
        const items = Array.from(next.container.querySelectorAll<HTMLElement>('.worklist-item'));
        if (items.length) {
          gsap.to(items, {
            opacity: 1,
            y: 0,
            duration: 0.45,
            ease: 'power2.out',
            stagger: 0.07,
            onComplete: () => initWorkView(next.container),
          });
        } else {
          initWorkView(next.container);
        }
      }
    },

    beforeLeave() {
      destroyWorkView();
      destroyPageVideoPlayers();
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // CASES (future — case study template page)
  // ────────────────────────────────────────────────────────────────────────────
  {
    namespace: 'cases',

    beforeEnter({ next }: Pick<ViewData, 'next'>) {
      destroyPageVideoPlayers();
      initPageVideoPlayers(next.container);
      initCaseSliders();
    },

    beforeLeave() {
      destroyCaseSliders();
      destroyPageVideoPlayers();
    },
  },
];
