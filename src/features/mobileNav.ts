import gsap from 'gsap';

import { NAV_MOTION_DURATION, NAV_MOTION_EASE, setNavDrawerOpenState } from './nav';

let isOpen = false;
let triggerLink: HTMLElement | null = null;
let wrapper: HTMLElement | null = null;
let triggerText: HTMLElement | null = null;
let allLinks: HTMLElement[] = [];
let activeTl: gsap.core.Timeline | null = null;
let cleanupFns: Array<() => void> = [];

const getMotionDuration = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : NAV_MOTION_DURATION;

const resetActiveTimeline = () => {
  activeTl?.kill();
  activeTl = null;
};

const open = () => {
  if (isOpen) return Promise.resolve();
  isOpen = true;
  setNavDrawerOpenState(true);

  if (triggerText) triggerText.textContent = 'Esc';

  resetActiveTimeline();
  gsap.killTweensOf([wrapper, ...allLinks].filter(Boolean));

  if (!wrapper) return Promise.resolve();

  gsap.set(wrapper, { display: 'flex', overflow: 'hidden' });
  gsap.set(allLinks, { opacity: 0, y: 8 });

  return new Promise<void>((resolve) => {
    activeTl = gsap.timeline({
      defaults: { duration: getMotionDuration(), ease: NAV_MOTION_EASE },
      onComplete: () => {
        gsap.set(wrapper, { height: 'auto', opacity: 1, clearProps: 'overflow' });
        gsap.set(allLinks, { clearProps: 'opacity,y' });
        activeTl = null;
        resolve();
      },
    });

    activeTl.to(wrapper, { height: 'auto', opacity: 1 }, 0);
    if (allLinks.length) activeTl.to(allLinks, { opacity: 1, y: 0 }, 0);
  });
};

const close = (immediate = false) => {
  if (!isOpen && !immediate) return Promise.resolve();
  isOpen = false;

  if (triggerText) triggerText.textContent = 'Menu';

  const targets = [wrapper, ...allLinks].filter(Boolean) as HTMLElement[];
  resetActiveTimeline();
  gsap.killTweensOf(targets);

  if (!wrapper) return Promise.resolve();

  if (immediate) {
    setNavDrawerOpenState(false);
    gsap.set(wrapper, { display: 'none', height: 0, opacity: 0, clearProps: 'overflow' });
    if (allLinks.length) gsap.set(allLinks, { clearProps: 'opacity,y' });
    return Promise.resolve();
  }

  setNavDrawerOpenState(false);

  // Explicitly calculate current height so GSAP has a starting numeric value instead of "auto"
  const currentHeight = wrapper ? wrapper.offsetHeight : 0;
  if (wrapper) gsap.set(wrapper, { height: currentHeight, overflow: 'hidden' });

  return new Promise<void>((resolve) => {
    activeTl = gsap.timeline({
      defaults: { duration: getMotionDuration(), ease: NAV_MOTION_EASE },
      onComplete: () => {
        gsap.set(wrapper, { display: 'none', height: 0, opacity: 0, clearProps: 'overflow' });
        if (allLinks.length) gsap.set(allLinks, { clearProps: 'opacity,y' });
        activeTl = null;
        resolve();
      },
    });

    activeTl.to(wrapper, { height: 0, opacity: 0 }, 0);
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

export const closeMobileNav = (immediate = false) => close(immediate);
