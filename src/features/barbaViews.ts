import gsap from 'gsap';

import { hideForEntrance, playEntrance } from '$utils/entrance';

import { destroyCaseHeroOverlay, initCaseHeroOverlay } from './caseHeroOverlay';
import { destroyCaseHeroSound, initCaseHeroSound } from './caseHeroSound';
import { destroyCaseSliders, initCaseSliders } from './caseSlider';
import {
  destroyHomeFanWheel,
  initHomeFanWheel,
  refreshHomeFanWheel,
  revealHomeFanWheel,
} from './homeFanWheel';
import { waitForIntro, waitForPageReveal } from './introSequence';
import { destroyRenderToReality, initRenderToReality } from './renderToReality';
import {
  destroyHomeVideoPlayers,
  destroyPageVideoPlayers,
  initPageVideoPlayers,
} from './videoPlayer';
import {
  destroyWorkView,
  getStoredWorkViewMode,
  GRID_ITEM_SELECTOR,
  initWorkView,
} from './workView';

// About page blocks, staggered in this order: blurb, services title, each service card,
// statement + video, featured heading, each featured card.
const ABOUT_ENTRANCE_SELECTORS = [
  '.about-blurb',
  '.title-services',
  '.service-card',
  '.about-statement',
  '.top-projects-heading-flex',
  '.top-projects-card',
];

// Home: the fan wheel cards stagger in WebGL (revealHomeFanWheel); these DOM blocks run the
// same stagger alongside. .activecard-details is left out: the fan wheel owns its visibility.
const HOME_ENTRANCE_SELECTORS = ['.home-blurb-v3', '.section_about-video'];

// Case study: hero copy + the content just below it. The hero media is the section's
// background, so it fades in on its own (CASE_HERO_MEDIA_SELECTOR) rather than in the stagger.
const CASE_ENTRANCE_SELECTORS = [
  '.case-hero-details',
  '.case-hero-services',
  '.case-sound-toggle-wrapper',
  '.case-hero-heading > *',
];
const CASE_HERO_MEDIA_SELECTOR = '.component-case-header-top .case-hero-video';

// 404: label, statement, links — each direct child of the content block, in order.
const NOT_FOUND_ENTRANCE_SELECTORS = ['.notfound_content > *'];
const CASE_HERO_MEDIA_FADE = 0.8;

/** Items stagger in the order the selectors are listed (document order within each one). */
const getEntranceItems = (container: HTMLElement, selectors: string[]) =>
  selectors.flatMap((selector) => Array.from(container.querySelectorAll<HTMLElement>(selector)));

const getAboutEntranceItems = (container: HTMLElement) =>
  getEntranceItems(container, ABOUT_ENTRANCE_SELECTORS);

