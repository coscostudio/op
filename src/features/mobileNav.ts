import gsap from 'gsap';

import { NAV_MOTION_DURATION, NAV_MOTION_EASE, setNavDrawerOpenState } from './nav';

let isOpen = false;
let triggerLink: HTMLElement | null = null;
let wrapper: HTMLElement | null = null;
let triggerText: HTMLElement | null = null;
let allLinks: HTMLElement[] = [];
let activeTl: gsap.core.Timeline | null = null;
let cleanupFns: Array<() => void> = [];

const DRAWER_PADDING_PROPS = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
const DRAWER_PADDING_CLEAR_PROPS = DRAWER_PADDING_PROPS.join(',');
const DRAWER_MEASURE_CLEAR_PROPS = 'position,visibility,pointerEvents';
const ZERO_DRAWER_PADDING = {
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
};

const getMotionDuration = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : NAV_MOTION_DURATION;

const resetActiveTimeline = () => {
  activeTl?.kill();
  activeTl = null;
};

const getDrawerPadding = (useNaturalPadding = false) => {
  if (!wrapper) return ZERO_DRAWER_PADDING;

  if (useNaturalPadding) {
    gsap.set(wrapper, { clearProps: DRAWER_PADDING_CLEAR_PROPS });
  }

  const styles = window.getComputedStyle(wrapper);

  return {
    paddingTop: styles.paddingTop,
    paddingRight: styles.paddingRight,
    paddingBottom: styles.paddingBottom,
    paddingLeft: styles.paddingLeft,
  };
};

const measureOpenDrawerHeight = (targetPadding: gsap.TweenVars) => {
  if (!wrapper) return 0;

  gsap.set(wrapper, {
    display: 'flex',
    height: 'auto',
    opacity: 1,
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'absolute',
    visibility: 'hidden',
    ...targetPadding,
  });

  return wrapper.getBoundingClientRect().height || wrapper.offsetHeight;
};

const open = () => {
  if (isOpen) return Promise.resolve();
  isOpen = true;

  resetActiveTimeline();
  gsap.killTweensOf([wrapper, ...allLinks].filter(Boolean));

  if (!wrapper) {
    setNavDrawerOpenState(true);
    if (triggerText) triggerText.textContent = 'Esc';
    return Promise.resolve();
  }

  const targetPadding = getDrawerPadding(true);
  const targetHeight = measureOpenDrawerHeight(targetPadding);
  gsap.set(wrapper, {
    clearProps: DRAWER_MEASURE_CLEAR_PROPS,
    display: 'flex',
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    ...ZERO_DRAWER_PADDING,
  });
  gsap.set(allLinks, { opacity: 0, y: 8 });

  setNavDrawerOpenState(true);
  if (triggerText) triggerText.textContent = 'Esc';

  return new Promise<void>((resolve) => {
    activeTl = gsap.timeline({
      defaults: { duration: getMotionDuration(), ease: NAV_MOTION_EASE },
      onComplete: () => {
        gsap.set(wrapper, {
          height: 'auto',
          opacity: 1,
          clearProps: `overflow,${DRAWER_PADDING_CLEAR_PROPS}`,
        });
        gsap.set(allLinks, { clearProps: 'opacity,y' });
        activeTl = null;
        resolve();
      },
    });

    activeTl.to(
      wrapper,
      { autoRound: false, height: targetHeight, opacity: 1, ...targetPadding },
      0
    );
    if (allLinks.length) activeTl.to(allLinks, { opacity: 1, y: 0 }, 0);
  });
};

const close = (immediate = false, keepLogoFull = false) => {
  if (!isOpen && !immediate) return Promise.resolve();
  isOpen = false;

  if (triggerText) triggerText.textContent = 'Menu';

  const targets = [wrapper, ...allLinks].filter(Boolean) as HTMLElement[];
  resetActiveTimeline();
  gsap.killTweensOf(targets);

  if (!wrapper) return Promise.resolve();

  if (immediate) {
    setNavDrawerOpenState(false);
    gsap.set(wrapper, {
      display: 'none',
      height: 0,
      opacity: 0,
      overflow: 'hidden',
      ...ZERO_DRAWER_PADDING,
    });
    if (allLinks.length) gsap.set(allLinks, { clearProps: 'opacity,y' });
    return Promise.resolve();
  }

  // Explicitly calculate current height so GSAP has a starting numeric value instead of "auto"
  const targetPadding = getDrawerPadding();
  const currentHeight = wrapper ? wrapper.getBoundingClientRect().height : 0;
  if (wrapper) gsap.set(wrapper, { height: currentHeight, overflow: 'hidden', ...targetPadding });

  setNavDrawerOpenState(false, keepLogoFull);

  return new Promise<void>((resolve) => {
    activeTl = gsap.timeline({
      defaults: { duration: getMotionDuration(), ease: NAV_MOTION_EASE },
      onComplete: () => {
        gsap.set(wrapper, {
          display: 'none',
          height: 0,
          opacity: 0,
          overflow: 'hidden',
          ...ZERO_DRAWER_PADDING,
        });
        if (allLinks.length) gsap.set(allLinks, { clearProps: 'opacity,y' });
        activeTl = null;
        resolve();
      },
    });

    activeTl.to(wrapper, { autoRound: false, height: 0, opacity: 0, ...ZERO_DRAWER_PADDING }, 0);
    if (allLinks.length) activeTl.to(allLinks, { opacity: 0, y: -8 }, 0);
  });
};

const handleTriggerClick = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  if (isOpen) {
    close();
  } else {
    open();
  }
};

const handleOutsideClick = (e: Event) => {
  if (!isOpen) return;
  const target = e.target as HTMLElement;
  if (!target.closest('.nav-unified')) close();
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close();
};

export const initMobileNav = () => {
  const navRoot = document.querySelector<HTMLElement>('.nav-unified');
  if (!navRoot) return;

  triggerLink = navRoot.querySelector<HTMLElement>('[nav-trigger="open-nav"], .nav-trigger');
  triggerText =
    triggerLink?.querySelector<HTMLElement>('.nav-trigger-text, .nav-link-text') ?? null;
  wrapper = navRoot.querySelector<HTMLElement>('.nav-drawer');

  if (!triggerLink || !wrapper) return;

  gsap.set(wrapper, {
    display: 'none',
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    ...ZERO_DRAWER_PADDING,
  });

  allLinks = Array.from(
    wrapper.querySelectorAll<HTMLElement>('.nav-link, .nav-link-simple, .nav-mobile-link')
  );

  triggerLink.addEventListener('click', handleTriggerClick);
  document.addEventListener('click', handleOutsideClick);
  document.addEventListener('touchend', handleOutsideClick, { passive: true });
  document.addEventListener('keydown', handleKeydown);

  cleanupFns = [
    () => triggerLink?.removeEventListener('click', handleTriggerClick),
    () => document.removeEventListener('click', handleOutsideClick),
    () => document.removeEventListener('touchend', handleOutsideClick),
    () => document.removeEventListener('keydown', handleKeydown),
  ];
};

export const destroyMobileNav = () => {
  close(true);
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  activeTl = null;
  triggerLink = null;
  wrapper = null;
  triggerText = null;
  allLinks = [];
};

export const closeMobileNav = (immediate = false, keepLogoFull = false) =>
  close(immediate, keepLogoFull);
