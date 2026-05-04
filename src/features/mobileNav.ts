import gsap from 'gsap';

// ── Module-level state ────────────────────────────────────────────────────────
let isOpen = false;
let triggerLink: HTMLElement | null = null;
let actualWrapper: HTMLElement | null = null;
let fakeWrapper: HTMLElement | null = null;
let actualContainer: HTMLElement | null = null;
let fakeContainer: HTMLElement | null = null;
let actualTriggerText: HTMLElement | null = null;
let fakeTriggerText: HTMLElement | null = null;
let allLinks: HTMLElement[] = [];
let cleanupFns: Array<() => void> = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute clip-path origin as the trigger button's center in container-local coords.
 * Called at open/close time so it accounts for any viewport shift.
 */
const getClipOrigin = (): string => {
  if (!triggerLink || !actualContainer) return '50% 0%';
  const tr = triggerLink.getBoundingClientRect();
  const cr = actualContainer.getBoundingClientRect();
  const ox = tr.left + tr.width / 2 - cr.left;
  const oy = tr.top + tr.height / 2 - cr.top;
  return `${ox}px ${oy}px`;
};

// ── Open / close ──────────────────────────────────────────────────────────────

const open = () => {
  isOpen = true;

  if (actualTriggerText) actualTriggerText.textContent = 'close';
  if (fakeTriggerText) fakeTriggerText.textContent = 'Close';

  // Reveal wrappers before measuring so container rects are valid.
  gsap.set([actualWrapper, fakeWrapper].filter(Boolean), { display: 'block' });

  const origin = getClipOrigin();
  const containers = [actualContainer, fakeContainer].filter(Boolean) as HTMLElement[];

  gsap.killTweensOf([...containers, ...allLinks]);

  // Clip-path circle reveal from trigger center.
  gsap.fromTo(
    containers,
    { clipPath: `circle(0px at ${origin})` },
    { clipPath: `circle(200vmax at ${origin})`, duration: 0.55, ease: 'power3.inOut' }
  );

  // Stagger links in after the reveal is underway.
  if (allLinks.length) {
    gsap.fromTo(
      allLinks,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.06, delay: 0.25 }
    );
  }
};

const close = (immediate = false) => {
  if (!isOpen && !immediate) return;
  isOpen = false;

  if (actualTriggerText) actualTriggerText.textContent = 'menu';
  if (fakeTriggerText) fakeTriggerText.textContent = 'Menu';

  const containers = [actualContainer, fakeContainer].filter(Boolean) as HTMLElement[];
  const wrappers = [actualWrapper, fakeWrapper].filter(Boolean) as HTMLElement[];

  gsap.killTweensOf([...containers, ...allLinks]);

  if (immediate) {
    gsap.set(containers, { clipPath: '' });
    gsap.set(wrappers, { display: 'none' });
    if (allLinks.length) gsap.set(allLinks, { clearProps: 'opacity,y' });
    return;
  }

  const origin = getClipOrigin();

  // Quick link fade, then collapse.
  if (allLinks.length) {
    gsap.to(allLinks, { opacity: 0, y: -6, duration: 0.15, ease: 'power2.in', stagger: 0.03 });
  }

  gsap.to(containers, {
    clipPath: `circle(0px at ${origin})`,
    duration: 0.45,
    ease: 'power3.inOut',
    delay: 0.05,
    onComplete: () => {
      gsap.set(containers, { clipPath: '' });
      gsap.set(wrappers, { display: 'none' });
      if (allLinks.length) gsap.set(allLinks, { clearProps: 'opacity,y' });
    },
  });
};

// ── Event handlers ────────────────────────────────────────────────────────────

const handleTriggerClick = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  isOpen ? close() : open();
};

const handleOutsideClick = (e: Event) => {
  if (!isOpen) return;
  const target = e.target as HTMLElement;
  if (!target.closest('nav.nav') && !target.closest('aside.nav')) {
    close();
  }
};

// ── Public API ────────────────────────────────────────────────────────────────

export const initMobileNav = () => {
  const actualNav = document.querySelector<HTMLElement>('nav.nav');
  const fakeNav = document.querySelector<HTMLElement>('aside.nav');
  if (!actualNav || !fakeNav) return;

  triggerLink = actualNav.querySelector<HTMLElement>('[nav-trigger="open-nav"]');
  actualTriggerText = triggerLink?.querySelector<HTMLElement>('.nav-link-text') ?? null;
  fakeTriggerText = fakeNav.querySelector<HTMLElement>('.nav-mobile-trigger .nav-link-text') ?? null;
  actualWrapper = actualNav.querySelector<HTMLElement>('.nav-wrapper-mobile');
  fakeWrapper = fakeNav.querySelector<HTMLElement>('.nav-wrapper-mobile');
  actualContainer = actualNav.querySelector<HTMLElement>('.nav-container-mobile');
  fakeContainer = fakeNav.querySelector<HTMLElement>('.nav-container-mobile');

  if (!triggerLink || !actualWrapper || !fakeWrapper || !actualContainer || !fakeContainer) return;

  // Both layers overlay each other — animate all link elements together.
  allLinks = [
    ...Array.from(actualContainer.querySelectorAll<HTMLElement>('.nav-mobile-link')),
    ...Array.from(fakeContainer.querySelectorAll<HTMLElement>('.nav-mobile-link')),
  ];

  triggerLink.addEventListener('click', handleTriggerClick);
  document.addEventListener('click', handleOutsideClick);
  document.addEventListener('touchend', handleOutsideClick, { passive: true });

  cleanupFns = [
    () => triggerLink?.removeEventListener('click', handleTriggerClick),
    () => document.removeEventListener('click', handleOutsideClick),
    () => document.removeEventListener('touchend', handleOutsideClick),
  ];
};

export const destroyMobileNav = () => {
  close(true);
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  triggerLink = null;
  actualWrapper = null;
  fakeWrapper = null;
  actualContainer = null;
  fakeContainer = null;
  allLinks = [];
};

/** Close without animation — use in barba before hook so transitions are clean. */
export const closeMobileNav = (immediate = false) => close(immediate);