const getWorkEntranceItems = (container: HTMLElement, mode: string) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(mode === 'grid' ? GRID_ITEM_SELECTOR : '.worklist-item')
  );

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
      destroyHomeVideoPlayers();
      destroyPageVideoPlayers();
    },

    afterLeave() {
      destroyHomeFanWheel();
    },

    beforeEnter({ next }: Pick<ViewData, 'next'>) {
      initHomeFanWheel(next.container); // cards start hidden until revealHomeFanWheel()
      initPageVideoPlayers(next.container);
      hideForEntrance(getEntranceItems(next.container, HOME_ENTRANCE_SELECTORS));

      // NOTE: .home-blurb (position:fixed, mix-blend-mode:difference) is intentionally
      // NOT controlled separately. It fades with the container. The blend mode compositing
      // artifact during a 0.4s fade is imperceptible, and any separate timing creates
      // a visible delay that is far more noticeable.
    },

    afterEnter({ next }: Pick<ViewData, 'next'>) {
      waitForPageReveal().then(() => {
        playEntrance(getEntranceItems(next.container, HOME_ENTRANCE_SELECTORS));
      });
      // The cards wait until the intro overlay is fully gone (hard load) so the whole stagger is
      // visible rather than starting under the fading overlay. Barba navs: resolves immediately.
      waitForIntro().then(() => revealHomeFanWheel());

      // On direct loads with intro playing: wait for it to complete so the slider
      // remeasure fires after the overlay is gone (correct visibility state).
      // On barba transitions: waitForIntro resolves immediately.
      waitForIntro().then(() => {
        requestAnimationFrame(() => refreshHomeFanWheel());
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
      hideForEntrance(getAboutEntranceItems(next.container));
    },

    afterEnter({ next }: Pick<ViewData, 'next'>) {
      // Hard load: starts as the intro overlay fades. Barba nav: resolves immediately.
      waitForPageReveal().then(() => playEntrance(getAboutEntranceItems(next.container)));
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

      // Same stagger-in for both layouts; only the visible one is shown.
      const worklist = next.container.querySelector<HTMLElement>('.component-worklist');
      const workgrid = next.container.querySelector<HTMLElement>('.component-workgrid');
      if (savedMode === 'grid') {
        if (worklist) gsap.set(worklist, { display: 'none' });
        if (workgrid) gsap.set(workgrid, { display: 'block', opacity: 1 });
      } else {
        const expandPanels = next.container.querySelectorAll<HTMLElement>('.worklist-expand');
        expandPanels.forEach((el) => gsap.set(el, { display: 'none', height: 0, opacity: 0 }));
      }
      hideForEntrance(getWorkEntranceItems(next.container, savedMode));
    },

    afterEnter({ next }: Pick<ViewData, 'next'>) {
      const savedMode = getStoredWorkViewMode();

      // Hard load: starts as the intro overlay fades. Barba nav: resolves immediately.
      waitForPageReveal().then(() => {
        playEntrance(getWorkEntranceItems(next.container, savedMode), () =>
          initWorkView(next.container)
        );
      });
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
      initCaseHeroSound(next.container);
      initCaseHeroOverlay(next.container);
      initCaseSliders();
      initRenderToReality(next.container);

      const heroMedia = next.container.querySelector<HTMLElement>(CASE_HERO_MEDIA_SELECTOR);
      if (heroMedia) gsap.set(heroMedia, { opacity: 0 });
      hideForEntrance(getEntranceItems(next.container, CASE_ENTRANCE_SELECTORS));
    },

    afterEnter({ next }: Pick<ViewData, 'next'>) {
      waitForPageReveal().then(() => {
        const heroMedia = next.container.querySelector<HTMLElement>(CASE_HERO_MEDIA_SELECTOR);
        if (heroMedia) {
          gsap.to(heroMedia, {
            opacity: 1,
            duration: CASE_HERO_MEDIA_FADE,
            ease: 'power1.out',
            clearProps: 'opacity',
          });
        }
        playEntrance(getEntranceItems(next.container, CASE_ENTRANCE_SELECTORS));
      });
    },

    beforeLeave() {
      destroyCaseHeroSound();
      destroyCaseHeroOverlay();
      destroyCaseSliders();
      destroyRenderToReality();
      destroyPageVideoPlayers();
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 404 — Webflow's not-found page. Usually a hard load (barba falls back to a full
  // navigation when a fetch fails); its nav/links then navigate out via barba.
  // No intro on this page, so waitForPageReveal() resolves immediately.
  // ────────────────────────────────────────────────────────────────────────────
  {
    namespace: '404',

    beforeEnter({ next }: Pick<ViewData, 'next'>) {
      hideForEntrance(getEntranceItems(next.container, NOT_FOUND_ENTRANCE_SELECTORS));
    },

    afterEnter({ next }: Pick<ViewData, 'next'>) {
      waitForPageReveal().then(() =>
        playEntrance(getEntranceItems(next.container, NOT_FOUND_ENTRANCE_SELECTORS))
      );
    },
  },
];
